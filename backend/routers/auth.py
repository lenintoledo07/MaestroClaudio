"""Google OAuth2: login, callback, logout, /me."""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from config import settings
from database import get_db
from models.schemas import UserResponse
from services.auth_service import (
    create_session_token,
    encrypt_token,
    get_current_user,
    make_session_cookie_kwargs,
)

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

GOOGLE_SCOPES = " ".join(
    [
        "openid",
        "profile",
        "email",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
    ]
)

OAUTH_STATE_COOKIE = "oauth_state"


@router.get("/google")
async def google_login() -> RedirectResponse:
    """Genera la URL de autorización de Google y redirige al usuario."""
    state = secrets.token_urlsafe(32)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",   # imprescindible para obtener refresh_token
        "prompt": "consent",        # fuerza el consent para que SIEMPRE devuelva refresh
        "state": state,
        "include_granted_scopes": "true",
    }
    redirect = RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    redirect.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=600,
        path="/",
    )
    return redirect


@router.get("/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    oauth_state: str | None = Cookie(default=None, alias=OAUTH_STATE_COOKIE),
    db: "asyncpg.Connection" = Depends(get_db),
) -> RedirectResponse:
    """Recibe el code, intercambia por tokens, crea/actualiza usuario,
    setea cookie de sesión y redirige al frontend.
    """
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google OAuth error: {error}",
        )
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Sin código de Google"
        )
    if not oauth_state or state != oauth_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="State inválido (CSRF check failed)",
        )

    # 1. Intercambiar code por tokens
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            logger.error("Google token exchange falló: %s", token_resp.text[:300])
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo intercambiar el code por tokens",
            )
        token_data = token_resp.json()

        # 2. Obtener perfil del usuario
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            logger.error("Google userinfo falló: %s", userinfo_resp.text[:300])
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo leer el perfil de Google",
            )
        userinfo = userinfo_resp.json()

    # 3. Calcular expiry y armar el blob a guardar
    expires_in = token_data.get("expires_in", 3600)
    google_token_blob = {
        "access_token": token_data["access_token"],
        "refresh_token": token_data.get("refresh_token"),
        "scope": token_data.get("scope"),
        "token_type": token_data.get("token_type", "Bearer"),
        "expiry": (
            datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        ).isoformat(),
    }
    encrypted = encrypt_token(google_token_blob)

    # 4. Upsert user
    user_row = await db.fetchrow(
        """
        INSERT INTO users (google_id, email, name, google_token)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (google_id) DO UPDATE
            SET email = EXCLUDED.email,
                name = EXCLUDED.name,
                google_token = COALESCE(
                    -- Si Google no nos dio refresh_token nuevo, conservar el viejo
                    CASE WHEN EXCLUDED.google_token::jsonb -> 'ct' IS NOT NULL
                         THEN EXCLUDED.google_token
                         ELSE users.google_token
                    END,
                    users.google_token
                )
        RETURNING id, email, name
        """,
        userinfo["sub"],
        userinfo.get("email"),
        userinfo.get("name"),
        json.dumps(encrypted),
    )

    # Si vino sin refresh_token (re-login del mismo user) y el nuevo blob no
    # lo tiene, preservamos el refresh viejo manualmente.
    if google_token_blob["refresh_token"] is None:
        existing = await db.fetchval(
            "SELECT google_token FROM users WHERE id = $1", user_row["id"]
        )
        if existing:
            try:
                from services.auth_service import decrypt_token
                old = decrypt_token(existing)
                if old.get("refresh_token"):
                    google_token_blob["refresh_token"] = old["refresh_token"]
                    await db.execute(
                        "UPDATE users SET google_token = $1 WHERE id = $2",
                        json.dumps(encrypt_token(google_token_blob)),
                        user_row["id"],
                    )
            except Exception:  # noqa: BLE001
                logger.warning("No se pudo preservar refresh_token previo")

    # 5. Crear cookie de sesión y redirigir al frontend
    session_token = create_session_token(user_row["id"])
    redirect = RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard")
    redirect.set_cookie(**make_session_cookie_kwargs(session_token))
    redirect.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return redirect


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/")
    return {"message": "logged out"}


@router.get("/me", response_model=UserResponse)
async def me(user: dict = Depends(get_current_user)) -> UserResponse:
    return UserResponse(**user)

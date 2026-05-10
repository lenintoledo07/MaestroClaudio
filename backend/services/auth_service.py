"""Auth service: Fernet encrypt/decrypt, JWT cookies, Google token refresh."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from uuid import UUID

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt

from config import settings
from database import get_db

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)

# ── Fernet: derivamos una key estable a partir de SECRET_KEY ────────────────
# Fernet exige una clave de 32 bytes URL-safe base64. SECRET_KEY puede ser
# cualquier string ≥16 chars, así que la pasamos por SHA-256 → 32 bytes.
_FERNET_KEY = base64.urlsafe_b64encode(
    hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
)
_fernet = Fernet(_FERNET_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# Encriptación de tokens de Google (van en users.google_token JSONB)
# ─────────────────────────────────────────────────────────────────────────────

def encrypt_token(payload: dict) -> dict:
    """Devuelve un dict JSONB serializable: {"v": 1, "ct": "..."}."""
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ct = _fernet.encrypt(raw).decode("utf-8")
    return {"v": 1, "ct": ct}


def decrypt_token(encrypted: dict) -> dict:
    if not encrypted or "ct" not in encrypted:
        raise ValueError("Token encriptado inválido")
    try:
        raw = _fernet.decrypt(encrypted["ct"].encode("utf-8"))
    except InvalidToken as exc:
        raise ValueError("No se pudo desencriptar el token") from exc
    return json.loads(raw.decode("utf-8"))


# ─────────────────────────────────────────────────────────────────────────────
# JWT de sesión (HTTPOnly cookie)
# ─────────────────────────────────────────────────────────────────────────────

def create_session_token(user_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.JWT_EXPIRES_DAYS)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_session_token(token: str) -> UUID:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada",
        ) from exc
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin sub"
        )
    try:
        return UUID(sub)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="user_id inválido"
        ) from exc


# ─────────────────────────────────────────────────────────────────────────────
# Dependencia FastAPI: usuario autenticado
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    db: "asyncpg.Connection" = Depends(get_db),
) -> dict:
    """Lee la sesión desde:
      1) Authorization: Bearer <jwt>   (mobile / MCP / clientes server-side)
      2) Cookie SESSION_COOKIE_NAME    (web)
    El JWT es el mismo en ambos casos (mismo `create_session_token`).
    """
    token: str | None = None
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(None, 1)[1].strip() or None
    if not token:
        token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Sin sesión"
        )
    user_id = decode_session_token(token)
    return await _load_user(db, user_id)


async def _load_user(db: "asyncpg.Connection", user_id: UUID) -> dict:
    row = await db.fetchrow(
        """
        SELECT id, google_id, email, name, drive_folder_id,
               timezone, whatsapp_number, push_token, google_token
        FROM users
        WHERE id = $1
        """,
        user_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no existe"
        )
    return dict(row)


def make_session_cookie_kwargs(token: str) -> dict:
    """Parámetros estándar para Response.set_cookie()."""
    return {
        "key": settings.SESSION_COOKIE_NAME,
        "value": token,
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": "lax",
        "max_age": settings.JWT_EXPIRES_DAYS * 24 * 3600,
        "path": "/",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Refresh de Google access_token con lock por usuario (anti-race entre workers)
# ─────────────────────────────────────────────────────────────────────────────

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

_refresh_locks: dict[UUID, asyncio.Lock] = {}


def _lock_for(user_id: UUID) -> asyncio.Lock:
    lock = _refresh_locks.get(user_id)
    if lock is None:
        lock = asyncio.Lock()
        _refresh_locks[user_id] = lock
    return lock


def _is_expired(token: dict, skew_seconds: int = 60) -> bool:
    expiry = token.get("expiry")
    if not expiry:
        return True
    if isinstance(expiry, str):
        try:
            expiry_dt = datetime.fromisoformat(expiry)
        except ValueError:
            return True
    else:
        expiry_dt = datetime.fromtimestamp(expiry, tz=timezone.utc)
    if expiry_dt.tzinfo is None:
        expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
    return expiry_dt <= datetime.now(timezone.utc) + timedelta(seconds=skew_seconds)


async def get_valid_google_token(
    db: "asyncpg.Connection", user_id: UUID
) -> dict:
    """Devuelve un token con access_token válido. Refresca si está por expirar.

    El lock por user_id evita que dos workers concurrentes refresquen al mismo
    tiempo (lo que invalidaría el primer access_token devuelto por Google).
    """
    async with _lock_for(user_id):
        row = await db.fetchrow(
            "SELECT google_token FROM users WHERE id = $1", user_id
        )
        if not row or not row["google_token"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuario sin tokens de Google",
            )
        token = decrypt_token(row["google_token"])

        if not _is_expired(token):
            return token

        refresh_token = token.get("refresh_token")
        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sin refresh_token de Google. Vuelve a iniciar sesión.",
            )

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        if resp.status_code != 200:
            logger.warning(
                "Refresh Google falló para user=%s status=%s body=%s",
                user_id, resp.status_code, resp.text[:200],
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No se pudo refrescar el token de Google",
            )

        data = resp.json()
        new_access = data["access_token"]
        expires_in = data.get("expires_in", 3600)
        new_token = {
            **token,
            "access_token": new_access,
            "expiry": (
                datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            ).isoformat(),
        }
        # Google a veces no devuelve refresh_token nuevo (lo conserva el viejo)
        if "refresh_token" in data:
            new_token["refresh_token"] = data["refresh_token"]

        await db.execute(
            "UPDATE users SET google_token = $1 WHERE id = $2",
            json.dumps(encrypt_token(new_token)),
            user_id,
        )
        return new_token

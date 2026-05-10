"""Endpoints relacionados con el user actual (mobile push token, etc)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import get_db
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


class PushTokenPayload(BaseModel):
    token: str


@router.post("/push-token")
async def register_push_token(
    payload: PushTokenPayload,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Guarda el Expo Push Token del dispositivo del usuario.

    Llamado por la app mobile al startup (Fase 6.3). El token se usa después
    en `push_notification_service.send_push()` para mandar notifications via
    Expo Push API.
    """
    if not payload.token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Token vacío"
        )
    await db.execute(
        "UPDATE users SET push_token = $1 WHERE id = $2",
        payload.token, user["id"],
    )
    return {"ok": True}


@router.delete("/push-token")
async def clear_push_token(
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Elimina el push token (logout o uninstall)."""
    await db.execute(
        "UPDATE users SET push_token = NULL WHERE id = $1",
        user["id"],
    )
    return {"ok": True}

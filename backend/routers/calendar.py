"""Endpoints de Google Calendar (Fase 5.1)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from services import calendar_service
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.post("/sync")
async def force_sync(
    user: dict = Depends(get_current_user),
):
    """Trigger manual del sync. Devuelve resumen { synced, new, updated }."""
    try:
        return await calendar_service.sync_user_calendar(user["id"])
    except Exception as exc:  # noqa: BLE001
        logger.exception("calendar sync error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Calendar sync falló: {exc}",
        )


@router.get("/weekly-status")
async def weekly_status(
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Estado de la semana actual por curso."""
    return await calendar_service.get_weekly_status(user["id"], db)

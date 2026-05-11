"""Endpoints relacionados con el user actual (perfil, push token, Drive raíz)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_db
from services import drive_service
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


# ── Perfil del user ─────────────────────────────────────────────────────────


class UserUpdate(BaseModel):
    drive_folder_id: str | None = None
    timezone: str | None = None
    whatsapp_number: str | None = None


@router.patch("/me")
async def update_me(
    payload: UserUpdate,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Actualiza campos básicos del user. Normaliza drive_folder_id si vino
    como URL (extrae el ID puro)."""
    updates: dict = {}

    if payload.drive_folder_id is not None:
        raw = payload.drive_folder_id.strip()
        if raw == "":
            updates["drive_folder_id"] = None
        else:
            normalized = drive_service.extract_file_id_from_url(raw) or raw
            # Verificar que sea una carpeta accesible — si no, devolver 400
            # con mensaje útil en vez de fallar más tarde con un 500.
            try:
                meta = await drive_service.get_folder_metadata(user["id"], normalized)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No pude verificar la carpeta de Drive: {exc}",
                )
            updates["drive_folder_id"] = meta["id"]

    if payload.timezone is not None:
        updates["timezone"] = payload.timezone
    if payload.whatsapp_number is not None:
        updates["whatsapp_number"] = payload.whatsapp_number or None

    if not updates:
        return await _fetch_me(db, user["id"])

    set_parts = []
    args: list = []
    for i, (k, v) in enumerate(updates.items(), start=1):
        set_parts.append(f"{k} = ${i}")
        args.append(v)
    args.append(user["id"])

    sql = f"UPDATE users SET {', '.join(set_parts)} WHERE id = ${len(args)}"
    await db.execute(sql, *args)
    return await _fetch_me(db, user["id"])


async def _fetch_me(db: "asyncpg.Connection", user_id) -> dict:
    row = await db.fetchrow(
        """
        SELECT id, email, name, drive_folder_id, timezone, whatsapp_number, push_token
        FROM users WHERE id = $1
        """,
        user_id,
    )
    return dict(row)


# ── Drive: listar subfolders de la carpeta raíz del user ────────────────────


@router.get("/me/drive/folders")
async def list_my_drive_folders(
    parent_id: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    """Lista las subcarpetas de la carpeta raíz del user en Google Drive.

    - Si `parent_id` viene en el query, lista las subfolders de ese folder.
    - Si no, usa `users.drive_folder_id` (la carpeta raíz que el user configuró).
    - Si el user no tiene drive_folder_id configurado, devuelve 400.

    Útil para que CourseModal muestre un dropdown de carpetas (cada subfolder
    suele ser una materia: "HE-01 Hacking Ético", "CNR-02 Normativa", etc.).
    """
    target = parent_id or user.get("drive_folder_id")
    if not target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No tenés carpeta raíz de Drive configurada. "
                   "Andá a Ajustes → Google Drive y pegá el link de tu carpeta.",
        )
    try:
        folders = await drive_service.list_subfolders(user["id"], target)
    except Exception as exc:  # noqa: BLE001
        logger.exception("drive list_subfolders failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No pude listar la carpeta: {exc}",
        )
    return [{"id": f["id"], "name": f["name"]} for f in folders]


# ── Push token (mobile) ─────────────────────────────────────────────────────


class PushTokenPayload(BaseModel):
    token: str


@router.post("/push-token")
async def register_push_token(
    payload: PushTokenPayload,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Guarda el Expo Push Token del dispositivo del usuario."""
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

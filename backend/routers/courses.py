"""CRUD de materias (courses)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from database import get_db
from models.schemas import (
    CourseCreate,
    CourseDeleteRequest,
    CourseResponse,
    CourseUpdate,
)
from services import course_service, drive_service
from services.auth_service import get_current_user

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    import asyncpg

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=list[CourseResponse])
async def list_courses(
    status_filter: str | None = Query(default=None, alias="status"),
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await course_service.list_courses(db, user["id"], status_filter)


@router.post("", response_model=CourseResponse, status_code=201)
async def create_course(
    payload: CourseCreate,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await course_service.create_course(db, user["id"], payload)


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await course_service.get_course(db, user["id"], course_id)


@router.patch("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: UUID,
    payload: CourseUpdate,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await course_service.update_course(db, user["id"], course_id, payload)


@router.delete("/{course_id}")
async def delete_course(
    course_id: UUID,
    payload: CourseDeleteRequest,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Soft delete. Requiere body {confirm: true}."""
    return await course_service.soft_delete_course(
        db, user["id"], course_id, payload.confirm
    )


@router.post("/{course_id}/restore", response_model=CourseResponse)
async def restore_course(
    course_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await course_service.restore_course(db, user["id"], course_id)


# ── Drive folder browse ─────────────────────────────────────────────────────


@router.get("/{course_id}/drive/files")
async def list_course_drive_files(
    course_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Lista archivos de la carpeta de Drive linkeada al curso.

    Devuelve solo videos / pdf / pptx (los tipos que el pipeline soporta).
    Cada item: {id, name, mime_type, type, size, modified_time, already_imported}.
    `already_imported=True` si ya hay un material con ese drive_file_id en el curso.
    """
    course = await course_service.get_course(db, user["id"], course_id)
    folder_id = course.drive_folder_id
    if not folder_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta materia no tiene una carpeta de Drive linkeada. "
                   "Editala y pegá el ID/URL de la carpeta.",
        )

    # Por si pegaron una URL en vez de un ID puro
    folder_id = drive_service.extract_file_id_from_url(folder_id) or folder_id

    try:
        items = await drive_service.list_folder_contents(user["id"], folder_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Drive list failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No pude listar la carpeta: {exc}",
        )

    imported_ids = {
        r["drive_file_id"]
        for r in await db.fetch(
            "SELECT drive_file_id FROM materials WHERE course_id = $1 AND drive_file_id IS NOT NULL",
            course_id,
        )
    }

    result = []
    for it in items:
        ftype = drive_service.detect_file_type(it.get("mimeType", ""))
        if ftype == "unknown":
            continue
        result.append({
            "id": it["id"],
            "name": it["name"],
            "mime_type": it["mimeType"],
            "type": ftype,
            "size": int(it["size"]) if it.get("size") else None,
            "modified_time": it.get("modifiedTime"),
            "already_imported": it["id"] in imported_ids,
        })
    result.sort(key=lambda x: x.get("modified_time") or "", reverse=True)
    return result

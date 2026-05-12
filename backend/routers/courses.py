"""CRUD de materias (courses)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_db
from models.schemas import (
    CourseCreate,
    CourseDeleteRequest,
    CourseResponse,
    CourseUpdate,
)
from services import course_service, drive_service, mindmap_service
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


_FOLDER_MIME = "application/vnd.google-apps.folder"


@router.get("/{course_id}/drive/files")
async def list_course_drive_files(
    course_id: UUID,
    folder_id: str | None = None,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Lista contenido de la carpeta de Drive del curso (o de una subcarpeta).

    Si `folder_id` viene en query, lista esa subcarpeta. Si no, la carpeta raíz
    linkeada al curso. Devuelve archivos compatibles (video/pdf/pptx) y también
    subcarpetas para permitir navegación.

    Cada item: {id, name, mime_type, type, size, modified_time, is_folder,
    already_imported}. `is_folder=true` indica que es navegable; `type='folder'`
    en ese caso. `already_imported` solo aplica a archivos.
    """
    course = await course_service.get_course(db, user["id"], course_id)
    root_folder_id = course.drive_folder_id
    if not root_folder_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta materia no tiene una carpeta de Drive linkeada. "
                   "Editala y pegá el ID/URL de la carpeta.",
        )

    # Por si pegaron una URL en vez de un ID puro
    root_folder_id = drive_service.extract_file_id_from_url(root_folder_id) or root_folder_id
    # Carpeta a listar: la raíz del curso o la subcarpeta solicitada
    target_folder_id = folder_id or root_folder_id

    try:
        items = await drive_service.list_folder_contents(user["id"], target_folder_id)
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

    folders: list[dict] = []
    files: list[dict] = []
    for it in items:
        mime = it.get("mimeType", "")
        if mime == _FOLDER_MIME:
            folders.append({
                "id": it["id"],
                "name": it["name"],
                "mime_type": mime,
                "type": "folder",
                "size": None,
                "modified_time": it.get("modifiedTime"),
                "is_folder": True,
                "already_imported": False,
            })
            continue
        ftype = drive_service.detect_file_type(mime)
        if ftype == "unknown":
            continue
        files.append({
            "id": it["id"],
            "name": it["name"],
            "mime_type": mime,
            "type": ftype,
            "size": int(it["size"]) if it.get("size") else None,
            "modified_time": it.get("modifiedTime"),
            "is_folder": False,
            "already_imported": it["id"] in imported_ids,
        })

    folders.sort(key=lambda x: x["name"].lower())
    files.sort(key=lambda x: x.get("modified_time") or "", reverse=True)
    # Carpetas primero para que sean fáciles de ver
    return folders + files


# ── Mind map agregado por curso ────────────────────────────────────────────


class CourseMindMapResponse(BaseModel):
    course_id: UUID
    markdown: str
    generated_at: str | None
    cached: bool


async def _ensure_course_owned(db, user_id, course_id):
    owned = await db.fetchval(
        "SELECT 1 FROM courses WHERE id = $1 AND user_id = $2 AND status != 'deleted'",
        course_id, user_id,
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Curso no encontrado")


@router.get("/{course_id}/mindmap", response_model=CourseMindMapResponse)
async def get_course_mindmap(
    course_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Devuelve el mapa conceptual AGREGADO del curso, o lo genera al vuelo
    si no existe. Primera invocación dispara Claude Sonnet (~$0.05, ~15-25s)
    porque es agregación cruzada de signals. Las siguientes se sirven cacheadas.
    """
    await _ensure_course_owned(db, user["id"], course_id)
    row = await db.fetchrow(
        "SELECT mind_map_markdown, mind_map_generated_at FROM courses WHERE id = $1",
        course_id,
    )
    if row and row["mind_map_markdown"]:
        return CourseMindMapResponse(
            course_id=course_id,
            markdown=row["mind_map_markdown"],
            generated_at=row["mind_map_generated_at"].isoformat() if row["mind_map_generated_at"] else None,
            cached=True,
        )

    try:
        markdown = await mindmap_service.generate_course_mindmap(db, course_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("course mindmap generation failed course=%s", course_id)
        raise HTTPException(
            status_code=502,
            detail=f"No pude generar el mapa del curso: {type(exc).__name__}: {str(exc)[:200]}",
        )

    fresh = await db.fetchrow(
        "SELECT mind_map_generated_at FROM courses WHERE id = $1",
        course_id,
    )
    return CourseMindMapResponse(
        course_id=course_id,
        markdown=markdown,
        generated_at=fresh["mind_map_generated_at"].isoformat() if fresh and fresh["mind_map_generated_at"] else None,
        cached=False,
    )


@router.post("/{course_id}/mindmap/regenerate", response_model=CourseMindMapResponse)
async def regenerate_course_mindmap(
    course_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Fuerza regeneración del mapa del curso aunque haya caché. Útil cuando
    se agregaron clases nuevas y el mapa quedó desactualizado."""
    await _ensure_course_owned(db, user["id"], course_id)
    try:
        markdown = await mindmap_service.generate_course_mindmap(db, course_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("course mindmap regeneration failed course=%s", course_id)
        raise HTTPException(
            status_code=502,
            detail=f"No pude regenerar el mapa: {type(exc).__name__}: {str(exc)[:200]}",
        )
    fresh = await db.fetchrow(
        "SELECT mind_map_generated_at FROM courses WHERE id = $1",
        course_id,
    )
    return CourseMindMapResponse(
        course_id=course_id,
        markdown=markdown,
        generated_at=fresh["mind_map_generated_at"].isoformat() if fresh and fresh["mind_map_generated_at"] else None,
        cached=False,
    )

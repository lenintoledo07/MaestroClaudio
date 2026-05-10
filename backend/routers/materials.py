"""Endpoints de materiales (videos, PDFs, PPTX, exports de WhatsApp)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from database import get_db, get_pool
from models.schemas import MaterialResponse
from services import drive_service
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)
router = APIRouter(tags=["materials"])

AUDIO_DIR = "/app/audio"


# ── Schemas locales ─────────────────────────────────────────────────────────


class MaterialFromDriveRequest(BaseModel):
    drive_file_id: str | None = None
    drive_url: str | None = None


class MaterialEnqueuedResponse(BaseModel):
    material_id: UUID
    status: str
    message: str


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _ensure_module_owned(
    db: "asyncpg.Connection", user_id: UUID, module_id: UUID
) -> dict:
    row = await db.fetchrow(
        """
        SELECT m.id, m.course_id
        FROM modules m
        JOIN courses c ON c.id = m.course_id
        WHERE m.id = $1 AND c.user_id = $2 AND c.status != 'deleted'
        """,
        module_id, user_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Módulo no encontrado"
        )
    return dict(row)


async def _ensure_material_owned(
    db: "asyncpg.Connection", user_id: UUID, material_id: UUID
) -> dict:
    row = await db.fetchrow(
        """
        SELECT m.*
        FROM materials m
        JOIN courses c ON c.id = m.course_id
        WHERE m.id = $1 AND c.user_id = $2 AND c.status != 'deleted'
        """,
        material_id, user_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material no encontrado"
        )
    return dict(row)


def _enqueue_celery(material_id: UUID) -> None:
    """Envía la task a Celery sin importarlo a nivel módulo (evita ciclos)."""
    from workers.tasks import process_material  # noqa: WPS433
    process_material.delay(str(material_id))


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.post(
    "/modules/{module_id}/materials/drive",
    response_model=MaterialEnqueuedResponse,
    status_code=202,
)
async def add_material_from_drive(
    module_id: UUID,
    payload: MaterialFromDriveRequest,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Registra un archivo de Drive (video/pdf/pptx) y dispara el procesamiento."""
    module = await _ensure_module_owned(db, user["id"], module_id)

    file_id = payload.drive_file_id
    if not file_id and payload.drive_url:
        file_id = drive_service.extract_file_id_from_url(payload.drive_url)
    if not file_id:
        raise HTTPException(
            status_code=400, detail="Necesito drive_file_id o drive_url válida"
        )

    meta = await drive_service.get_file_metadata(user["id"], file_id)
    mtype = meta["type"]
    if mtype == "unknown":
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no soportado (mime={meta['mimeType']})",
        )

    duration = (meta["duration_ms"] // 1000) if meta.get("duration_ms") else None

    material_id = await db.fetchval(
        """
        INSERT INTO materials (
            module_id, course_id, type, filename,
            drive_file_id, drive_url, duration_seconds, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id
        """,
        module_id, module["course_id"], mtype, meta["name"],
        file_id, meta.get("webViewLink"), duration,
    )

    _enqueue_celery(material_id)

    return MaterialEnqueuedResponse(
        material_id=material_id,
        status="pending",
        message="Procesamiento iniciado",
    )


@router.post(
    "/modules/{module_id}/materials/upload",
    response_model=MaterialEnqueuedResponse,
    status_code=202,
)
async def upload_whatsapp_export(
    module_id: UUID,
    file: UploadFile = File(...),
    filename: str | None = Form(default=None),
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Sube un .txt de export de WhatsApp directamente."""
    module = await _ensure_module_owned(db, user["id"], module_id)

    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    material_id = await db.fetchval(
        """
        INSERT INTO materials (
            module_id, course_id, type, filename, transcript, status
        )
        VALUES ($1, $2, 'whatsapp_export', $3, $4, 'pending')
        RETURNING id
        """,
        module_id, module["course_id"], filename or file.filename, text,
    )

    _enqueue_celery(material_id)

    return MaterialEnqueuedResponse(
        material_id=material_id,
        status="pending",
        message="WhatsApp export en cola",
    )


@router.get("/materials", response_model=list[MaterialResponse])
async def list_materials(
    course_id: UUID | None = None,
    module_id: UUID | None = None,
    status: str | None = None,
    limit: int = 100,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Lista los materials del usuario. Filtros opcionales por curso/módulo/status.
    Scoped por user_id via JOIN con courses (mismo patrón que search_similar)."""
    args: list = [user["id"]]
    where = ["c.user_id = $1"]
    if course_id:
        args.append(course_id)
        where.append(f"m.course_id = ${len(args)}")
    if module_id:
        args.append(module_id)
        where.append(f"m.module_id = ${len(args)}")
    if status:
        args.append(status)
        where.append(f"m.status = ${len(args)}")
    args.append(min(limit, 200))
    sql = f"""
        SELECT m.*
        FROM materials m
        JOIN courses c ON c.id = m.course_id
        WHERE {' AND '.join(where)}
        ORDER BY m.created_at DESC
        LIMIT ${len(args)}
    """
    rows = await db.fetch(sql, *args)
    return [MaterialResponse.model_validate(dict(r)) for r in rows]


@router.get("/materials/{material_id}", response_model=MaterialResponse)
async def get_material(
    material_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    row = await _ensure_material_owned(db, user["id"], material_id)
    return MaterialResponse.model_validate(row)


# ── SSE de status ───────────────────────────────────────────────────────────

_STATUS_PROGRESS = {
    "pending":      0,
    "downloading": 15,
    "transcribing": 40,
    "extracting":  70,
    "ready":      100,
    "error":       -1,
}


@router.get("/materials/{material_id}/status")
async def material_status_stream(
    material_id: UUID,
    user: dict = Depends(get_current_user),
):
    """Server-Sent Events. Polling cada 3s a la DB hasta ready/error."""
    user_id = user["id"]

    async def event_gen():
        pool = get_pool()
        last_status: str | None = None
        idle_iters = 0
        # Hard cap de 30 min para evitar conexiones colgadas
        max_iters = (30 * 60) // 3
        for _ in range(max_iters):
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT m.status, m.error_message
                    FROM materials m
                    JOIN courses c ON c.id = m.course_id
                    WHERE m.id = $1 AND c.user_id = $2
                    """,
                    material_id, user_id,
                )
            if row is None:
                yield _sse({"error": "not_found"})
                return

            current = row["status"]
            if current != last_status:
                payload = {
                    "status": current,
                    "progress": _STATUS_PROGRESS.get(current, 0),
                    "error_message": row["error_message"],
                }
                yield _sse(payload)
                last_status = current
                idle_iters = 0
            else:
                idle_iters += 1
                if idle_iters % 5 == 0:
                    yield ": keep-alive\n\n"  # comment SSE para no cerrar la conn

            if current in ("ready", "error"):
                return

            await asyncio.sleep(3)

        yield _sse({"status": last_status, "warning": "stream_timeout"})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


# ── Lectores de contenido ───────────────────────────────────────────────────


@router.get("/materials/{material_id}/transcript")
async def get_transcript(
    material_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    row = await _ensure_material_owned(db, user["id"], material_id)
    return {"material_id": str(material_id), "transcript": row.get("transcript") or ""}


@router.get("/materials/{material_id}/summary")
async def get_summary(
    material_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    row = await _ensure_material_owned(db, user["id"], material_id)
    return {"material_id": str(material_id), "summary": row.get("summary_text") or ""}


@router.get("/materials/{material_id}/audio")
async def get_audio(
    material_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    row = await _ensure_material_owned(db, user["id"], material_id)
    audio_path = row.get("audio_path")
    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio no disponible")
    return FileResponse(audio_path, media_type="audio/mpeg")


@router.delete("/materials/{material_id}")
async def delete_material(
    material_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    row = await _ensure_material_owned(db, user["id"], material_id)
    audio_path = row.get("audio_path")

    # CASCADE en la DB se encarga de signals y chunks
    await db.execute("DELETE FROM materials WHERE id = $1", material_id)

    if audio_path and os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except OSError:
            logger.warning("No se pudo borrar audio %s", audio_path)

    return {"deleted": True, "material_id": str(material_id)}

"""Tasks de procesamiento. Orquesta: download → transcribe → extract → embed.

Patrón de async dentro de Celery:
- Las tasks son funciones SYNC (Celery 5 nativo).
- El cuerpo real es `_async`, ejecutado con `asyncio.run()` por task.
- Cada task crea su propia conexión asyncpg (no usa pool — el pool del API
  vive en otro proceso).
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any
from uuid import UUID

import asyncpg
from celery import Task
from celery.exceptions import Retry

from config import settings
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _connect() -> asyncpg.Connection:
    return await asyncpg.connect(settings.DATABASE_URL, command_timeout=30)


async def _set_status(
    conn: asyncpg.Connection,
    material_id: UUID,
    status: str,
    error_message: str | None = None,
) -> None:
    if error_message is not None:
        await conn.execute(
            "UPDATE materials SET status = $1, error_message = $2 WHERE id = $3",
            status, error_message, material_id,
        )
    elif status == "ready":
        await conn.execute(
            """
            UPDATE materials
            SET status = $1, processed_at = NOW(), error_message = NULL
            WHERE id = $2
            """,
            status, material_id,
        )
    else:
        await conn.execute(
            "UPDATE materials SET status = $1, error_message = NULL WHERE id = $2",
            status, material_id,
        )


async def _load_material(
    conn: asyncpg.Connection, material_id: UUID
) -> dict | None:
    row = await conn.fetchrow(
        """
        SELECT m.id, m.module_id, m.course_id, m.type, m.filename,
               m.drive_file_id, m.drive_url, m.transcript,
               c.user_id
        FROM materials m
        LEFT JOIN courses c ON c.id = m.course_id
        WHERE m.id = $1
        """,
        material_id,
    )
    return dict(row) if row else None


# ── Task principal ──────────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    name="workers.tasks.process_material",
    max_retries=3,
    default_retry_delay=60,
)
def process_material(self: Task, material_id: str) -> dict[str, Any]:
    """Orquesta el pipeline completo. Llama a `_process_material_async`."""
    try:
        return asyncio.run(_process_material_async(UUID(material_id)))
    except Retry:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("process_material falló material=%s", material_id)
        # Re-encolar con backoff exponencial: 60s, 180s, 540s.
        countdown = 60 * (3 ** self.request.retries)
        try:
            raise self.retry(exc=exc, countdown=countdown)
        except self.MaxRetriesExceededError:
            asyncio.run(_mark_error_async(UUID(material_id), str(exc)))
            return {"status": "error", "message": str(exc)}


async def _process_material_async(material_id: UUID) -> dict[str, Any]:
    conn = await _connect()
    try:
        material = await _load_material(conn, material_id)
        if material is None:
            raise RuntimeError(f"Material {material_id} no existe")

        mtype = material["type"]
        logger.info("Procesando material=%s type=%s", material_id, mtype)

        # 1. Download / extract text del fuente
        if mtype == "whatsapp_export":
            # El texto ya está en materials.transcript (subido directamente).
            transcript = material["transcript"] or ""
            duration_seconds: int | None = None
        else:
            await _set_status(conn, material_id, "downloading")
            local_path = await _download_source(material)

            try:
                if mtype == "video":
                    await _set_status(conn, material_id, "transcribing")
                    from services.deepgram_service import transcribe_video

                    result = await transcribe_video(local_path)
                    transcript = result["transcript_formatted"]
                    duration_seconds = result.get("duration_seconds")
                elif mtype == "pdf":
                    from services.drive_service import extract_text_pdf

                    transcript = extract_text_pdf(local_path)
                    duration_seconds = None
                elif mtype == "pptx":
                    from services.drive_service import extract_text_pptx

                    transcript = extract_text_pptx(local_path)
                    duration_seconds = None
                else:
                    raise RuntimeError(f"Tipo no soportado: {mtype}")
            finally:
                # Borrar el archivo temporal SIEMPRE (zero retención de video).
                if os.path.exists(local_path):
                    try:
                        os.remove(local_path)
                    except OSError:
                        logger.warning("No se pudo borrar %s", local_path)

            # Persistir transcript y duration en la DB
            await conn.execute(
                """
                UPDATE materials
                SET transcript = $1, duration_seconds = $2
                WHERE id = $3
                """,
                transcript, duration_seconds, material_id,
            )

        # 2. Extracción de señales con Claude
        await _set_status(conn, material_id, "extracting")
        from services.claude_service import extract_signals, generate_summary

        await extract_signals(
            conn=conn,
            transcript=transcript,
            material_id=material_id,
            module_id=material["module_id"],
            course_id=material["course_id"],
            source=("whatsapp" if mtype == "whatsapp_export" else "recording"),
        )

        # 3. Resumen
        summary = await generate_summary(transcript=transcript)
        await conn.execute(
            "UPDATE materials SET summary_text = $1 WHERE id = $2",
            summary, material_id,
        )

        # 4. Audio TTS — solo para grabaciones (no chat de WhatsApp)
        if mtype == "video":
            try:
                from services.elevenlabs_service import generate_audio_summary

                audio_path = await generate_audio_summary(summary, material_id)
                await conn.execute(
                    "UPDATE materials SET audio_path = $1 WHERE id = $2",
                    audio_path, material_id,
                )
            except ImportError:
                logger.info("elevenlabs_service no disponible aún (Fase 3.1)")
            except Exception as exc:  # noqa: BLE001
                logger.warning("TTS falló (no es bloqueante): %s", exc)

        # 5. Embeddings + chunks
        from services.embeddings_service import store_chunks

        chunks_n = await store_chunks(
            conn=conn,
            text=transcript,
            material_id=material_id,
            module_id=material["module_id"],
            course_id=material["course_id"],
            chunk_type=("whatsapp" if mtype == "whatsapp_export" else "transcript"),
        )

        # 6. Listo + estimación de costo (riesgo #4)
        from services import cost_tracker

        post_state = await conn.fetchrow(
            "SELECT summary_text, audio_path FROM materials WHERE id = $1",
            material_id,
        )
        cost = cost_tracker.estimate(
            transcript=transcript,
            summary=post_state["summary_text"] if post_state else None,
            duration_seconds=duration_seconds,
            has_audio=bool(post_state and post_state["audio_path"]),
            has_embeddings=chunks_n > 0,
            is_video=(mtype == "video"),
        )
        await conn.execute(
            "UPDATE materials SET cost_estimated_usd = $1 WHERE id = $2",
            cost["total_usd"], material_id,
        )

        await _set_status(conn, material_id, "ready")
        logger.info(
            "Material %s LISTO (chunks=%d, duration=%s, cost≈$%.4f) breakdown=%s",
            material_id, chunks_n, duration_seconds, cost["total_usd"], cost,
        )

        # 7. Notificar (stub Fase 1, real en Fase 5)
        try:
            from scheduler import notify_user

            await notify_user(
                material["user_id"],
                "material_ready",
                {"material_id": str(material_id), "chunks": chunks_n},
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("notify_user falló: %s", exc)

        return {
            "status": "ready",
            "material_id": str(material_id),
            "chunks": chunks_n,
        }

    finally:
        await conn.close()


async def _mark_error_async(material_id: UUID, error_message: str) -> None:
    conn = await _connect()
    try:
        await _set_status(conn, material_id, "error", error_message)
    finally:
        await conn.close()


async def _download_source(material: dict) -> str:
    """Descarga la fuente a /tmp y retorna el path local."""
    from services.drive_service import download_file_temporarily

    file_id = material.get("drive_file_id")
    if not file_id:
        raise RuntimeError(
            f"Material {material['id']} no tiene drive_file_id (type={material['type']})"
        )

    user_id = material["user_id"]
    if not user_id:
        raise RuntimeError(
            f"Material {material['id']} no tiene user_id resoluble (course_id huérfano?)"
        )

    return await download_file_temporarily(user_id, file_id)

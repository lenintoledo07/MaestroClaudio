"""Maestro Claudio — MCP server (Fase 7).

Expone 8 tools para que un agente externo (Claude.ai, Claude Code) pueda
consultar el conocimiento académico del usuario:

  study_search       — RAG sobre los chunks indexados (pgvector + OpenAI).
  get_exam_tips      — exam tips detectados en clases / WhatsApp.
  get_pending_tasks  — evaluaciones próximas + pending_tasks.
  get_class_summary  — resumen narrado por curso + número de semana.
  get_references     — referencias bibliográficas mencionadas.
  get_qa_pairs       — Q&A entre alumnos y profesor.
  list_courses       — materias activas con stats.
  get_weekly_status  — estado de la semana actual.

Decisión de arquitectura (riesgo #2): el MCP consulta la DB directamente
en vez de hacer HTTP al backend. Razones:
  - Single-user MVP: no necesitamos session cookies ni service tokens.
  - Solo 8 queries simples; la lógica que se duplica con el backend es
    mínima (search_similar es 5 líneas).
  - Latencia más baja (no hop por la red interna).
A futuro multi-user esto cambia: o bien backend expone estos mismos endpoints
con auth de servicio, o bien MCP recibe user_id por header.

Autenticación: env `MCP_AUTH_TOKEN`. La validación se hace por reverse proxy
(nginx) en producción; FastMCP 0.2.0 no expone middleware HTTP de forma simple.
La tool `health()` reporta si el token está configurado.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any
from uuid import UUID

import asyncpg
from fastmcp import FastMCP
from openai import AsyncOpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("maestro-mcp")

mcp = FastMCP("maestro-claudio-mcp")

AUTH_TOKEN = os.getenv("MCP_AUTH_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
EMBEDDING_MODEL = os.getenv("MCP_EMBEDDING_MODEL", "text-embedding-3-small")
USER_ID_ENV = os.getenv("MCP_USER_ID")  # UUID opcional del único user del bot

_pool: asyncpg.Pool | None = None
_user_id_cache: UUID | None = None
_openai: AsyncOpenAI | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap
# ─────────────────────────────────────────────────────────────────────────────


async def _get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL no configurada")
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=4)
        logger.info("MCP pool creado")
    return _pool


def _get_openai() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY no configurada (study_search la necesita)")
        _openai = AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _openai


async def _resolve_user_id() -> UUID:
    """Single-user MVP: lee MCP_USER_ID del env o cae al primer user de la DB."""
    global _user_id_cache
    if _user_id_cache is not None:
        return _user_id_cache
    if USER_ID_ENV:
        _user_id_cache = UUID(USER_ID_ENV)
        return _user_id_cache
    pool = await _get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchval("SELECT id FROM users ORDER BY created_at LIMIT 1")
    if not row:
        raise RuntimeError("No hay users en la DB. Logueate al menos una vez vía web.")
    _user_id_cache = row
    logger.info("MCP user_id resuelto: %s", _user_id_cache)
    return _user_id_cache


def _vec_to_pg(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"


async def _resolve_course_id(
    conn: asyncpg.Connection,
    user_id: UUID,
    course_id: str | None,
    subject_name: str | None,
) -> UUID | None:
    """Devuelve un course_id concreto. Si vienen ambos vacíos → None
    (se interpreta como "todos los cursos del user")."""
    if course_id:
        return UUID(course_id)
    if subject_name:
        row = await conn.fetchval(
            """
            SELECT id FROM courses
            WHERE user_id = $1
              AND status != 'deleted'
              AND (LOWER(name) LIKE '%' || LOWER($2) || '%'
                   OR LOWER(COALESCE(code,'')) LIKE '%' || LOWER($2) || '%')
            LIMIT 1
            """,
            user_id, subject_name,
        )
        return row
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Tools
# ─────────────────────────────────────────────────────────────────────────────


@mcp.tool()
async def health() -> dict:
    """Estado del MCP y de sus dependencias."""
    out = {
        "status": "ok",
        "service": "maestro-claudio-mcp",
        "auth_configured": bool(AUTH_TOKEN),
        "database_configured": bool(DATABASE_URL),
        "openai_configured": bool(OPENAI_API_KEY),
    }
    try:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            out["db_users"] = await conn.fetchval("SELECT COUNT(*) FROM users")
        out["user_id"] = str(await _resolve_user_id())
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
        out["status"] = "degraded"
    return out


@mcp.tool()
async def study_search(
    query: str,
    course_id: str | None = None,
    subject_name: str | None = None,
    week: int | None = None,
) -> dict:
    """Busca en el material académico indexado. Usar para preguntas sobre
    conceptos, teorías o temas. Retorna los chunks más similares con su
    contexto (módulo, semana, materia)."""
    pool = await _get_pool()
    user_id = await _resolve_user_id()
    client = _get_openai()

    embed = (await client.embeddings.create(
        model=EMBEDDING_MODEL, input=query
    )).data[0].embedding

    async with pool.acquire() as conn:
        cid = await _resolve_course_id(conn, user_id, course_id, subject_name)
        args: list[Any] = [_vec_to_pg(embed), user_id]
        where = ["co.user_id = $2"]
        if cid:
            args.append(cid)
            where.append(f"c.course_id = ${len(args)}")
        if week is not None:
            args.append(week)
            where.append(f"m.week_number = ${len(args)}")
        sql = f"""
            SELECT c.id, c.content, c.chunk_type,
                   m.name AS module_name, m.week_number,
                   co.name AS course_name, co.code AS course_code,
                   1 - (c.embedding <=> $1::vector) AS similarity
            FROM chunks c
            INNER JOIN courses co ON co.id = c.course_id
            LEFT JOIN modules m ON m.id = c.module_id
            WHERE {' AND '.join(where)}
            ORDER BY c.embedding <=> $1::vector
            LIMIT 8
        """
        rows = await conn.fetch(sql, *args)
    return {
        "query": query,
        "results": [
            {
                "course": r["course_name"],
                "course_code": r["course_code"],
                "module": r["module_name"],
                "week": r["week_number"],
                "chunk_type": r["chunk_type"],
                "similarity": float(r["similarity"]),
                "content": r["content"],
            }
            for r in rows
        ],
    }


@mcp.tool()
async def get_exam_tips(
    course_id: str | None = None,
    subject_name: str | None = None,
) -> dict:
    """Exam tips detectados en grabaciones y WhatsApp. Usar antes de estudiar
    para un examen. Ordenados por importance (high → medium → low)."""
    pool = await _get_pool()
    user_id = await _resolve_user_id()
    async with pool.acquire() as conn:
        cid = await _resolve_course_id(conn, user_id, course_id, subject_name)
        args: list[Any] = [user_id]
        where = ["c.user_id = $1", "s.type = 'exam_tip'"]
        if cid:
            args.append(cid)
            where.append(f"s.course_id = ${len(args)}")
        rows = await conn.fetch(
            f"""
            SELECT s.content, s.context, s.importance, s.timestamp_seconds,
                   s.speaker, c.name AS course_name, m.name AS module_name
            FROM signals s
            JOIN courses c ON c.id = s.course_id
            LEFT JOIN modules m ON m.id = s.module_id
            WHERE {' AND '.join(where)}
            ORDER BY
                CASE s.importance
                    WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2
                END,
                s.created_at DESC
            LIMIT 50
            """,
            *args,
        )
    return {
        "count": len(rows),
        "exam_tips": [
            {
                "course": r["course_name"],
                "module": r["module_name"],
                "content": r["content"],
                "context": r["context"],
                "importance": r["importance"],
                "speaker": r["speaker"],
                "timestamp_seconds": r["timestamp_seconds"],
            }
            for r in rows
        ],
    }


@mcp.tool()
async def get_pending_tasks() -> dict:
    """Lista evaluaciones próximas y tareas pendientes. Usar para planificación."""
    pool = await _get_pool()
    user_id = await _resolve_user_id()
    async with pool.acquire() as conn:
        evals = await conn.fetch(
            """
            SELECT e.title, e.type AS kind, e.due_date, e.weight_pct, c.name AS course_name
            FROM evaluations e
            JOIN courses c ON c.id = e.course_id
            WHERE c.user_id = $1
              AND e.status = 'pending'
              AND e.due_date >= CURRENT_DATE
            ORDER BY e.due_date
            LIMIT 30
            """,
            user_id,
        )
        signals = await conn.fetch(
            """
            SELECT s.content, s.context, c.name AS course_name, m.name AS module_name
            FROM signals s
            JOIN courses c ON c.id = s.course_id
            LEFT JOIN modules m ON m.id = s.module_id
            WHERE c.user_id = $1 AND s.type = 'pending_task'
            ORDER BY s.created_at DESC
            LIMIT 30
            """,
            user_id,
        )
    return {
        "evaluations": [
            {
                "course": r["course_name"],
                "title": r["title"],
                "kind": r["kind"],
                "due_date": r["due_date"].isoformat() if r["due_date"] else None,
                "weight_pct": float(r["weight_pct"]) if r["weight_pct"] else None,
            }
            for r in evals
        ],
        "pending_tasks": [
            {
                "course": r["course_name"],
                "module": r["module_name"],
                "content": r["content"],
                "context": r["context"],
            }
            for r in signals
        ],
    }


@mcp.tool()
async def get_class_summary(course_id: str, week: int) -> dict:
    """Resumen de una clase específica por curso (uuid) y número de semana."""
    pool = await _get_pool()
    user_id = await _resolve_user_id()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT m.id AS module_id, m.name AS module_name, m.class_date,
                   c.name AS course_name, c.code AS course_code,
                   (SELECT mat.summary_text
                    FROM materials mat
                    WHERE mat.module_id = m.id AND mat.status = 'ready'
                    ORDER BY mat.created_at DESC LIMIT 1) AS summary,
                   (SELECT mat.id
                    FROM materials mat
                    WHERE mat.module_id = m.id AND mat.status = 'ready'
                    ORDER BY mat.created_at DESC LIMIT 1) AS material_id
            FROM modules m
            JOIN courses c ON c.id = m.course_id
            WHERE c.user_id = $1 AND m.course_id = $2 AND m.week_number = $3
            LIMIT 1
            """,
            user_id, UUID(course_id), week,
        )
    if not row:
        return {"found": False, "course_id": course_id, "week": week}
    return {
        "found": True,
        "course": row["course_name"],
        "module": row["module_name"],
        "class_date": row["class_date"].isoformat() if row["class_date"] else None,
        "summary": row["summary"],
        "material_id": str(row["material_id"]) if row["material_id"] else None,
    }


@mcp.tool()
async def get_references(
    subject_name: str | None = None,
    topic: str | None = None,
) -> dict:
    """Referencias bibliográficas (papers, libros, normas, herramientas)
    mencionadas por el profesor en clases. Filtros opcionales por materia
    y por substring en el contenido."""
    pool = await _get_pool()
    user_id = await _resolve_user_id()
    async with pool.acquire() as conn:
        cid = await _resolve_course_id(conn, user_id, None, subject_name)
        args: list[Any] = [user_id]
        where = ["c.user_id = $1", "s.type = 'reference'"]
        if cid:
            args.append(cid)
            where.append(f"s.course_id = ${len(args)}")
        if topic:
            args.append(topic)
            where.append(f"s.content ILIKE '%' || ${len(args)} || '%'")
        rows = await conn.fetch(
            f"""
            SELECT s.content, s.context, c.name AS course_name, m.name AS module_name
            FROM signals s
            JOIN courses c ON c.id = s.course_id
            LEFT JOIN modules m ON m.id = s.module_id
            WHERE {' AND '.join(where)}
            ORDER BY s.created_at DESC
            LIMIT 50
            """,
            *args,
        )
    return {
        "count": len(rows),
        "references": [
            {
                "course": r["course_name"],
                "module": r["module_name"],
                "reference": r["content"],
                "context": r["context"],
            }
            for r in rows
        ],
    }


@mcp.tool()
async def get_qa_pairs(
    subject_name: str | None = None,
    topic: str | None = None,
) -> dict:
    """Preguntas de compañeros + aclaraciones del profesor."""
    pool = await _get_pool()
    user_id = await _resolve_user_id()
    async with pool.acquire() as conn:
        cid = await _resolve_course_id(conn, user_id, None, subject_name)
        args: list[Any] = [user_id]
        where = ["c.user_id = $1", "s.type = 'qa'"]
        if cid:
            args.append(cid)
            where.append(f"s.course_id = ${len(args)}")
        if topic:
            args.append(topic)
            where.append(f"s.content ILIKE '%' || ${len(args)} || '%'")
        rows = await conn.fetch(
            f"""
            SELECT s.content, s.context, c.name AS course_name, m.name AS module_name
            FROM signals s
            JOIN courses c ON c.id = s.course_id
            LEFT JOIN modules m ON m.id = s.module_id
            WHERE {' AND '.join(where)}
            ORDER BY s.created_at DESC
            LIMIT 50
            """,
            *args,
        )
    return {
        "count": len(rows),
        "qa_pairs": [
            {
                "course": r["course_name"],
                "module": r["module_name"],
                "content": r["content"],
                "clarification": r["context"],
            }
            for r in rows
        ],
    }


@mcp.tool()
async def list_courses() -> dict:
    """Lista materias activas con estado de procesamiento y stats agregadas."""
    pool = await _get_pool()
    user_id = await _resolve_user_id()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                c.id, c.name, c.code, c.color, c.status, c.professor,
                (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS modules_n,
                (SELECT COUNT(*) FROM materials mat WHERE mat.course_id = c.id) AS materials_n,
                (SELECT COUNT(*) FROM materials mat
                   WHERE mat.course_id = c.id AND mat.status = 'ready') AS materials_ready,
                (SELECT COUNT(*) FROM signals s
                   WHERE s.course_id = c.id AND s.type = 'exam_tip') AS exam_tips_n
            FROM courses c
            WHERE c.user_id = $1 AND c.status != 'deleted'
            ORDER BY c.created_at
            """,
            user_id,
        )
    return {
        "count": len(rows),
        "courses": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "code": r["code"],
                "color": r["color"],
                "status": r["status"],
                "professor": r["professor"],
                "modules": r["modules_n"],
                "materials_total": r["materials_n"],
                "materials_ready": r["materials_ready"],
                "exam_tips": r["exam_tips_n"],
            }
            for r in rows
        ],
    }


@mcp.tool()
async def get_weekly_status() -> dict:
    """Estado de la semana actual: clases detectadas en Calendar vs material subido."""
    pool = await _get_pool()
    user_id = await _resolve_user_id()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT ce.title, ce.event_date, ce.start_time,
                   ce.material_status, c.name AS course_name, c.code AS course_code
            FROM calendar_events ce
            JOIN courses c ON c.id = ce.course_id
            WHERE c.user_id = $1
              AND c.status = 'active'
              AND ce.event_date BETWEEN
                  date_trunc('week', CURRENT_DATE)::date
                  AND (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date
            ORDER BY ce.event_date, ce.start_time
            """,
            user_id,
        )
    return {
        "count": len(rows),
        "events": [
            {
                "course": r["course_name"],
                "course_code": r["course_code"],
                "title": r["title"],
                "date": r["event_date"].isoformat() if r["event_date"] else None,
                "start_time": str(r["start_time"]) if r["start_time"] else None,
                "material_status": r["material_status"],
            }
            for r in rows
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────────────


async def _warmup() -> None:
    try:
        await _get_pool()
        await _resolve_user_id()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Warmup falló (no es bloqueante): %s", exc)


if __name__ == "__main__":
    import uvicorn

    asyncio.get_event_loop().run_until_complete(_warmup())
    # FastMCP 2.x expone una ASGI app vía `sse_app()`. La servimos con uvicorn
    # en 8002 (mapeado al host por docker-compose). Endpoint SSE: /sse
    uvicorn.run(mcp.sse_app(), host="0.0.0.0", port=8002, log_level="info")

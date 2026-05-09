"""Lógica de negocio para módulos (semanas/clases)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status

from models.schemas import ModuleCreate, ModuleResponse, ModuleUpdate

if TYPE_CHECKING:
    import asyncpg


_BASE_SELECT = """
    SELECT
        m.id, m.course_id, m.name, m.week_number, m.topic, m.class_date,
        m.calendar_event_id, m.status, m.created_at,
        COALESCE(mat.cnt, 0) AS materials_count,
        COALESCE(s.cnt, 0)   AS signals_count
    FROM modules m
    JOIN courses c ON c.id = m.course_id AND c.user_id = $1 AND c.status != 'deleted'
    LEFT JOIN (SELECT module_id, COUNT(*) cnt FROM materials GROUP BY module_id) mat
        ON mat.module_id = m.id
    LEFT JOIN (SELECT module_id, COUNT(*) cnt FROM signals  GROUP BY module_id) s
        ON s.module_id  = m.id
"""


async def _ensure_course_owned(
    db: "asyncpg.Connection", user_id: UUID, course_id: UUID
) -> None:
    owner = await db.fetchval(
        "SELECT 1 FROM courses WHERE id = $1 AND user_id = $2 AND status != 'deleted'",
        course_id,
        user_id,
    )
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado"
        )


async def list_modules(
    db: "asyncpg.Connection", user_id: UUID, course_id: UUID
) -> list[ModuleResponse]:
    await _ensure_course_owned(db, user_id, course_id)
    rows = await db.fetch(
        f"{_BASE_SELECT} WHERE m.course_id = $2 ORDER BY m.week_number NULLS LAST, m.created_at",
        user_id,
        course_id,
    )
    return [ModuleResponse.model_validate(dict(r)) for r in rows]


async def get_module(
    db: "asyncpg.Connection", user_id: UUID, module_id: UUID
) -> ModuleResponse:
    row = await db.fetchrow(
        f"{_BASE_SELECT} WHERE m.id = $2", user_id, module_id
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Módulo no encontrado"
        )
    return ModuleResponse.model_validate(dict(row))


async def create_module(
    db: "asyncpg.Connection",
    user_id: UUID,
    course_id: UUID,
    payload: ModuleCreate,
) -> ModuleResponse:
    await _ensure_course_owned(db, user_id, course_id)
    module_id = await db.fetchval(
        """
        INSERT INTO modules (course_id, name, week_number, topic, class_date, calendar_event_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        course_id,
        payload.name,
        payload.week_number,
        payload.topic,
        payload.class_date,
        payload.calendar_event_id,
    )
    return await get_module(db, user_id, module_id)


async def update_module(
    db: "asyncpg.Connection",
    user_id: UUID,
    module_id: UUID,
    payload: ModuleUpdate,
) -> ModuleResponse:
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        return await get_module(db, user_id, module_id)

    # Verificar ownership
    owned = await db.fetchval(
        """
        SELECT 1 FROM modules m
        JOIN courses c ON c.id = m.course_id
        WHERE m.id = $1 AND c.user_id = $2 AND c.status != 'deleted'
        """,
        module_id,
        user_id,
    )
    if not owned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Módulo no encontrado"
        )

    set_clauses = []
    args: list = []
    for col, val in fields.items():
        args.append(val)
        set_clauses.append(f"{col} = ${len(args)}")
    args.append(module_id)
    sql = f"UPDATE modules SET {', '.join(set_clauses)} WHERE id = ${len(args)}"
    await db.execute(sql, *args)
    return await get_module(db, user_id, module_id)


async def delete_module(
    db: "asyncpg.Connection", user_id: UUID, module_id: UUID
) -> dict:
    info = await db.fetchrow(
        """
        SELECT
            COALESCE((SELECT COUNT(*) FROM materials WHERE module_id = m.id), 0)::int AS mat_count,
            COALESCE((SELECT COUNT(*) FROM signals   WHERE module_id = m.id), 0)::int AS sig_count
        FROM modules m
        JOIN courses c ON c.id = m.course_id
        WHERE m.id = $1 AND c.user_id = $2 AND c.status != 'deleted'
        """,
        module_id,
        user_id,
    )
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Módulo no encontrado"
        )
    await db.execute("DELETE FROM modules WHERE id = $1", module_id)
    return {
        "deleted": True,
        "materials_deleted": info["mat_count"],
        "signals_deleted": info["sig_count"],
    }

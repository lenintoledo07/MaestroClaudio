"""Lógica de negocio para courses (asyncpg directo, queries parametrizadas)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status

from models.schemas import CourseCreate, CourseResponse, CourseUpdate

if TYPE_CHECKING:
    import asyncpg


_BASE_SELECT = """
    SELECT
        c.id, c.user_id, c.name, c.code, c.professor,
        c.professor_whatsapp_name, c.drive_folder_id, c.color,
        c.status, c.start_date, c.end_date, c.created_at,
        COALESCE(m.cnt, 0) AS modules_count,
        COALESCE(mat.cnt, 0) AS materials_count
    FROM courses c
    LEFT JOIN (
        SELECT course_id, COUNT(*) AS cnt FROM modules GROUP BY course_id
    ) m ON m.course_id = c.id
    LEFT JOIN (
        SELECT course_id, COUNT(*) AS cnt FROM materials GROUP BY course_id
    ) mat ON mat.course_id = c.id
"""


async def list_courses(
    db: "asyncpg.Connection",
    user_id: UUID,
    status_filter: str | None = None,
) -> list[CourseResponse]:
    where = ["c.user_id = $1", "c.status != 'deleted'"]
    args: list = [user_id]

    if status_filter:
        if status_filter not in {"active", "paused", "completed"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status inválido (active|paused|completed)",
            )
        args.append(status_filter)
        where[-1] = f"c.status = ${len(args)}"  # reemplaza el filtro de '!=deleted'

    sql = f"{_BASE_SELECT} WHERE {' AND '.join(where)} ORDER BY c.created_at DESC"
    rows = await db.fetch(sql, *args)
    return [CourseResponse.model_validate(dict(r)) for r in rows]


async def get_course(
    db: "asyncpg.Connection", user_id: UUID, course_id: UUID
) -> CourseResponse:
    sql = f"{_BASE_SELECT} WHERE c.id = $1 AND c.user_id = $2"
    row = await db.fetchrow(sql, course_id, user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado"
        )
    return CourseResponse.model_validate(dict(row))


async def create_course(
    db: "asyncpg.Connection", user_id: UUID, payload: CourseCreate
) -> CourseResponse:
    course_id = await db.fetchval(
        """
        INSERT INTO courses (
            user_id, name, code, professor, professor_whatsapp_name,
            drive_folder_id, color
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        """,
        user_id,
        payload.name,
        payload.code,
        payload.professor,
        payload.professor_whatsapp_name,
        payload.drive_folder_id,
        payload.color,
    )
    # Módulo default — sin esto el botón "Importar de Drive" queda disabled
    # (firstModuleId en CourseDetail), bloqueando el flujo de ingesta.
    await db.execute(
        "INSERT INTO modules (course_id, name, week_number) VALUES ($1, $2, $3)",
        course_id, "Módulo 1", 1,
    )
    return await get_course(db, user_id, course_id)


async def update_course(
    db: "asyncpg.Connection",
    user_id: UUID,
    course_id: UUID,
    payload: CourseUpdate,
) -> CourseResponse:
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        return await get_course(db, user_id, course_id)

    set_clauses = []
    args: list = []
    for col, val in fields.items():
        args.append(val)
        set_clauses.append(f"{col} = ${len(args)}")

    args.extend([course_id, user_id])
    sql = f"""
        UPDATE courses
        SET {', '.join(set_clauses)}
        WHERE id = ${len(args) - 1}
          AND user_id = ${len(args)}
          AND status != 'deleted'
        RETURNING id
    """
    updated_id = await db.fetchval(sql, *args)
    if not updated_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso no encontrado o eliminado",
        )
    return await get_course(db, user_id, course_id)


async def soft_delete_course(
    db: "asyncpg.Connection", user_id: UUID, course_id: UUID, confirm: bool
) -> dict:
    if not confirm:
        # Devolver detalles para confirmar
        info = await db.fetchrow(
            """
            SELECT c.name,
                   COALESCE(m.cnt, 0)::int AS modules_count,
                   COALESCE(s.cnt, 0)::int AS signals_count
            FROM courses c
            LEFT JOIN (SELECT course_id, COUNT(*) cnt FROM modules GROUP BY course_id) m
                ON m.course_id = c.id
            LEFT JOIN (SELECT course_id, COUNT(*) cnt FROM signals GROUP BY course_id) s
                ON s.course_id = c.id
            WHERE c.id = $1 AND c.user_id = $2 AND c.status != 'deleted'
            """,
            course_id,
            user_id,
        )
        if not info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado"
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Confirmación requerida. Volver a llamar con {confirm: true}.",
                "course_name": info["name"],
                "modules_count": info["modules_count"],
                "signals_count": info["signals_count"],
            },
        )

    deleted = await db.fetchval(
        """
        UPDATE courses SET status = 'deleted'
        WHERE id = $1 AND user_id = $2 AND status != 'deleted'
        RETURNING id
        """,
        course_id,
        user_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado"
        )
    return {"deleted": True, "course_id": str(course_id)}


async def restore_course(
    db: "asyncpg.Connection", user_id: UUID, course_id: UUID
) -> CourseResponse:
    restored = await db.fetchval(
        """
        UPDATE courses SET status = 'active'
        WHERE id = $1 AND user_id = $2 AND status = 'deleted'
        RETURNING id
        """,
        course_id,
        user_id,
    )
    if not restored:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso no está en estado eliminado",
        )
    return await get_course(db, user_id, course_id)

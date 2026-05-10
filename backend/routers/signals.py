"""Endpoints de señales pedagógicas (exam tips, refs, Q&A, pendientes)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from database import get_db
from models.schemas import SignalResponse
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

router = APIRouter(tags=["signals"])


async def _ensure_course_owned(
    db: "asyncpg.Connection", user_id: UUID, course_id: UUID
) -> None:
    owned = await db.fetchval(
        "SELECT 1 FROM courses WHERE id = $1 AND user_id = $2 AND status != 'deleted'",
        course_id, user_id,
    )
    if not owned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado"
        )


async def _ensure_module_owned(
    db: "asyncpg.Connection", user_id: UUID, module_id: UUID
) -> None:
    owned = await db.fetchval(
        """
        SELECT 1 FROM modules m
        JOIN courses c ON c.id = m.course_id
        WHERE m.id = $1 AND c.user_id = $2 AND c.status != 'deleted'
        """,
        module_id, user_id,
    )
    if not owned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Módulo no encontrado"
        )


async def _list_by_course(
    db: "asyncpg.Connection",
    course_id: UUID,
    type_: str,
    module_id: UUID | None = None,
    importance: str | None = None,
) -> list[dict]:
    where = ["course_id = $1", "type = $2"]
    args: list = [course_id, type_]
    if module_id:
        args.append(module_id)
        where.append(f"module_id = ${len(args)}")
    if importance:
        args.append(importance)
        where.append(f"importance = ${len(args)}")
    sql = f"""
        SELECT id, material_id, module_id, course_id, type, content,
               speaker, context, timestamp_seconds, importance, source, created_at
        FROM signals
        WHERE {' AND '.join(where)}
        ORDER BY importance DESC, created_at DESC
    """
    rows = await db.fetch(sql, *args)
    return [dict(r) for r in rows]


# ── Por curso ───────────────────────────────────────────────────────────────


@router.get("/courses/{course_id}/exam-tips", response_model=list[SignalResponse])
async def list_exam_tips(
    course_id: UUID,
    module_id: UUID | None = Query(default=None),
    importance: str | None = Query(default=None, pattern=r"^(high|medium|low)$"),
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    await _ensure_course_owned(db, user["id"], course_id)
    return await _list_by_course(db, course_id, "exam_tip", module_id, importance)


@router.get("/courses/{course_id}/references", response_model=list[SignalResponse])
async def list_references(
    course_id: UUID,
    module_id: UUID | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    await _ensure_course_owned(db, user["id"], course_id)
    return await _list_by_course(db, course_id, "reference", module_id)


@router.get("/courses/{course_id}/qa", response_model=list[SignalResponse])
async def list_qa(
    course_id: UUID,
    module_id: UUID | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    await _ensure_course_owned(db, user["id"], course_id)
    return await _list_by_course(db, course_id, "qa", module_id)


@router.get(
    "/courses/{course_id}/pending-tasks", response_model=list[SignalResponse]
)
async def list_pending(
    course_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    await _ensure_course_owned(db, user["id"], course_id)
    return await _list_by_course(db, course_id, "pending_task")


# ── Por módulo (todas las señales agrupadas por tipo) ───────────────────────


@router.get("/modules/{module_id}/signals")
async def list_module_signals(
    module_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    await _ensure_module_owned(db, user["id"], module_id)
    rows = await db.fetch(
        """
        SELECT id, material_id, module_id, course_id, type, content,
               speaker, context, timestamp_seconds, importance, source, created_at
        FROM signals
        WHERE module_id = $1
        ORDER BY type, importance DESC, created_at DESC
        """,
        module_id,
    )
    grouped: dict[str, list[dict]] = {}
    for r in rows:
        grouped.setdefault(r["type"], []).append(dict(r))
    return grouped

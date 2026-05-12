"""Lógica de negocio para evaluations (exámenes, tareas, proyectos, quizzes)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status

from models.schemas import (
    EvaluationCreate,
    EvaluationResponse,
    EvaluationUpcomingResponse,
    EvaluationUpdate,
)

if TYPE_CHECKING:
    import asyncpg


_BASE_SELECT = """
    SELECT
        e.id, e.course_id, e.title, e.type, e.due_date, e.description,
        e.weight_pct, e.status, e.grade, e.calendar_event_id,
        e.reminder_sent_7d, e.reminder_sent_1d, e.created_at,
        e.auto_detected, e.source_material_id, e.approved,
        c.name AS course_name
    FROM evaluations e
    JOIN courses c ON c.id = e.course_id
                  AND c.user_id = $1
                  AND c.status != 'deleted'
"""

# Filtro común para queries que NO deben mostrar evaluations pendientes de
# revisión (la lista regular y el scheduler de recordatorios). Solo aparecen
# las creadas a mano (auto_detected=FALSE) o las auto-detected ya aprobadas.
_APPROVED_FILTER = "(e.auto_detected = FALSE OR e.approved = TRUE)"


async def list_evaluations(
    db: "asyncpg.Connection",
    user_id: UUID,
    course_id: UUID | None = None,
    status_filter: str | None = None,
) -> list[EvaluationResponse]:
    where = [_APPROVED_FILTER]
    args: list = [user_id]
    if course_id:
        args.append(course_id)
        where.append(f"e.course_id = ${len(args)}")
    if status_filter:
        if status_filter not in {"pending", "submitted", "graded"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status inválido",
            )
        args.append(status_filter)
        where.append(f"e.status = ${len(args)}")

    sql = _BASE_SELECT + " WHERE " + " AND ".join(where) + " ORDER BY e.due_date ASC"
    rows = await db.fetch(sql, *args)
    return [EvaluationResponse.model_validate(dict(r)) for r in rows]


async def list_upcoming(
    db: "asyncpg.Connection", user_id: UUID, days: int = 30
) -> list[EvaluationUpcomingResponse]:
    today = date.today()
    horizon = today + timedelta(days=days)
    sql = _BASE_SELECT + f"""
        WHERE e.due_date BETWEEN $2 AND $3
          AND e.status = 'pending'
          AND {_APPROVED_FILTER}
        ORDER BY e.due_date ASC
    """
    rows = await db.fetch(sql, user_id, today, horizon)
    out: list[EvaluationUpcomingResponse] = []
    for r in rows:
        d = dict(r)
        d["days_remaining"] = (d["due_date"] - today).days
        out.append(EvaluationUpcomingResponse.model_validate(d))
    return out


async def list_pending_review(
    db: "asyncpg.Connection",
    user_id: UUID,
    course_id: UUID | None = None,
) -> list[EvaluationResponse]:
    """Evaluations auto-detectadas que esperan aprobación del usuario."""
    where = ["e.auto_detected = TRUE", "e.approved IS NULL"]
    args: list = [user_id]
    if course_id:
        args.append(course_id)
        where.append(f"e.course_id = ${len(args)}")
    sql = _BASE_SELECT + " WHERE " + " AND ".join(where) + " ORDER BY e.due_date ASC"
    rows = await db.fetch(sql, *args)
    return [EvaluationResponse.model_validate(dict(r)) for r in rows]


async def approve_evaluation(
    db: "asyncpg.Connection", user_id: UUID, evaluation_id: UUID
) -> EvaluationResponse:
    # Validamos ownership joining contra courses como en el resto del servicio.
    owned = await db.fetchval(
        """
        SELECT 1 FROM evaluations e
        JOIN courses c ON c.id = e.course_id AND c.user_id = $1
        WHERE e.id = $2
        """,
        user_id, evaluation_id,
    )
    if not owned:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada")
    await db.execute(
        "UPDATE evaluations SET approved = TRUE WHERE id = $1",
        evaluation_id,
    )
    return await get_evaluation(db, user_id, evaluation_id)


async def move_evaluation(
    db: "asyncpg.Connection",
    user_id: UUID,
    evaluation_id: UUID,
    new_course_id: UUID,
) -> EvaluationResponse:
    """Reasigna una evaluation a otra materia del mismo user.

    Útil cuando el material que originó la evaluation se procesó con el
    course_id equivocado (ej. subido al módulo de otra materia por error)
    y la auto-detección heredó ese error.
    """
    # Ownership de ambos cursos
    owned = await db.fetchval(
        """
        SELECT 1
        FROM evaluations e
        JOIN courses c ON c.id = e.course_id AND c.user_id = $1
        WHERE e.id = $2
        """,
        user_id, evaluation_id,
    )
    if not owned:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada")
    new_owned = await db.fetchval(
        "SELECT 1 FROM courses WHERE id = $1 AND user_id = $2 AND status != 'deleted'",
        new_course_id, user_id,
    )
    if not new_owned:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Materia destino no encontrada")
    await db.execute(
        "UPDATE evaluations SET course_id = $1 WHERE id = $2",
        new_course_id, evaluation_id,
    )
    return await get_evaluation(db, user_id, evaluation_id)


async def reject_evaluation(
    db: "asyncpg.Connection", user_id: UUID, evaluation_id: UUID
) -> dict:
    """Las auto-detectadas rechazadas se eliminan (no nos sirve guardarlas)."""
    deleted = await db.fetchval(
        """
        DELETE FROM evaluations
        WHERE id = $2 AND auto_detected = TRUE
          AND course_id IN (SELECT id FROM courses WHERE user_id = $1)
        RETURNING id
        """,
        user_id, evaluation_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluación auto-detectada no encontrada",
        )
    return {"deleted": str(deleted)}


async def get_evaluation(
    db: "asyncpg.Connection", user_id: UUID, evaluation_id: UUID
) -> EvaluationResponse:
    row = await db.fetchrow(
        _BASE_SELECT + " WHERE e.id = $2", user_id, evaluation_id
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada"
        )
    return EvaluationResponse.model_validate(dict(row))


async def create_evaluation(
    db: "asyncpg.Connection", user_id: UUID, payload: EvaluationCreate
) -> EvaluationResponse:
    # Verificar ownership del curso
    owner = await db.fetchval(
        "SELECT 1 FROM courses WHERE id = $1 AND user_id = $2 AND status != 'deleted'",
        payload.course_id,
        user_id,
    )
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado"
        )

    eval_id = await db.fetchval(
        """
        INSERT INTO evaluations (course_id, title, type, due_date, description, weight_pct)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        payload.course_id,
        payload.title,
        payload.type,
        payload.due_date,
        payload.description,
        payload.weight_pct,
    )
    return await get_evaluation(db, user_id, eval_id)


async def update_evaluation(
    db: "asyncpg.Connection",
    user_id: UUID,
    evaluation_id: UUID,
    payload: EvaluationUpdate,
) -> EvaluationResponse:
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        return await get_evaluation(db, user_id, evaluation_id)

    if fields.get("status") == "graded" and "grade" not in fields:
        # Verificar si la eval ya tiene grade previo
        existing_grade = await db.fetchval(
            "SELECT grade FROM evaluations WHERE id = $1", evaluation_id
        )
        if existing_grade is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status='graded' requiere campo grade",
            )

    # Verificar ownership
    owned = await db.fetchval(
        """
        SELECT 1 FROM evaluations e
        JOIN courses c ON c.id = e.course_id
        WHERE e.id = $1 AND c.user_id = $2 AND c.status != 'deleted'
        """,
        evaluation_id,
        user_id,
    )
    if not owned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada"
        )

    set_clauses = []
    args: list = []
    for col, val in fields.items():
        args.append(val)
        set_clauses.append(f"{col} = ${len(args)}")
    args.append(evaluation_id)
    sql = f"UPDATE evaluations SET {', '.join(set_clauses)} WHERE id = ${len(args)}"
    await db.execute(sql, *args)
    return await get_evaluation(db, user_id, evaluation_id)


async def delete_evaluation(
    db: "asyncpg.Connection", user_id: UUID, evaluation_id: UUID
) -> dict:
    deleted = await db.fetchval(
        """
        DELETE FROM evaluations e
        USING courses c
        WHERE e.course_id = c.id
          AND e.id = $1 AND c.user_id = $2 AND c.status != 'deleted'
        RETURNING e.id
        """,
        evaluation_id,
        user_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evaluación no encontrada"
        )
    return {"deleted": True, "evaluation_id": str(evaluation_id)}

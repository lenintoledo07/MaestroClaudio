"""CRUD de evaluaciones."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from database import get_db
from models.schemas import (
    EvaluationCreate,
    EvaluationResponse,
    EvaluationUpcomingResponse,
    EvaluationUpdate,
)
from services import evaluation_service
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


@router.get("", response_model=list[EvaluationResponse])
async def list_evaluations(
    course_id: UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await evaluation_service.list_evaluations(
        db, user["id"], course_id, status_filter
    )


@router.get("/upcoming", response_model=list[EvaluationUpcomingResponse])
async def list_upcoming(
    days: int = Query(default=30, ge=1, le=365),
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await evaluation_service.list_upcoming(db, user["id"], days)


@router.get("/pending-review", response_model=list[EvaluationResponse])
async def list_pending_review(
    course_id: UUID | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Evaluations auto-detectadas que esperan aprobación del usuario."""
    return await evaluation_service.list_pending_review(db, user["id"], course_id)


@router.post("/{evaluation_id}/approve", response_model=EvaluationResponse)
async def approve_evaluation(
    evaluation_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await evaluation_service.approve_evaluation(db, user["id"], evaluation_id)


@router.post("/{evaluation_id}/reject")
async def reject_evaluation(
    evaluation_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await evaluation_service.reject_evaluation(db, user["id"], evaluation_id)


class _MoveBody(BaseModel):
    course_id: UUID


@router.post("/{evaluation_id}/move", response_model=EvaluationResponse)
async def move_evaluation(
    evaluation_id: UUID,
    payload: _MoveBody,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Reasigna la evaluation a otra materia (mismo user)."""
    return await evaluation_service.move_evaluation(
        db, user["id"], evaluation_id, payload.course_id
    )


@router.post("", response_model=EvaluationResponse, status_code=201)
async def create_evaluation(
    payload: EvaluationCreate,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await evaluation_service.create_evaluation(db, user["id"], payload)


@router.get("/{evaluation_id}", response_model=EvaluationResponse)
async def get_evaluation(
    evaluation_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await evaluation_service.get_evaluation(db, user["id"], evaluation_id)


@router.patch("/{evaluation_id}", response_model=EvaluationResponse)
async def update_evaluation(
    evaluation_id: UUID,
    payload: EvaluationUpdate,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await evaluation_service.update_evaluation(
        db, user["id"], evaluation_id, payload
    )


@router.delete("/{evaluation_id}")
async def delete_evaluation(
    evaluation_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await evaluation_service.delete_evaluation(db, user["id"], evaluation_id)

"""CRUD de evaluaciones."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, Query

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

"""CRUD de materias (courses)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from database import get_db
from models.schemas import (
    CourseCreate,
    CourseDeleteRequest,
    CourseResponse,
    CourseUpdate,
)
from services import course_service
from services.auth_service import get_current_user

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

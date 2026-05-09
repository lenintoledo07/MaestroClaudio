"""CRUD de módulos (semanas/clases dentro de un curso)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends

from database import get_db
from models.schemas import (
    ModuleCreate,
    ModuleDeleteResponse,
    ModuleResponse,
    ModuleUpdate,
)
from services import module_service
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

# Mezclamos dos prefijos: /courses/{id}/modules y /modules/{id}.
# Para mantenerlo simple, dejamos las rutas explícitas en cada handler.
router = APIRouter(tags=["modules"])


@router.get("/courses/{course_id}/modules", response_model=list[ModuleResponse])
async def list_modules(
    course_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await module_service.list_modules(db, user["id"], course_id)


@router.post(
    "/courses/{course_id}/modules", response_model=ModuleResponse, status_code=201
)
async def create_module(
    course_id: UUID,
    payload: ModuleCreate,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await module_service.create_module(db, user["id"], course_id, payload)


@router.get("/modules/{module_id}", response_model=ModuleResponse)
async def get_module(
    module_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await module_service.get_module(db, user["id"], module_id)


@router.patch("/modules/{module_id}", response_model=ModuleResponse)
async def update_module(
    module_id: UUID,
    payload: ModuleUpdate,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await module_service.update_module(db, user["id"], module_id, payload)


@router.delete("/modules/{module_id}", response_model=ModuleDeleteResponse)
async def delete_module(
    module_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    return await module_service.delete_module(db, user["id"], module_id)

"""Pool asyncpg compartido + dependencia FastAPI para inyectar conexiones."""

from __future__ import annotations

import logging
from typing import AsyncIterator

import asyncpg

from config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    """Crea el pool al arrancar la app. Idempotente."""
    global _pool
    if _pool is not None:
        return _pool

    _pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    logger.info("Postgres pool listo (min=2, max=10)")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Postgres pool cerrado")


def get_pool() -> asyncpg.Pool:
    """Acceso directo al pool (para servicios y workers)."""
    if _pool is None:
        raise RuntimeError("Pool no inicializado. ¿Olvidaste init_pool()?")
    return _pool


async def get_db() -> AsyncIterator[asyncpg.Connection]:
    """FastAPI dependency: obtiene una conexión del pool y la libera al final."""
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


async def health_check() -> dict:
    """Verifica que el pool funciona y que pgvector está instalado."""
    pool = get_pool()
    async with pool.acquire() as conn:
        version = await conn.fetchval("SELECT version()")
        has_vector = await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        )
        tables = await conn.fetchval(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
        )
    return {
        "ok": True,
        "postgres": version.split(" on ")[0] if version else "unknown",
        "pgvector": bool(has_vector),
        "tables": tables,
    }

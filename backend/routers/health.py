"""Health endpoints (Fase Final F.2).

GET /health           → service alive
GET /health/db        → conexión a Postgres + pgvector
GET /health/workers   → Celery alive + queues
GET /health/all       → resumen consolidado
"""

from __future__ import annotations

import logging

import redis.asyncio as redis
from celery import Celery
from fastapi import APIRouter

from config import settings
from database import health_check

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


SERVICE_INFO = {
    "service": "maestro-claudio",
    "version": "0.1.0",
}


@router.get("/health")
async def health():
    return {**SERVICE_INFO, "status": "healthy", "environment": settings.ENVIRONMENT}


@router.get("/health/db")
async def health_db():
    return await health_check()


@router.get("/health/workers")
async def health_workers():
    """Inspecciona Celery vía AMQP/Redis. Devuelve los workers activos
    y la cantidad de tasks pendientes en la queue 'materials'."""
    out: dict = {"ok": False}
    try:
        app = Celery("maestro_claudio", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
        insp = app.control.inspect(timeout=2.0)
        active = insp.active() or {}
        registered = insp.registered() or {}
        ping = insp.ping() or {}

        out["workers"] = list(ping.keys())
        out["workers_count"] = len(ping)
        out["active_tasks"] = sum(len(v) for v in active.values())
        out["registered_tasks"] = sorted({t for v in registered.values() for t in v})

        client = redis.from_url(settings.REDIS_URL)
        try:
            out["queue_materials_pending"] = await client.llen("materials")
        finally:
            await client.aclose()

        out["ok"] = out["workers_count"] > 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("health/workers error: %s", exc)
        out["error"] = str(exc)
    return out


@router.get("/health/all")
async def health_all():
    """Resumen consolidado para dashboards de monitoring."""
    db = await health_check()
    workers = await health_workers()
    return {
        **SERVICE_INFO,
        "environment": settings.ENVIRONMENT,
        "db": {"ok": db.get("ok", False), "tables": db.get("tables"), "pgvector": db.get("pgvector")},
        "workers": {
            "ok": workers.get("ok", False),
            "count": workers.get("workers_count", 0),
            "queue_pending": workers.get("queue_materials_pending"),
        },
        "status": "healthy" if db.get("ok") and workers.get("ok") else "degraded",
    }

"""Celery app + configuración compartida por todas las tasks."""

from __future__ import annotations

from celery import Celery

from config import settings

celery_app = Celery(
    "maestro_claudio",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,

    # Routing: todas las tasks de procesamiento van a la cola 'materials'.
    task_routes={"workers.tasks.*": {"queue": "materials"}},
    task_default_queue="materials",

    # Visibilidad de progreso: STARTED se reporta cuando un worker toma la task.
    task_track_started=True,

    # Acknowledgement tras éxito (no antes) — si el worker cae, la task vuelve.
    task_acks_late=True,
    worker_prefetch_multiplier=1,  # justo para tasks largas (transcripción, etc.)

    # Tasks largas: límite suave 30 min, hard 35.
    task_soft_time_limit=30 * 60,
    task_time_limit=35 * 60,

    # Resultado expira en 1 día (no necesitamos historial largo).
    result_expires=24 * 3600,
)


if __name__ == "__main__":
    celery_app.start()

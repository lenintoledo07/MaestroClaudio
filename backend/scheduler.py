"""Scheduler de tareas periódicas (APScheduler).

Por ahora solo corre los recordatorios de evaluaciones (7 días y 1 día). El
envío real por WhatsApp/push se hace contra `notify_user()`, que en Fase 1 es
un stub que loggea. En Fase 5 se reemplaza por whatsapp_service.send_notification.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from database import get_pool

logger = logging.getLogger(__name__)

# Hora local de envío (08:00 hora Chile = 11:00 UTC en horario estándar).
# Cuando agreguemos WhatsApp real, podremos respetar users.timezone por usuario.
DEFAULT_SEND_HOUR_UTC = 11

_scheduler: AsyncIOScheduler | None = None


async def notify_user(
    user_id, kind: str, payload: dict
) -> None:  # pragma: no cover - stub
    """Stub Fase 1. En Fase 5 esto invoca a whatsapp_service.send_notification."""
    logger.info(
        "[notify stub] user=%s kind=%s payload=%s", user_id, kind, payload
    )


async def remind_upcoming_evaluations() -> None:
    """Job diario: busca evaluaciones a 7 días y a 1 día y notifica si no se
    notificó antes. Marca el flag correspondiente para no repetir.
    """
    pool = get_pool()
    today = date.today()
    target_7d = today + timedelta(days=7)
    target_1d = today + timedelta(days=1)

    async with pool.acquire() as conn:
        # Recordatorios a 7 días
        rows_7d = await conn.fetch(
            """
            SELECT e.id, e.title, e.weight_pct, e.course_id,
                   c.name AS course_name, c.user_id
            FROM evaluations e
            JOIN courses c ON c.id = e.course_id AND c.status != 'deleted'
            WHERE e.due_date = $1 AND e.status = 'pending'
              AND e.reminder_sent_7d = FALSE
            """,
            target_7d,
        )
        for r in rows_7d:
            await notify_user(
                r["user_id"],
                "eval_reminder_7d",
                {
                    "title": r["title"],
                    "course_name": r["course_name"],
                    "weight_pct": float(r["weight_pct"]) if r["weight_pct"] else None,
                },
            )
            await conn.execute(
                "UPDATE evaluations SET reminder_sent_7d = TRUE WHERE id = $1",
                r["id"],
            )

        # Recordatorios a 1 día (mañana)
        rows_1d = await conn.fetch(
            """
            SELECT e.id, e.title, e.course_id,
                   c.name AS course_name, c.user_id
            FROM evaluations e
            JOIN courses c ON c.id = e.course_id AND c.status != 'deleted'
            WHERE e.due_date = $1 AND e.status = 'pending'
              AND e.reminder_sent_1d = FALSE
            """,
            target_1d,
        )
        for r in rows_1d:
            await notify_user(
                r["user_id"],
                "eval_reminder_1d",
                {"title": r["title"], "course_name": r["course_name"]},
            )
            await conn.execute(
                "UPDATE evaluations SET reminder_sent_1d = TRUE WHERE id = $1",
                r["id"],
            )

    logger.info(
        "Recordatorios procesados: 7d=%d, 1d=%d", len(rows_7d), len(rows_1d)
    )


def start_scheduler() -> AsyncIOScheduler:
    """Arranca el scheduler. Se llama desde el lifespan de FastAPI."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        remind_upcoming_evaluations,
        trigger=CronTrigger(hour=DEFAULT_SEND_HOUR_UTC, minute=0),
        id="eval_reminders",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
    )
    _scheduler.start()
    logger.info(
        "Scheduler iniciado: eval_reminders @ %02d:00 UTC", DEFAULT_SEND_HOUR_UTC
    )
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler detenido")

"""Scheduler de tareas periódicas (APScheduler).

Jobs:
- `eval_reminders`  diario @11:00 UTC — recordatorios 7d/1d vía WhatsApp.
- `weekly_calendar` lunes  @11:00 UTC — sync Calendar de cada user
                                        + checklist WhatsApp si faltan grabs.

`notify_user` ahora delega en `whatsapp_service.send_notification`. Si las
keys de WhatsApp no están seteadas, el service loggea y devuelve False sin
romper.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from database import get_pool
from services import calendar_service, push_notification_service, whatsapp_service

logger = logging.getLogger(__name__)

# Hora local de envío (08:00 hora Chile = 11:00 UTC en horario estándar).
# Cuando agreguemos WhatsApp real, podremos respetar users.timezone por usuario.
DEFAULT_SEND_HOUR_UTC = 11

_scheduler: AsyncIOScheduler | None = None


async def notify_user(user_id, kind: str, payload: dict) -> None:
    """Despacha la notificación por todos los canales disponibles:
       WhatsApp + push nativo. Cada uno es no-op si no está configurado."""
    logger.info("notify user=%s kind=%s", user_id, kind)
    try:
        await whatsapp_service.send_notification(user_id, kind, payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("whatsapp notify falló (no es bloqueante): %s", exc)
    try:
        await push_notification_service.send_push(user_id, kind, payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("push notify falló (no es bloqueante): %s", exc)


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
            tips_n = await conn.fetchval(
                "SELECT COUNT(*) FROM signals WHERE course_id = $1 AND type = 'exam_tip'",
                r["course_id"],
            )
            weight = r["weight_pct"]
            await notify_user(
                r["user_id"],
                "eval_reminder_7d",
                {
                    "title": r["title"],
                    "course_name": r["course_name"],
                    "weight_pct": f"{float(weight):.0f}" if weight else "—",
                    "tips_n": tips_n or 0,
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
                {
                    "title": r["title"],
                    "course_name": r["course_name"],
                    "course_id": str(r["course_id"]),
                },
            )
            await conn.execute(
                "UPDATE evaluations SET reminder_sent_1d = TRUE WHERE id = $1",
                r["id"],
            )

    logger.info(
        "Recordatorios procesados: 7d=%d, 1d=%d", len(rows_7d), len(rows_1d)
    )


async def weekly_calendar_sync() -> None:
    """Lunes 11:00 UTC: para cada user activo, sincroniza Calendar y manda
    checklist por WhatsApp si quedaron clases sin grabar la semana pasada."""
    pool = get_pool()
    async with pool.acquire() as conn:
        users = await conn.fetch("SELECT id FROM users")
        if not users:
            return
        today = date.today()
        last_monday = today - timedelta(days=today.weekday() + 7)
        last_sunday = last_monday + timedelta(days=6)
        week_n = today.isocalendar()[1]

        for u in users:
            user_id = u["id"]
            try:
                summary = await calendar_service.sync_user_calendar(user_id)
                logger.info("Calendar sync user=%s %s", user_id, summary)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Calendar sync user=%s falló: %s", user_id, exc)
                continue

            missing = await conn.fetch(
                """
                SELECT ce.title, ce.event_date, c.name AS course_name
                FROM calendar_events ce
                JOIN courses c ON c.id = ce.course_id
                WHERE c.user_id = $1
                  AND c.status = 'active'
                  AND ce.event_date BETWEEN $2 AND $3
                  AND ce.material_status = 'missing'
                ORDER BY ce.event_date
                """,
                user_id, last_monday, last_sunday,
            )
            if not missing:
                continue

            lines = [
                f"• {r['event_date'].strftime('%a %d/%m')} · {r['course_name']} — {r['title']}"
                for r in missing
            ]
            await notify_user(
                user_id,
                "weekly_checklist",
                {"week_n": week_n, "missing_list": "\n".join(lines)},
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
    _scheduler.add_job(
        weekly_calendar_sync,
        trigger=CronTrigger(day_of_week="mon", hour=DEFAULT_SEND_HOUR_UTC, minute=5),
        id="weekly_calendar",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
    )
    _scheduler.start()
    logger.info(
        "Scheduler iniciado: eval_reminders @ %02d:00 UTC, weekly_calendar lun @ %02d:05 UTC",
        DEFAULT_SEND_HOUR_UTC, DEFAULT_SEND_HOUR_UTC
    )
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler detenido")

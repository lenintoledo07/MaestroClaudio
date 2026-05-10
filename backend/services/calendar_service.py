"""Sincronización con Google Calendar (Fase 5.1).

Detecta clases del Master en el calendario del usuario por substring match
contra los nombres de las materias activas, y mantiene `calendar_events`
actualizada con el `material_status` (missing/partial/complete) según haya
materiales procesados en el módulo del mismo curso para esa fecha.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID

import asyncpg
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from config import settings
from services.auth_service import get_valid_google_token

logger = logging.getLogger(__name__)


async def _credentials_for_user(user_id: UUID) -> Credentials:
    conn = await asyncpg.connect(settings.DATABASE_URL, command_timeout=10)
    try:
        token = await get_valid_google_token(conn, user_id)
    finally:
        await conn.close()
    return Credentials(token=token["access_token"])


def _build_client(creds: Credentials):
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _parse_event_datetime(raw: dict) -> tuple[date | None, time | None, time | None]:
    """Devuelve (event_date, start_time, end_time). Soporta all-day y dateTime."""
    start = raw.get("start", {})
    end = raw.get("end", {})
    if "date" in start:
        return date.fromisoformat(start["date"]), None, None
    s = start.get("dateTime")
    e = end.get("dateTime")
    if not s:
        return None, None, None
    s_dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    e_dt = datetime.fromisoformat(e.replace("Z", "+00:00")) if e else None
    return s_dt.date(), s_dt.time().replace(microsecond=0), (e_dt.time().replace(microsecond=0) if e_dt else None)


def _match_course(title: str, courses: list[asyncpg.Record]) -> asyncpg.Record | None:
    """Match case-insensitive por nombre y código del curso."""
    lo = (title or "").lower()
    for c in courses:
        if c["name"] and c["name"].lower() in lo:
            return c
        if c["code"] and c["code"].lower() in lo:
            return c
    return None


async def _resolve_module(
    conn: asyncpg.Connection, course_id: UUID, event_date: date | None
) -> UUID | None:
    """Si hay un módulo con `class_date == event_date` lo usamos; si no, None."""
    if not event_date:
        return None
    return await conn.fetchval(
        "SELECT id FROM modules WHERE course_id = $1 AND class_date = $2 LIMIT 1",
        course_id, event_date,
    )


async def _compute_material_status(
    conn: asyncpg.Connection, course_id: UUID, module_id: UUID | None, event_date: date | None
) -> str:
    """Decide missing/partial/complete a partir de los materials del módulo o curso."""
    if module_id:
        rows = await conn.fetch(
            "SELECT status FROM materials WHERE module_id = $1",
            module_id,
        )
    elif event_date:
        # Fallback: materials del mismo curso creados ±2 días del evento
        rows = await conn.fetch(
            """
            SELECT status FROM materials
            WHERE course_id = $1 AND created_at::date BETWEEN $2 AND $3
            """,
            course_id, event_date - timedelta(days=2), event_date + timedelta(days=2),
        )
    else:
        rows = []
    if not rows:
        return "missing"
    statuses = {r["status"] for r in rows}
    if "ready" in statuses:
        return "complete"
    if statuses & {"pending", "downloading", "transcribing", "extracting"}:
        return "partial"
    return "missing"


async def sync_user_calendar(user_id: UUID) -> dict[str, int]:
    """Lee el calendario del usuario y mantiene `calendar_events` al día.

    Ventana: -2 semanas .. +4 semanas. Solo eventos cuyo título matchee con
    alguna materia activa del usuario.
    """
    creds = await _credentials_for_user(user_id)
    service = _build_client(creds)

    today = date.today()
    time_min = (datetime.combine(today - timedelta(weeks=2), time.min)
                .replace(tzinfo=timezone.utc).isoformat())
    time_max = (datetime.combine(today + timedelta(weeks=4), time.max)
                .replace(tzinfo=timezone.utc).isoformat())

    pool_conn = await asyncpg.connect(settings.DATABASE_URL, command_timeout=10)
    try:
        courses = await pool_conn.fetch(
            "SELECT id, name, code FROM courses WHERE user_id = $1 AND status = 'active'",
            user_id,
        )
        if not courses:
            return {"synced": 0, "new": 0, "updated": 0}

        try:
            page = service.events().list(
                calendarId="primary",
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy="startTime",
                maxResults=250,
            ).execute()
        except HttpError as exc:
            logger.error("Calendar list falló: %s", exc)
            raise

        items = page.get("items", [])
        synced = new_n = updated_n = 0

        for raw in items:
            title = raw.get("summary") or ""
            course = _match_course(title, courses)
            if not course:
                continue

            event_date, start_t, end_t = _parse_event_datetime(raw)
            if not event_date:
                continue

            module_id = await _resolve_module(pool_conn, course["id"], event_date)
            material_status = await _compute_material_status(
                pool_conn, course["id"], module_id, event_date
            )

            existing = await pool_conn.fetchrow(
                "SELECT id, title, event_date, start_time, end_time, material_status, module_id "
                "FROM calendar_events WHERE google_event_id = $1",
                raw["id"],
            )
            if existing is None:
                await pool_conn.execute(
                    """
                    INSERT INTO calendar_events
                        (google_event_id, course_id, module_id, title,
                         event_date, start_time, end_time, material_status)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                    """,
                    raw["id"], course["id"], module_id, title,
                    event_date, start_t, end_t, material_status,
                )
                new_n += 1
            else:
                changed = (
                    existing["title"] != title
                    or existing["event_date"] != event_date
                    or existing["start_time"] != start_t
                    or existing["end_time"] != end_t
                    or existing["material_status"] != material_status
                    or existing["module_id"] != module_id
                )
                if changed:
                    await pool_conn.execute(
                        """
                        UPDATE calendar_events SET
                            course_id = $2, module_id = $3, title = $4,
                            event_date = $5, start_time = $6, end_time = $7,
                            material_status = $8
                        WHERE google_event_id = $1
                        """,
                        raw["id"], course["id"], module_id, title,
                        event_date, start_t, end_t, material_status,
                    )
                    updated_n += 1
            synced += 1

        # Persistir el linkeo modules.calendar_event_id si conocemos el match
        await pool_conn.execute(
            """
            UPDATE modules m
            SET calendar_event_id = ce.google_event_id
            FROM calendar_events ce
            WHERE ce.module_id = m.id
              AND (m.calendar_event_id IS NULL OR m.calendar_event_id <> ce.google_event_id)
            """
        )
        return {"synced": synced, "new": new_n, "updated": updated_n}
    finally:
        await pool_conn.close()


async def get_weekly_status(user_id: UUID, conn: asyncpg.Connection) -> list[dict[str, Any]]:
    """Eventos de la semana actual agrupados por curso."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    rows = await conn.fetch(
        """
        SELECT ce.id, ce.google_event_id, ce.title, ce.event_date,
               ce.start_time, ce.material_status, ce.module_id,
               c.id AS course_id, c.name AS course_name, c.code AS course_code,
               c.color AS course_color,
               (SELECT m.id FROM materials m
                  WHERE m.course_id = c.id
                    AND (ce.module_id IS NULL OR m.module_id = ce.module_id)
                    AND m.status = 'ready'
                  ORDER BY m.created_at DESC LIMIT 1) AS material_id
        FROM calendar_events ce
        JOIN courses c ON c.id = ce.course_id
        WHERE c.user_id = $1
          AND c.status = 'active'
          AND ce.event_date BETWEEN $2 AND $3
        ORDER BY ce.event_date, ce.start_time
        """,
        user_id, monday, sunday,
    )

    by_course: dict[UUID, dict[str, Any]] = {}
    for r in rows:
        cid = r["course_id"]
        if cid not in by_course:
            by_course[cid] = {
                "course_id": cid,
                "course_name": r["course_name"],
                "course_code": r["course_code"],
                "course_color": r["course_color"],
                "events": [],
            }
        by_course[cid]["events"].append({
            "event_id": r["id"],
            "event_date": r["event_date"],
            "start_time": str(r["start_time"]) if r["start_time"] else None,
            "title": r["title"],
            "material_status": r["material_status"],
            "material_id": r["material_id"],
            "day_label": r["event_date"].strftime("%a %d") if r["event_date"] else None,
        })
    return list(by_course.values())

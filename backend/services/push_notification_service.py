"""Notificaciones push nativas via Expo Push API (Fase 6.3).

Reusa los mismos templates de `whatsapp_service` para que el contenido
sea consistente entre canales. La función pública `send_push(user_id, kind,
data)` es no-op si el user no tiene `users.push_token` (no hay device
registrado).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import asyncpg
import httpx

from config import settings
from services.whatsapp_service import _TEMPLATES

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Mapeo de tipo de evento → screen del mobile (Expo Router) que se abre al tap.
ROUTE_BY_KIND = {
    "material_ready":     {"path": "/course/{course_id}"},
    "material_error":     {"path": "/course/{course_id}"},
    "weekly_checklist":   {"path": "/(tabs)"},
    "eval_reminder_7d":   {"path": "/course/{course_id}"},
    "eval_reminder_1d":   {"path": "/course/{course_id}"},
    "deploy_success":     {"path": "/(tabs)"},
    "deploy_error":       {"path": "/(tabs)"},
}


async def send_push(user_id: UUID, kind: str, data: dict[str, Any]) -> bool:
    """Manda push al dispositivo del user. Devuelve False sin error si no
    hay push_token registrado o si Expo rechaza."""
    template = _TEMPLATES.get(kind)
    if template is None:
        logger.warning("push: template desconocido %s", kind)
        return False

    payload = {"frontend": settings.FRONTEND_URL, **data}
    try:
        body_text = template.format(**payload)
    except KeyError as exc:
        logger.error("push template %s falta variable: %s", kind, exc)
        return False

    push_token = await _get_push_token(user_id)
    if not push_token:
        return False

    # Title corto desde la primera línea del template (sin asteriscos markdown)
    first_line = body_text.split("\n", 1)[0].lstrip("✅⚠️📅⏰🔴📌•◇⭐ ").replace("*", "")
    title = first_line[:60] or "Maestro Claudio"

    route_template = ROUTE_BY_KIND.get(kind, {}).get("path", "/(tabs)")
    try:
        route = route_template.format(**{k: str(v) for k, v in payload.items()})
    except KeyError:
        route = "/(tabs)"

    expo_payload = {
        "to": push_token,
        "title": title,
        "body": body_text,
        "sound": "default",
        "data": {"type": kind, "route": route, **data},
        "priority": "high",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(EXPO_PUSH_URL, json=expo_payload)
        if resp.status_code >= 400:
            logger.warning("Expo push HTTP %d: %s", resp.status_code, resp.text[:200])
            return False
        # Expo devuelve {"data":{"status":"ok"|"error",...}}
        ok = (resp.json().get("data", {}) or {}).get("status") == "ok"
        if not ok:
            logger.warning("Expo push rechazado: %s", resp.text[:200])
        return ok
    except httpx.HTTPError as exc:
        logger.warning("Expo push red error: %s", exc)
        return False


async def _get_push_token(user_id: UUID) -> str | None:
    conn = await asyncpg.connect(settings.DATABASE_URL, command_timeout=10)
    try:
        return await conn.fetchval("SELECT push_token FROM users WHERE id = $1", user_id)
    finally:
        await conn.close()

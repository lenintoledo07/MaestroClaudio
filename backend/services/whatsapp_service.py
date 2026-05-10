"""WhatsApp Meta Cloud API (Fase 5.2).

Outbound:
- send_message(to, text) — POST a graph.facebook.com con retry x3.
- send_notification(user_id, event_type, data) — templates predefinidas.

Inbound (read-only):
- handle_incoming_message(body) — intents básicos: tips / pendientes / RAG.
  NUNCA ejecuta acciones de gestión.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

import asyncpg
import httpx

from config import settings
from services import claude_service, embeddings_service

logger = logging.getLogger(__name__)


def _api_url() -> str:
    return (
        f"https://graph.facebook.com/{settings.META_API_VERSION}"
        f"/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    )


def _is_configured() -> bool:
    return bool(settings.WHATSAPP_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID)


# ── Outbound ────────────────────────────────────────────────────────────────


async def send_message(to: str, text: str) -> bool:
    """Envía un mensaje de texto. Retry x3 con backoff (2s, 4s, 8s).

    Devuelve True si se envió, False si todos los intentos fallaron o si
    WhatsApp no está configurado.
    """
    if not _is_configured():
        logger.info("[whatsapp stub] no configurado · to=%s text=%s", to, text[:80])
        return False

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text[:4096]},  # Meta corta a 4096
    }
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    delay = 2
    async with httpx.AsyncClient(timeout=15.0) as client:
        for attempt in (1, 2, 3):
            try:
                resp = await client.post(_api_url(), json=payload, headers=headers)
                if resp.status_code < 400:
                    return True
                logger.warning(
                    "WhatsApp HTTP %d (intento %d/3): %s",
                    resp.status_code, attempt, resp.text[:200],
                )
            except httpx.HTTPError as exc:
                logger.warning("WhatsApp red error (intento %d/3): %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(delay)
                delay *= 2
    return False


_TEMPLATES = {
    "material_ready": (
        "✅ *Clase lista* — {course_name} {module_label}\n"
        "{tips_n} exam tips · {refs_n} referencias · {qa_n} Q&A\n"
        "Abrir: {frontend}/class/{material_id}"
    ),
    "material_error": (
        "⚠️ Error procesando {filename}.\n"
        "Revisar: {frontend}/course/{course_id}"
    ),
    "weekly_checklist": (
        "📅 *Semana {week_n} — Maestro Claudio*\n\n"
        "Clases sin procesar:\n{missing_list}\n\n"
        "¿Tenés las grabaciones disponibles?"
    ),
    "eval_reminder_7d": (
        "⏰ *{title}* en 7 días\n"
        "{course_name} · {weight_pct}% de la nota\n"
        "Exam tips acumulados: {tips_n}"
    ),
    "eval_reminder_1d": (
        "🔴 *{title}* es MAÑANA\n"
        "{course_name}\n"
        "Ver exam tips: {frontend}/course/{course_id}?view=exam-tips"
    ),
    "deploy_success": "✅ Maestro Claudio actualizado correctamente",
    "deploy_error":   "❌ Error en el deploy. Revisar GitHub Actions.",
}


async def send_notification(
    user_id: UUID, event_type: str, data: dict[str, Any]
) -> bool:
    """Construye el texto desde el template y lo envía al `whatsapp_number`
    del usuario (o a WHATSAPP_MY_NUMBER si el campo está vacío)."""
    template = _TEMPLATES.get(event_type)
    if template is None:
        logger.warning("Template WhatsApp desconocido: %s", event_type)
        return False

    payload = {
        "frontend": settings.FRONTEND_URL,
        **data,
    }
    try:
        text = template.format(**payload)
    except KeyError as exc:
        logger.error("Template %s falta variable: %s", event_type, exc)
        return False

    to = await _resolve_to_number(user_id)
    if not to:
        logger.info("Usuario %s sin whatsapp_number ni MY_NUMBER configurado, skip", user_id)
        return False

    return await send_message(to, text)


async def _resolve_to_number(user_id: UUID) -> str | None:
    """Devuelve el número E.164 al que mandar. Prioridad:
    users.whatsapp_number → settings.WHATSAPP_MY_NUMBER (modo single-user)."""
    conn = await asyncpg.connect(settings.DATABASE_URL, command_timeout=10)
    try:
        row = await conn.fetchrow(
            "SELECT whatsapp_number FROM users WHERE id = $1", user_id
        )
    finally:
        await conn.close()
    if row and row["whatsapp_number"]:
        return row["whatsapp_number"]
    return settings.WHATSAPP_MY_NUMBER or None


# ── Inbound ─────────────────────────────────────────────────────────────────


async def handle_incoming_message(body: dict[str, Any]) -> None:
    """Procesa un payload del webhook de WhatsApp. Read-only."""
    msg, from_number = _extract_message(body)
    if msg is None:
        return

    # Whitelist (riesgo #3): solo el dueño del bot. Modo single-user.
    if settings.WHATSAPP_MY_NUMBER and from_number != settings.WHATSAPP_MY_NUMBER:
        logger.info("WhatsApp from=%s NOT in whitelist, ignorado", from_number)
        return

    text = (msg.get("text") or {}).get("body") or ""
    if not text.strip():
        return

    user = await _resolve_user_by_number(from_number)
    if not user:
        await send_message(from_number, "No tengo tu cuenta vinculada. Iniciá sesión en la web primero.")
        return

    intent = _detect_intent(text)
    logger.info("WhatsApp intent=%s from=%s", intent, from_number)

    try:
        reply = await _route_intent(user, intent, text)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error procesando intent")
        reply = f"Tuve un error procesando tu mensaje: {exc}"

    await send_message(from_number, reply)


def _extract_message(body: dict[str, Any]) -> tuple[dict | None, str | None]:
    """Saca el primer mensaje y el `from` del payload de Meta."""
    try:
        change = body["entry"][0]["changes"][0]["value"]
        msgs = change.get("messages") or []
        if not msgs:
            return None, None
        msg = msgs[0]
        return msg, msg.get("from")
    except (KeyError, IndexError, TypeError):
        return None, None


def _detect_intent(text: str) -> str:
    lo = text.lower().strip()
    if any(k in lo for k in ("exam tips", "exam-tips", "tips ")) or lo == "tips":
        return "exam_tips"
    if any(k in lo for k in ("pendiente", "qué tengo", "que tengo", "próxim", "proxim")):
        return "pending"
    if any(k in lo for k in ("agregar materia", "borrar", "eliminar", "subir", "agendar")):
        return "management_blocked"
    return "rag"


async def _resolve_user_by_number(from_number: str | None):
    if not from_number:
        return None
    conn = await asyncpg.connect(settings.DATABASE_URL, command_timeout=10)
    try:
        row = await conn.fetchrow(
            "SELECT id, email, name FROM users WHERE whatsapp_number = $1",
            from_number,
        )
        if row:
            return dict(row)
        # Fallback: si MY_NUMBER coincide y solo hay un user, usá ese.
        if from_number == settings.WHATSAPP_MY_NUMBER:
            row = await conn.fetchrow(
                "SELECT id, email, name FROM users ORDER BY created_at LIMIT 1"
            )
            return dict(row) if row else None
        return None
    finally:
        await conn.close()


async def _route_intent(user: dict, intent: str, text: str) -> str:
    if intent == "management_blocked":
        return (
            "Para gestionar materias, materiales o evaluaciones, abrí la app: "
            f"{settings.FRONTEND_URL}/dashboard"
        )
    if intent == "exam_tips":
        return await _last_exam_tips(user["id"])
    if intent == "pending":
        return await _upcoming_evaluations(user["id"])
    return await _rag_answer(user["id"], text)


async def _last_exam_tips(user_id: UUID) -> str:
    conn = await asyncpg.connect(settings.DATABASE_URL, command_timeout=10)
    try:
        rows = await conn.fetch(
            """
            SELECT s.content, c.name AS course_name
            FROM signals s
            JOIN courses c ON c.id = s.course_id
            WHERE c.user_id = $1 AND s.type = 'exam_tip'
            ORDER BY s.created_at DESC
            LIMIT 5
            """,
            user_id,
        )
    finally:
        await conn.close()
    if not rows:
        return "Aún no tenés exam tips registrados."
    lines = [f"⭐ *{r['course_name']}*\n{r['content']}" for r in rows]
    return "Últimos exam tips:\n\n" + "\n\n".join(lines)


async def _upcoming_evaluations(user_id: UUID) -> str:
    conn = await asyncpg.connect(settings.DATABASE_URL, command_timeout=10)
    try:
        rows = await conn.fetch(
            """
            SELECT e.title, e.due_date, c.name AS course_name
            FROM evaluations e
            JOIN courses c ON c.id = e.course_id
            WHERE c.user_id = $1
              AND e.status = 'pending'
              AND e.due_date >= CURRENT_DATE
            ORDER BY e.due_date
            LIMIT 5
            """,
            user_id,
        )
    finally:
        await conn.close()
    if not rows:
        return "No tenés evaluaciones próximas."
    lines = [
        f"📌 {r['title']} · {r['course_name']} · {r['due_date'].isoformat()}"
        for r in rows
    ]
    return "Próximas evaluaciones:\n\n" + "\n".join(lines)


async def _rag_answer(user_id: UUID, query: str) -> str:
    """RAG mínimo. Reusa search_similar + chat_rag pero abre su propia
    conexión porque no estamos en un request HTTP."""
    conn = await asyncpg.connect(settings.DATABASE_URL, command_timeout=10)
    try:
        chunks = await embeddings_service.search_similar(
            conn=conn,
            query=query,
            user_id=user_id,
            top_k=6,
        )
    finally:
        await conn.close()
    answer = await claude_service.chat_rag(
        query=query,
        context_chunks=chunks,
        history=None,
        mode="explain",
    )
    if isinstance(answer, dict):
        answer = str(answer)
    return answer[:3500]  # holgado vs los 4096 de Meta

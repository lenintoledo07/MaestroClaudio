"""Webhook de WhatsApp (Fase 5.2).

Whitelist (riesgo #3 sesión revisión): el handler descarta cualquier mensaje
de un número que no sea WHATSAPP_MY_NUMBER. En modo multi-user el filtro
se haría por whatsapp_number registrado.

Defensas del webhook (POST /webhook/whatsapp):
- HMAC-SHA256 sobre el body crudo con META_APP_SECRET (header X-Hub-Signature-256).
  Sin esto cualquiera con la URL pública dispara send_message saliente.
- Idempotencia por message id en Redis (TTL 24h). Meta reintenta cuando el
  ack tarda; sin dedupe el pipeline corre dos veces (doble RAG, doble respuesta).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging

import redis.asyncio as redis
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, Request, Response

from config import settings
from services import whatsapp_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["whatsapp"])

# TTL de la marca de mensaje procesado. Meta reintenta hasta varias horas;
# 24h cubre cualquier ventana razonable.
_DEDUPE_TTL_SECONDS = 24 * 3600


@router.get("/whatsapp")
async def verify(
    hub_mode: str = Query(default="", alias="hub.mode"),
    hub_verify_token: str = Query(default="", alias="hub.verify_token"),
    hub_challenge: str = Query(default="", alias="hub.challenge"),
):
    """Endpoint de verificación que Meta llama al registrar el webhook."""
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(status_code=403)


def _verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    """HMAC-SHA256 del body crudo contra META_APP_SECRET.

    Si META_APP_SECRET está vacío en dev: rechaza igual (fail-closed). Hay que
    setear el secret antes de exponer el webhook a internet."""
    if not settings.META_APP_SECRET:
        logger.error("META_APP_SECRET vacío — rechazando webhook (fail-closed)")
        return False
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.META_APP_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    received = signature_header[len("sha256="):]
    return hmac.compare_digest(expected, received)


def _extract_message_ids(body: dict) -> list[str]:
    """Devuelve los IDs de Meta de los mensajes en el payload (puede haber varios)."""
    ids: list[str] = []
    for entry in body.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value", {}) or {}
            for msg in value.get("messages", []) or []:
                mid = msg.get("id")
                if mid:
                    ids.append(mid)
    return ids


async def _is_duplicate(message_ids: list[str]) -> bool:
    """Marca cada message_id en Redis. Devuelve True si TODOS ya estaban marcados.

    Si al menos uno es nuevo, lo procesamos (no es duplicado completo)."""
    if not message_ids:
        # Sin IDs (ej. evento de status). No deduplicamos, dejamos pasar.
        return False
    client = redis.from_url(settings.REDIS_URL)
    try:
        any_new = False
        for mid in message_ids:
            # SET NX EX devuelve True si SETeó (era nuevo), None/False si ya existía.
            was_set = await client.set(
                name=f"wa:msg:{mid}",
                value="1",
                nx=True,
                ex=_DEDUPE_TTL_SECONDS,
            )
            if was_set:
                any_new = True
        return not any_new
    finally:
        await client.aclose()


@router.post("/whatsapp")
async def incoming(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str | None = Header(default=None, alias="X-Hub-Signature-256"),
):
    """Recibe mensajes entrantes. Siempre 200 cuando el HMAC es válido y el
    payload no es duplicado, así Meta no reintenta. 401 si HMAC inválido."""
    raw = await request.body()

    if not _verify_signature(raw, x_hub_signature_256):
        logger.warning("Webhook WhatsApp con firma HMAC inválida — rechazado")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(raw.decode("utf-8")) if raw else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        body = {}

    message_ids = _extract_message_ids(body)
    if await _is_duplicate(message_ids):
        logger.info("Webhook WhatsApp duplicado (ids=%s), skip", message_ids)
        return {"status": "duplicate"}

    background_tasks.add_task(whatsapp_service.handle_incoming_message, body)
    return {"status": "received"}

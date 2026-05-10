"""Webhook de WhatsApp (Fase 5.2).

Whitelist (riesgo #3 sesión revisión): el handler descarta cualquier mensaje
de un número que no sea WHATSAPP_MY_NUMBER. En modo multi-user el filtro
se haría por whatsapp_number registrado.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Query, Request, Response

from config import settings
from services import whatsapp_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["whatsapp"])


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


@router.post("/whatsapp")
async def incoming(request: Request, background_tasks: BackgroundTasks):
    """Recibe mensajes entrantes. Siempre 200 para que Meta no reintente.

    El procesamiento se delega a una BackgroundTask para no bloquear el ack."""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    background_tasks.add_task(whatsapp_service.handle_incoming_message, body)
    return {"status": "received"}

"""Text-to-speech con ElevenLabs (Fase 3.1).

Genera el audio narrado del resumen de cada clase con la voz "Mateo" en
español neutro (eleven_multilingual_v2). La task `process_material` llama
a `generate_audio_summary()` después de obtener el summary de Claude.

Patrón de la casa: el servicio es puro — devuelve el path del archivo
generado y el worker es el que persiste en la DB. Esto matchea cómo se
comportan deepgram_service y claude_service.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

import httpx

from config import settings

logger = logging.getLogger(__name__)

AUDIO_DIR = "/app/audio"
MAX_TTS_CHARS = 5000
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"
DEFAULT_VOICE_SETTINGS = {"stability": 0.5, "similarity_boost": 0.75}


def _truncate_at_sentence(text: str, max_chars: int) -> str:
    """Trunca al último punto antes de `max_chars`. Si el último punto cae muy
    al principio del recorte (<60% del límite), corta duro para no perder
    demasiado contenido."""
    if len(text) <= max_chars:
        return text
    head = text[:max_chars]
    last_period = head.rfind(".")
    if last_period > int(max_chars * 0.6):
        return head[: last_period + 1]
    return head


async def generate_audio_summary(text: str, material_id: str) -> str:
    """Genera audio del resumen y lo guarda en /app/audio/{material_id}.mp3.

    Returns:
        Absolute path al mp3 generado (el caller persiste audio_path).

    Raises:
        RuntimeError: si faltan API key o voice id, o si la API falla tras
        un único reintento por rate-limit.
    """
    if not settings.ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY vacía en settings")
    if not settings.ELEVENLABS_VOICE_ID:
        raise RuntimeError("ELEVENLABS_VOICE_ID vacía en settings")

    payload_text = _truncate_at_sentence(text, MAX_TTS_CHARS)
    if len(text) > MAX_TTS_CHARS:
        logger.info(
            "TTS texto truncado de %d a %d chars (material=%s)",
            len(text), len(payload_text), material_id,
        )

    url = ELEVENLABS_URL.format(voice_id=settings.ELEVENLABS_VOICE_ID)
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    body = {
        "text": payload_text,
        "model_id": DEFAULT_MODEL_ID,
        "voice_settings": DEFAULT_VOICE_SETTINGS,
    }

    audio_bytes = await _post_with_rate_limit_retry(url, headers, body)

    os.makedirs(AUDIO_DIR, exist_ok=True)
    out_path = str(Path(AUDIO_DIR) / f"{material_id}.mp3")
    with open(out_path, "wb") as f:
        f.write(audio_bytes)

    logger.info("TTS ok material=%s bytes=%d path=%s",
                material_id, len(audio_bytes), out_path)
    return out_path


async def _post_with_rate_limit_retry(
    url: str, headers: dict, body: dict
) -> bytes:
    """Una sola reintenta tras 60s si la API responde 429."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        for attempt in (1, 2):
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code == 429 and attempt == 1:
                logger.warning("ElevenLabs 429 rate-limited, retry en 60s")
                await asyncio.sleep(60)
                continue
            if resp.status_code != 200:
                raise RuntimeError(
                    f"ElevenLabs HTTP {resp.status_code}: {resp.text[:200]}"
                )
            return resp.content
    raise RuntimeError("ElevenLabs: rate limit persistente tras retry")

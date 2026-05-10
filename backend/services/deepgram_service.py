"""Transcripción con Deepgram (nova-3, español, diarización).

Heurística PROFESOR / ALUMNO:
  El hablante con MÁS tiempo total hablado se etiqueta como PROFESOR; los
  demás como ALUMNO. Es una heurística frágil — falla si un alumno presenta
  un trabajo extenso. Riesgo conocido (#1 de la sesión de revisión); cuando
  agreguemos UI para corregir el mapeo, se reasigna desde la app. Mientras
  tanto la heurística es "good enough" para clases tradicionales.
"""

from __future__ import annotations

import logging
import os
from collections import defaultdict
from typing import Any, Iterator

import httpx

from config import settings

logger = logging.getLogger(__name__)

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
DEEPGRAM_PARAMS = {
    "model": "nova-3",
    "language": "es",
    "diarize": "true",
    "punctuate": "true",
    "paragraphs": "true",
    "smart_format": "true",
    "utterances": "true",
}


async def transcribe_video(file_path: str) -> dict[str, Any]:
    """Transcribe un archivo de audio/video con Deepgram.

    Returns:
        {
          "transcript_raw":       texto plano sin formato
          "transcript_formatted": "[PROFESOR 00:05:23] ...\\n[ALUMNO 00:23:41] ..."
          "duration_seconds":     int
          "speakers_count":       int
          "speaker_mapping":      {0: 'professor', 1: 'student', ...}
        }
    """
    if not settings.DEEPGRAM_API_KEY:
        # Fallback automático a Whisper si no hay key configurada.
        logger.warning("DEEPGRAM_API_KEY vacía, usando fallback Whisper")
        return await transcribe_fallback_whisper(file_path)

    file_size = os.path.getsize(file_path)
    headers = {
        "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
        "Content-Type": "application/octet-stream",
        # Content-Length explícito para evitar Transfer-Encoding: chunked,
        # que Deepgram acepta peor para uploads grandes.
        "Content-Length": str(file_size),
    }

    # Streaming real desde disco con chunks de 4MB. La task corre en un worker
    # con prefetch=1, así que bloquear el loop unos ms por read es aceptable
    # — pero NUNCA cargamos el archivo completo a RAM.
    async with httpx.AsyncClient(timeout=httpx.Timeout(60 * 30)) as client:
        resp = await client.post(
            DEEPGRAM_URL,
            params=DEEPGRAM_PARAMS,
            headers=headers,
            content=_stream_file(file_path),
        )

    if resp.status_code != 200:
        logger.error("Deepgram falló: %s %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"Deepgram HTTP {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    return _parse_deepgram_response(data)


def _parse_deepgram_response(data: dict) -> dict[str, Any]:
    metadata = data.get("metadata", {})
    duration = int(metadata.get("duration", 0)) or None

    results = data.get("results", {})
    channel = (results.get("channels") or [{}])[0]
    alternative = (channel.get("alternatives") or [{}])[0]

    transcript_raw = alternative.get("transcript", "")
    utterances = results.get("utterances", []) or []

    # 1. Cuánto habló cada speaker
    talk_time: dict[int, float] = defaultdict(float)
    for u in utterances:
        spk = u.get("speaker", 0)
        talk_time[int(spk)] += float(u.get("end", 0)) - float(u.get("start", 0))

    # 2. Heurística: el speaker con más tiempo es el PROFESOR
    speaker_mapping: dict[int, str] = {}
    if talk_time:
        sorted_by_time = sorted(talk_time.items(), key=lambda x: x[1], reverse=True)
        professor_id = sorted_by_time[0][0]
        for spk_id, _ in sorted_by_time:
            speaker_mapping[spk_id] = (
                "professor" if spk_id == professor_id else "student"
            )

    # 3. Construir transcript formateado con etiquetas y timestamps
    parts: list[str] = []
    for u in utterances:
        spk = int(u.get("speaker", 0))
        role = speaker_mapping.get(spk, "unknown").upper()
        ts = _seconds_to_hms(float(u.get("start", 0)))
        parts.append(f"[{role} {ts}] {u.get('transcript', '').strip()}")

    transcript_formatted = "\n".join(parts) if parts else transcript_raw

    return {
        "transcript_raw": transcript_raw,
        "transcript_formatted": transcript_formatted,
        "duration_seconds": duration,
        "speakers_count": len(speaker_mapping),
        "speaker_mapping": speaker_mapping,
    }


def _seconds_to_hms(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def _stream_file(path: str, chunk_size: int = 4 * 1024 * 1024) -> Iterator[bytes]:
    """Lee el archivo en chunks de 4MB. httpx itera el generador y stream-uploadea
    al servidor sin cargar el archivo completo a RAM."""
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            yield chunk


# ─────────────────────────────────────────────────────────────────────────────
# Fallback: Whisper local (modelo small, solo si Deepgram no está disponible)
# ─────────────────────────────────────────────────────────────────────────────


async def transcribe_fallback_whisper(file_path: str) -> dict[str, Any]:
    """Fallback con Whisper local. Sin diarización — solo transcripción plana.

    Whisper `small` ocupa ~2GB RAM. Solo usar si DEEPGRAM_API_KEY está vacía
    o si Deepgram falla repetidamente.
    """
    try:
        import whisper  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "Whisper fallback no disponible (paquete `openai-whisper` no instalado)"
        ) from exc

    logger.info("Whisper fallback transcribiendo %s", file_path)
    model = whisper.load_model("small")
    result = model.transcribe(file_path, language="es", fp16=False)

    text = result.get("text", "").strip()
    return {
        "transcript_raw": text,
        "transcript_formatted": text,  # sin diarización
        "duration_seconds": None,
        "speakers_count": 1,
        "speaker_mapping": {0: "unknown"},
    }

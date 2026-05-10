"""Estimación de costos por material procesado (Riesgo #4).

Aproxima el costo en USD de procesar un material a partir de su transcript
y duración, sumando los precios públicos de cada proveedor:
  - Deepgram nova-3   ~ $0.0043 / min
  - Claude Sonnet 4.6 ~ $3 in / $15 out por MTok
  - OpenAI embeddings ~ $0.02 / MTok (text-embedding-3-small)
  - ElevenLabs v2     ~ $0.0003 / char (orden de magnitud Creator plan)

Es una estimación, no un pago real — los proveedores facturan exacto. La idea
es saber a grandes rasgos cuánto cuesta una clase para detectar derroche
(transcripts gigantes, modos chat caros, etc.). Ajustar las constantes cuando
los precios cambien.
"""

from __future__ import annotations

import math
from typing import Any

# Tokens por carácter aproximados (es/en mezcla — Claude tokenizer es similar).
CHARS_PER_TOKEN = 4

# Precios USD (revisar periódicamente)
DEEPGRAM_PER_MIN = 0.0043
CLAUDE_INPUT_PER_MTOK = 3.0
CLAUDE_OUTPUT_PER_MTOK = 15.0
OPENAI_EMBEDDING_PER_MTOK = 0.02
ELEVENLABS_PER_CHAR = 0.0003

# Fudge factor: extract_signals divide el transcript en partes si es muy largo,
# así que multiplicamos los tokens de input por la cantidad de chunks Claude.
CLAUDE_INPUT_CHUNK_LIMIT = 200_000  # debe coincidir con _CHUNK_CHAR_LIMIT del service


def _tokens(text_len: int) -> int:
    return max(0, math.ceil(text_len / CHARS_PER_TOKEN))


def estimate(
    *,
    transcript: str | None,
    summary: str | None,
    duration_seconds: int | None,
    has_audio: bool,
    has_embeddings: bool,
    is_video: bool,
) -> dict[str, Any]:
    """Devuelve un dict con la estimación detallada y el total."""
    transcript_chars = len(transcript or "")
    summary_chars = len(summary or "")
    transcript_tokens = _tokens(transcript_chars)
    summary_tokens = _tokens(summary_chars)

    # Deepgram
    deepgram_usd = 0.0
    if is_video and duration_seconds:
        deepgram_usd = (duration_seconds / 60.0) * DEEPGRAM_PER_MIN

    # Claude — extract_signals (puede ser N partes) + generate_summary
    parts = max(1, math.ceil(transcript_chars / CLAUDE_INPUT_CHUNK_LIMIT)) if transcript_chars else 1
    claude_input_tokens = transcript_tokens * parts + transcript_tokens  # extract + summary input
    claude_output_tokens = summary_tokens + 4096 * parts  # summary out + ~4k por extract
    claude_usd = (
        (claude_input_tokens / 1_000_000) * CLAUDE_INPUT_PER_MTOK
        + (claude_output_tokens / 1_000_000) * CLAUDE_OUTPUT_PER_MTOK
    )

    # Embeddings (transcript completo)
    embeddings_usd = 0.0
    if has_embeddings:
        embeddings_usd = (transcript_tokens / 1_000_000) * OPENAI_EMBEDDING_PER_MTOK

    # ElevenLabs (solo summary)
    elevenlabs_usd = 0.0
    if has_audio:
        # Truncado a 5000 chars en elevenlabs_service.MAX_TTS_CHARS
        chars = min(summary_chars, 5000)
        elevenlabs_usd = chars * ELEVENLABS_PER_CHAR

    total = deepgram_usd + claude_usd + embeddings_usd + elevenlabs_usd
    return {
        "deepgram_usd": round(deepgram_usd, 4),
        "claude_usd": round(claude_usd, 4),
        "embeddings_usd": round(embeddings_usd, 4),
        "elevenlabs_usd": round(elevenlabs_usd, 4),
        "total_usd": round(total, 4),
    }

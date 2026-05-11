"""Wrapper de chat RAG sobre OpenAI (gpt-4o / gpt-4o-mini).

Existe como alternativa a claude_service.chat_rag para no atar el chat (que es
multi-turn y caro) a Anthropic. Mantenemos paridad de interface: misma firma,
mismo return type (`str` para modos prosa, `dict`/`list` para quiz/flashcards).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY vacía en settings")
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


SYSTEM_PROMPT_CHAT = """\
Eres Maestro Claudio, asistente de estudio personal de un estudiante de la
Maestría en Ciberseguridad de la Universidad Internacional de Valencia.
Tienes acceso al material de sus clases (transcripciones, PDFs, exports de
WhatsApp). Cuando respondas:
1. Basate PRIMERO en el contexto recuperado de los chunks.
2. Si el contexto no alcanza, decilo explícitamente con una frase del tipo
   "En tu material no encontré X, pero por conocimiento general puedo decirte..."
   y completá. Es importante marcar claramente qué viene de afuera.
3. Si el modo es 'quiz' o 'flashcards', respondé EXCLUSIVAMENTE con JSON.

Estilo: claro, directo, sin relleno académico. Citá los módulos/clases cuando
uses información específica del material.
"""


async def chat_rag_openai(
    *,
    query: str,
    context_chunks: list[dict],
    history: list[dict] | None = None,
    mode: str = "explain",
) -> str | dict | list:
    """Idéntica firma que claude_service.chat_rag pero ejecuta sobre OpenAI."""
    client = _get_client()

    context_text = "\n\n".join(
        f"[{c.get('course_name', '?')} > {c.get('module_name', '?')}] {c['content']}"
        for c in context_chunks
    ) or "(sin contexto recuperado)"

    if mode == "quiz":
        instruction = (
            "Generá 5 preguntas de opción múltiple sobre el tema. Devolvé un "
            'objeto JSON con la forma {"questions": [{"question": "...", '
            '"options": ["A","B","C","D"], "correct": 0..3, "explanation": "..."}]}.'
        )
    elif mode == "flashcards":
        instruction = (
            "Generá 10 pares pregunta/respuesta para flashcards. Devolvé un "
            'objeto JSON con la forma {"cards": [{"front": "...", "back": "..."}]}.'
        )
    elif mode == "exam_prep":
        instruction = (
            "Consolidá los exam_tips, conceptos clave y Q&A relevantes para "
            "preparar al estudiante. Respuesta en prosa, máximo 600 palabras."
        )
    else:
        instruction = "Respondé de forma explicativa con base en el contexto."

    user_prompt = (
        f"CONTEXTO RECUPERADO:\n{context_text}\n\n"
        f"INSTRUCCIÓN DE MODO ({mode}): {instruction}\n\n"
        f"PREGUNTA: {query}"
    )

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT_CHAT}]
    if history:
        for h in history[-6:]:
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_prompt})

    is_structured = mode in ("quiz", "flashcards")
    kwargs: dict[str, Any] = {
        "model": settings.OPENAI_CHAT_MODEL,
        "messages": messages,
        "max_tokens": 2048,
    }
    if is_structured:
        # JSON mode garantiza salida JSON válida (no String truncado).
        kwargs["response_format"] = {"type": "json_object"}

    resp = await client.chat.completions.create(**kwargs)
    raw = (resp.choices[0].message.content or "").strip()

    if is_structured:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("OpenAI devolvió JSON inválido en modo %s, fallback a string", mode)
            return raw
        # Aplanar: la API devuelve un objeto top-level con la lista adentro.
        # El frontend espera la lista directamente.
        if mode == "quiz":
            return parsed.get("questions", parsed)
        if mode == "flashcards":
            return parsed.get("cards", parsed)
        return parsed

    return raw

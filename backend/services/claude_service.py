"""Claude (Anthropic): extracción de señales pedagógicas, summary, chat RAG.

Usa prompt caching del system prompt (ahorra ~75% del costo de input tokens
en llamadas repetidas durante 5 min de TTL).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from uuid import UUID

import asyncpg
from anthropic import AsyncAnthropic, APIError

from config import settings

logger = logging.getLogger(__name__)

_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.CLAUDE_API_KEY:
            raise RuntimeError("CLAUDE_API_KEY vacía en settings")
        _client = AsyncAnthropic(api_key=settings.CLAUDE_API_KEY)
    return _client


# ─────────────────────────────────────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_EXTRACTION = """\
Eres un asistente especializado en extraer información pedagógica clave de
transcripciones de clases universitarias o chats académicos del programa de
Maestría en Ciberseguridad.

Reglas estrictas:
1. Prioriza siempre lo que dice el PROFESOR sobre lo que dicen los ALUMNOS.
2. Responde EXCLUSIVAMENTE con JSON válido. Sin texto adicional, sin markdown,
   sin ``` fences, sin explicaciones previas o posteriores.
3. Si no encuentras instancias de algún tipo, devuelve un array vacío [], no
   omitas la clave.
4. Para timestamps, usa formato MM:SS o HH:MM:SS si la transcripción los trae
   con el patrón "[ROLE HH:MM:SS]". Si no, usa null.
5. Parafrasea el contenido — no copies literal texto largo del profesor.
"""

USER_PROMPT_EXTRACTION_TEMPLATE = """\
Analiza la siguiente transcripción y extrae toda la información pedagógica.

Devuelve EXACTAMENTE este JSON (mismas claves, mismo orden):
{{
  "resumen_ejecutivo": "3-5 oraciones del tema central",
  "conceptos_clave": ["concepto1", "concepto2"],
  "exam_tips": [
    {{
      "contenido": "qué dijo (parafrasear)",
      "contexto": "por qué es importante para el examen",
      "speaker": "professor|student|unknown",
      "timestamp_aprox": "MM:SS o null",
      "importancia": "high|medium"
    }}
  ],
  "contenido_importante": [
    {{ "tema": "...", "detalle": "...", "nivel_enfasis": "high|medium" }}
  ],
  "referencias_externas": [
    {{
      "tipo": "paper|libro|norma|sitio|tool",
      "titulo": "...",
      "autor_o_entidad": "...",
      "donde_buscar": "..."
    }}
  ],
  "qa_aclaraciones": [
    {{
      "pregunta": "lo que preguntó el alumno",
      "respuesta_profesor": "cómo lo aclaró",
      "concepto_aclarado": "qué queda más claro",
      "importante": true
    }}
  ],
  "pendientes": [
    {{
      "descripcion": "qué hay que hacer",
      "fecha_mencionada": "YYYY-MM-DD o null",
      "tipo": "tarea|lectura|evaluacion|buscar_recurso"
    }}
  ]
}}

TRANSCRIPCIÓN:
{transcript}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Extracción de señales
# ─────────────────────────────────────────────────────────────────────────────

# ~50k tokens ≈ 200k chars (heurística conservadora). Por encima dividimos.
_CHUNK_CHAR_LIMIT = 200_000


async def extract_signals(
    *,
    conn: asyncpg.Connection,
    transcript: str,
    material_id: UUID,
    module_id: UUID | None,
    course_id: UUID | None,
    source: str = "recording",
) -> dict[str, Any]:
    """Extrae señales con Claude y las persiste en la tabla signals.

    Si el transcript supera _CHUNK_CHAR_LIMIT, se divide en partes y se
    consolidan los resultados.
    """
    if not transcript.strip():
        logger.info("Transcripción vacía para material=%s, skip extracción", material_id)
        return _empty_extraction()

    parts = _split_for_claude(transcript)
    logger.info(
        "Extrayendo signals: material=%s parts=%d total_chars=%d",
        material_id, len(parts), len(transcript),
    )

    consolidated = _empty_extraction()
    for i, part in enumerate(parts):
        result = await _call_extraction(part, model=settings.CLAUDE_MODEL)
        for key in (
            "conceptos_clave", "exam_tips", "contenido_importante",
            "referencias_externas", "qa_aclaraciones", "pendientes",
        ):
            consolidated[key].extend(result.get(key, []))
        if i == 0:
            consolidated["resumen_ejecutivo"] = result.get("resumen_ejecutivo", "")

    await _persist_signals(
        conn=conn,
        extraction=consolidated,
        material_id=material_id,
        module_id=module_id,
        course_id=course_id,
        source=source,
    )

    return consolidated


async def _call_extraction(transcript: str, *, model: str) -> dict[str, Any]:
    client = _get_client()
    user_prompt = USER_PROMPT_EXTRACTION_TEMPLATE.format(transcript=transcript)
    try:
        msg = await client.messages.create(
            model=model,
            # 8192: con 4096 los transcripts largos hacían que Claude truncara la
            # respuesta a mitad de JSON y _parse_json_response no podía reparar.
            max_tokens=8192,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT_EXTRACTION,
                    # Cache del system prompt: 75% menos tokens en hit (TTL 5min).
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
        )
    except APIError as exc:
        logger.error("Claude API error: %s", exc)
        raise

    raw = "".join(getattr(b, "text", "") for b in msg.content)
    return _parse_json_response(raw)


def _parse_json_response(text: str) -> dict[str, Any]:
    """Parsea JSON tolerando 3 fallas comunes de LLM:
    1. Fences ```json``` envolviendo el JSON.
    2. Texto extra antes/después del JSON.
    3. Truncamiento por max_tokens (cierra estructuras abiertas a la fuerza).
    """
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        try:
            return json.loads(text[first:last + 1])
        except json.JSONDecodeError:
            pass

    # Repair de truncamiento: encontrar último punto seguro y cerrar estructuras.
    if first == -1:
        raise json.JSONDecodeError("Sin objeto JSON en la respuesta", text, 0)
    return _parse_repaired(text[first:])


def _parse_repaired(s: str) -> dict[str, Any]:
    """Cierra un JSON truncado. Busca la última posición segura para cortar
    (después de un valor completo en un array/objeto a profundidad >= 1) y
    agrega los cierres `}` / `]` necesarios.
    """
    stack: list[str] = []
    in_str = False
    esc = False
    safe_pos = -1

    for i, ch in enumerate(s):
        if esc:
            esc = False
            continue
        if in_str:
            if ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch in "{[":
            stack.append(ch)
        elif ch in "}]":
            if stack:
                stack.pop()
                if len(stack) >= 1:
                    safe_pos = i + 1
        elif ch == "," and len(stack) >= 1:
            safe_pos = i

    if safe_pos == -1:
        raise json.JSONDecodeError("No pude reparar el JSON truncado", s, 0)

    truncated = s[:safe_pos].rstrip().rstrip(",").rstrip()

    # Recontar stack para saber qué cerrar
    stack = []
    in_str = False
    esc = False
    for ch in truncated:
        if esc:
            esc = False
            continue
        if in_str:
            if ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch in "{[":
            stack.append(ch)
        elif ch in "}]" and stack:
            stack.pop()

    if in_str:
        raise json.JSONDecodeError("JSON truncado dentro de un string", truncated, len(truncated))

    closer = "".join("]" if c == "[" else "}" for c in reversed(stack))
    logger.warning("Claude JSON truncado: recuperado %d chars, cerré con '%s'", safe_pos, closer)
    return json.loads(truncated + closer)


def _split_for_claude(text: str) -> list[str]:
    """Divide en partes <= _CHUNK_CHAR_LIMIT respetando saltos de línea."""
    if len(text) <= _CHUNK_CHAR_LIMIT:
        return [text]
    parts: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + _CHUNK_CHAR_LIMIT, len(text))
        if end < len(text):
            # Cortar en el último \n para no partir frases
            nl = text.rfind("\n", start, end)
            if nl != -1 and nl > start + _CHUNK_CHAR_LIMIT // 2:
                end = nl
        parts.append(text[start:end])
        start = end
    return parts


def _empty_extraction() -> dict[str, Any]:
    return {
        "resumen_ejecutivo": "",
        "conceptos_clave": [],
        "exam_tips": [],
        "contenido_importante": [],
        "referencias_externas": [],
        "qa_aclaraciones": [],
        "pendientes": [],
    }


async def _persist_signals(
    *,
    conn: asyncpg.Connection,
    extraction: dict[str, Any],
    material_id: UUID,
    module_id: UUID | None,
    course_id: UUID | None,
    source: str,
) -> None:
    """Inserta cada item del JSON en la tabla signals con type adecuado."""
    rows: list[tuple] = []

    for tip in extraction.get("exam_tips", []):
        rows.append((
            material_id, module_id, course_id, "exam_tip",
            tip.get("contenido", ""),
            tip.get("speaker", "unknown"),
            tip.get("contexto"),
            _ts_to_seconds(tip.get("timestamp_aprox")),
            tip.get("importancia", "medium"),
            source,
        ))

    for c in extraction.get("contenido_importante", []):
        rows.append((
            material_id, module_id, course_id, "important_content",
            f"{c.get('tema', '')}: {c.get('detalle', '')}".strip(": "),
            "professor", None, None,
            c.get("nivel_enfasis", "medium"),
            source,
        ))

    for r in extraction.get("referencias_externas", []):
        rows.append((
            material_id, module_id, course_id, "reference",
            f"{r.get('titulo', '')} — {r.get('autor_o_entidad', '')}".strip(" —"),
            "professor",
            r.get("donde_buscar"),
            None, "medium", source,
        ))

    for qa in extraction.get("qa_aclaraciones", []):
        rows.append((
            material_id, module_id, course_id, "qa",
            f"P: {qa.get('pregunta', '')} | R: {qa.get('respuesta_profesor', '')}",
            "professor",
            qa.get("concepto_aclarado"),
            None,
            "high" if qa.get("importante") else "medium",
            source,
        ))

    for p in extraction.get("pendientes", []):
        ctx = p.get("fecha_mencionada")
        rows.append((
            material_id, module_id, course_id, "pending_task",
            p.get("descripcion", ""),
            "professor",
            f"Tipo: {p.get('tipo', 'tarea')}; Fecha: {ctx or 'sin fecha'}",
            None, "medium", source,
        ))

    if not rows:
        logger.info("Sin signals para insertar (material=%s)", material_id)
        return

    await conn.executemany(
        """
        INSERT INTO signals (
            material_id, module_id, course_id, type, content,
            speaker, context, timestamp_seconds, importance, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        """,
        rows,
    )
    logger.info("Insertados %d signals para material=%s", len(rows), material_id)

    # Para pendientes con tipo='evaluacion' y fecha válida, además creamos
    # una evaluation auto-detected pendiente de revisión. El user aprueba o
    # rechaza desde la UI; el scheduler de recordatorios solo notifica las
    # aprobadas.
    if course_id is not None:
        await _persist_auto_evaluations(
            conn=conn,
            pendientes=extraction.get("pendientes", []),
            material_id=material_id,
            course_id=course_id,
        )


async def _persist_auto_evaluations(
    *,
    conn: asyncpg.Connection,
    pendientes: list[dict[str, Any]],
    material_id: UUID,
    course_id: UUID,
) -> None:
    """Crea evaluations auto-detected desde pendientes tipo='evaluacion'.

    Dedup: si ya existe una evaluation para el curso con due_date dentro de
    ±2 días, se descarta (asumimos que es la misma mencionada varias veces).
    """
    from datetime import date as _date

    candidates: list[tuple[_date, str]] = []
    for p in pendientes:
        if (p.get("tipo") or "").lower() != "evaluacion":
            continue
        raw_date = p.get("fecha_mencionada")
        if not raw_date:
            continue
        try:
            due = _date.fromisoformat(raw_date)
        except (TypeError, ValueError):
            continue
        if due < _date.today():
            continue  # fechas pasadas no nos sirven para notificar
        title = (p.get("descripcion") or "").strip() or "Evaluación detectada"
        candidates.append((due, title))

    if not candidates:
        return

    inserted = 0
    for due, title in candidates:
        existing = await conn.fetchval(
            """
            SELECT id FROM evaluations
            WHERE course_id = $1
              AND due_date BETWEEN $2::date - INTERVAL '2 days'
                               AND $2::date + INTERVAL '2 days'
            LIMIT 1
            """,
            course_id, due,
        )
        if existing:
            continue
        await conn.execute(
            """
            INSERT INTO evaluations (
                course_id, title, type, due_date,
                auto_detected, source_material_id, approved
            )
            VALUES ($1, $2, 'exam', $3, TRUE, $4, NULL)
            """,
            course_id, title[:200], due, material_id,
        )
        inserted += 1

    if inserted:
        logger.info(
            "Auto-detected %d evaluations para material=%s course=%s",
            inserted, material_id, course_id,
        )


def _ts_to_seconds(ts: str | None) -> int | None:
    if not ts:
        return None
    parts = ts.split(":")
    try:
        nums = [int(p) for p in parts]
    except ValueError:
        return None
    if len(nums) == 3:
        h, m, s = nums
    elif len(nums) == 2:
        h, m, s = 0, *nums
    else:
        return None
    return h * 3600 + m * 60 + s


# ─────────────────────────────────────────────────────────────────────────────
# Resumen narrado
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_SUMMARY = """\
Eres un narrador especializado en clases universitarias de ciberseguridad.
Generas resúmenes optimizados para ser leídos en voz alta (TTS): frases cortas,
sin bullets, sin markdown. El estudiante escucha esto mientras camina o
maneja, así que la claridad y el ritmo son críticos.
"""


async def generate_summary(
    *,
    transcript: str,
    course_name: str = "",
    module_name: str = "",
) -> str:
    """Genera un resumen de 500-800 palabras del transcript, en prosa fluida.

    Para transcripts largos (>_CHUNK_CHAR_LIMIT) hace map-reduce: resume cada
    parte a ~300 palabras y luego consolida las parciales en el resumen final.
    Antes truncábamos al primer _CHUNK_CHAR_LIMIT silenciosamente."""
    if not transcript.strip():
        return ""

    intro = ""
    if course_name or module_name:
        intro = f"Materia: {course_name}. Clase: {module_name}.\n\n"

    parts = _split_for_claude(transcript)
    if len(parts) == 1:
        return await _call_summary(parts[0], intro=intro, target="500-800")

    logger.info("Summary map-reduce: %d partes", len(parts))
    partials: list[str] = []
    for i, part in enumerate(parts):
        partial = await _call_summary(
            part, intro=intro, target="250-350",
            mark=f"[Parte {i + 1}/{len(parts)}]",
        )
        partials.append(partial)

    combined = "\n\n".join(partials)
    return await _call_summary(combined, intro=intro, target="500-800", reduce_pass=True)


async def _call_summary(
    text: str,
    *,
    intro: str,
    target: str,
    mark: str = "",
    reduce_pass: bool = False,
) -> str:
    client = _get_client()
    if reduce_pass:
        instruction = (
            f"Tenés varias síntesis parciales de la misma clase. Consolidá todo "
            f"en un único resumen final de {target} palabras de prosa fluida, "
            "apta para audio. Cierra con los 3 exam tips más importantes."
        )
    else:
        instruction = (
            f"{mark}Resume la siguiente clase en {target} palabras de prosa "
            "fluida, apta para audio."
        )
        if not mark:
            instruction += " Cierra con los 3 exam tips más importantes."

    user_prompt = f"{intro}{instruction}\n\nTRANSCRIPCIÓN:\n{text}"

    msg = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT_SUMMARY,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_prompt}],
    )
    return "".join(getattr(b, "text", "") for b in msg.content).strip()


# ─────────────────────────────────────────────────────────────────────────────
# Chat RAG
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_CHAT = """\
Eres Maestro Claudio, asistente de estudio personal de un estudiante de la
Maestría en Ciberseguridad de la Universidad Internacional de Valencia.
Tienes acceso al material de sus clases (transcripciones, PDFs, exports de
WhatsApp). Cuando respondas, basate primero en el contexto recuperado de los
chunks. Si el contexto no alcanza, decilo explícitamente y completá con tu
conocimiento general, marcándolo como tal.

Estilo:
- Claro, directo, sin relleno académico.
- Cita los módulos/clases cuando uses información específica del material.
- Si el modo es 'quiz' o 'flashcards', responde EXCLUSIVAMENTE con JSON.
"""


async def chat_rag(
    *,
    query: str,
    context_chunks: list[dict],
    history: list[dict] | None = None,
    mode: str = "explain",
) -> str | dict:
    """Genera respuesta para el chat RAG.

    Args:
        query: pregunta del usuario.
        context_chunks: chunks recuperados (cada uno con 'content', 'module_name'…).
        history: últimos 6 turnos previos [{role, content}].
        mode: explain | quiz | flashcards | exam_prep.
    """
    client = _get_client()

    context_text = "\n\n".join(
        f"[{c.get('course_name', '?')} > {c.get('module_name', '?')}] {c['content']}"
        for c in context_chunks
    ) or "(sin contexto recuperado)"

    if mode == "quiz":
        instruction = (
            "Generá 5 preguntas de opción múltiple sobre el tema. "
            "Devolvé un JSON: [{question, options:[A,B,C,D], correct, explanation}]."
        )
    elif mode == "flashcards":
        instruction = (
            "Generá 10 pares pregunta/respuesta para flashcards. "
            "Devolvé un JSON: [{front, back}]."
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

    messages: list[dict] = []
    if history:
        for h in history[-6:]:
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_prompt})

    msg = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT_CHAT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=messages,
    )

    answer = "".join(getattr(b, "text", "") for b in msg.content).strip()

    if mode in ("quiz", "flashcards"):
        try:
            return json.loads(answer)
        except json.JSONDecodeError:
            return _parse_json_response(answer)
    return answer


async def generate_conversation_title(query: str) -> str:
    """Resume el primer query en 4-6 palabras como título de la conversación."""
    if not query.strip():
        return ""
    client = _get_client()
    msg = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=40,
        messages=[
            {
                "role": "user",
                "content": (
                    "Resume la siguiente pregunta en un título de 4 a 6 palabras "
                    "en español. Devuelve SOLO el título, sin comillas ni puntuación "
                    f"final.\n\nPREGUNTA: {query}"
                ),
            }
        ],
    )
    title = "".join(getattr(b, "text", "") for b in msg.content).strip()
    return title.strip('"\'.').strip()[:120]

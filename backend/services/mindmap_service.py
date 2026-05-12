"""Genera mapas conceptuales (mind maps) en formato markdown indentado
compatible con `markmap`. Cada `#` representa un nivel de profundidad. El
frontend lo renderiza con markmap-view (SVG con zoom/collapse).

Decisión:
- Usa Claude Haiku (modelo bulk, ~10x más barato que Sonnet) porque es una
  tarea de síntesis estructural, no requiere razonamiento profundo.
- Input: transcript + top exam_tips/conceptos/references (signals) del material.
- Output: markdown puro (sin fences ``` que rompen markmap).
- Se cachea en `materials.mind_map_markdown`. La regeneración se dispara
  explícitamente desde el endpoint POST regenerate.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING
from uuid import UUID

from anthropic import APIError

from config import settings
from services.claude_service import _get_client

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)


# Tope soft de transcript que mandamos a Haiku. Si excede, recortamos al
# principio + final (el medio se condensa en signals igualmente).
_TRANSCRIPT_MAX_CHARS = 40_000


SYSTEM_PROMPT = """\
Sos un asistente que genera mapas conceptuales jerárquicos de clases
universitarias, para que un estudiante de la Maestría en Ciberseguridad
pueda repasar de un vistazo.

Reglas:
- Devolvé MARKDOWN PURO indentado con `#`/`##`/`###`/`-` SIN bloque de código (sin fences ```).
- El nivel raíz `#` es el título de la clase (un solo nodo).
- `##` son los grandes temas (3-7).
- `###` son sub-temas (2-5 por gran tema).
- `-` son hojas concretas: definiciones cortas, ejemplos, herramientas, normas
  mencionadas. Máximo 6 por sub-tema, idealmente 3.
- NO incluyas explicaciones largas en los nodos. Son etiquetas, no párrafos.
- Conservá el VOCABULARIO TÉCNICO real (acrónimos, nombres de tools/normas) tal
  como aparece en el material.
- Si el profesor marcó algo como importante para el examen, agregale " ⭐" al final.
- Idioma del output: el mismo del transcript (probablemente español rioplatense).
"""


async def generate_mindmap(
    db: "asyncpg.Connection",
    material_id: UUID,
) -> str:
    """Genera el markdown del mind map para un material y lo persiste.

    Asume que el material ya está procesado (status='ready') con su transcript
    y signals. Sin transcript no se puede generar — devuelve 422 al caller.
    """
    row = await db.fetchrow(
        """
        SELECT m.id, m.filename, m.status, m.transcript,
               c.name AS course_name, mod.name AS module_name
        FROM materials m
        JOIN courses c ON c.id = m.course_id
        LEFT JOIN modules mod ON mod.id = m.module_id
        WHERE m.id = $1
        """,
        material_id,
    )
    if not row:
        raise ValueError(f"Material {material_id} no existe")

    transcript = row["transcript"]
    if not transcript or not transcript.strip():
        raise ValueError(
            "El material no tiene transcript todavía. Esperá a que el "
            "pipeline termine de procesarlo."
        )

    # Recortar transcript si excede para no inflar costos. Mantenemos primer
    # 60% + último 30% (el medio aporta menos contexto único en transcripts de clase).
    if len(transcript) > _TRANSCRIPT_MAX_CHARS:
        head_n = int(_TRANSCRIPT_MAX_CHARS * 0.6)
        tail_n = int(_TRANSCRIPT_MAX_CHARS * 0.3)
        transcript = (
            transcript[:head_n]
            + "\n\n[... transcripción recortada por longitud ...]\n\n"
            + transcript[-tail_n:]
        )

    # Top signals como hints estructurales (no las metemos como nodos directos,
    # son input contextual para que Claude las priorice si son centrales).
    signals = await db.fetch(
        """
        SELECT type, content, importance
        FROM signals
        WHERE material_id = $1
        ORDER BY
            CASE importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
            created_at
        LIMIT 40
        """,
        material_id,
    )
    signals_summary = "\n".join(
        f"- [{s['type']}/{s['importance']}] {s['content']}"
        for s in signals
    ) or "(sin signals extraídas)"

    title_hint = (
        f"{row['course_name']}"
        + (f" — {row['module_name']}" if row["module_name"] else "")
        + (f" — {row['filename']}" if row['filename'] else "")
    )

    user_prompt = (
        f"CLASE: {title_hint}\n\n"
        f"SIGNALS DESTACADAS (priorizá los tips marcados con high):\n{signals_summary}\n\n"
        f"TRANSCRIPCIÓN:\n{transcript}\n\n"
        "Generá el mapa conceptual en markdown indentado siguiendo las reglas."
    )

    client = _get_client()
    try:
        msg = await client.messages.create(
            model=settings.CLAUDE_MODEL_BULK,
            max_tokens=2048,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
        )
    except APIError as exc:
        logger.error("Claude (mindmap) API error: %s", exc)
        raise

    raw = "".join(getattr(b, "text", "") for b in msg.content).strip()
    markdown = _clean_markdown(raw)

    await db.execute(
        """
        UPDATE materials
        SET mind_map_markdown = $1, mind_map_generated_at = NOW()
        WHERE id = $2
        """,
        markdown, material_id,
    )

    logger.info(
        "Mind map generado material=%s tokens_out~%d chars=%d",
        material_id, msg.usage.output_tokens if msg.usage else -1, len(markdown),
    )
    return markdown


def _clean_markdown(text: str) -> str:
    """Quita fences ``` y espacios extra. markmap espera markdown raw."""
    text = text.strip()
    fence = re.match(r"^```(?:markdown|md)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    return text


# ─── Mind map AGREGADO POR CURSO ────────────────────────────────────────────


SYSTEM_PROMPT_COURSE = """\
Sos un asistente que genera mapas conceptuales AGREGADOS de una materia
completa de la Maestría en Ciberseguridad. Vas a recibir las signals
extraídas de varias clases del curso (exam_tips, conceptos importantes,
referencias, Q&A, pending tasks) y tenés que sintetizar UN solo mapa
jerárquico que represente la materia entera.

Reglas:
- Markdown PURO indentado con `#`/`##`/`###`/`-` SIN bloque de código.
- Nivel `#`: el nombre del curso (un solo nodo raíz).
- Nivel `##`: grandes temas (4-8) que emergen del cruce de signals.
  Consolidá conceptos que aparecen repetidos en distintas clases.
- Nivel `###`: sub-temas (3-6 por gran tema).
- Hojas `-`: definiciones cortas, herramientas, normas, conceptos clave.
  Máximo 6 por sub-tema. NO repitas hojas entre ramas.
- Conservá el VOCABULARIO TÉCNICO (acrónimos, nombres de tools/normas).
- Marcá con ⭐ los items que aparezcan en signals tipo `exam_tip`.
- Idioma del output: español rioplatense (igual al de las signals).
- No expliques con párrafos largos. Son etiquetas, no resúmenes.
"""


async def generate_course_mindmap(
    db: "asyncpg.Connection",
    course_id: UUID,
) -> str:
    """Genera un mind map AGREGADO de todo el curso a partir de las signals
    de sus materials procesados. Usa Sonnet (no Haiku) porque la síntesis
    cruzada requiere mejor razonamiento que un mapa de clase individual.
    """
    course = await db.fetchrow(
        "SELECT id, name, code FROM courses WHERE id = $1",
        course_id,
    )
    if not course:
        raise ValueError(f"Curso {course_id} no existe")

    signals = await db.fetch(
        """
        SELECT s.type, s.content, s.importance,
               mat.filename, m.name AS module_name, m.week_number
        FROM signals s
        JOIN materials mat ON mat.id = s.material_id
        LEFT JOIN modules m ON m.id = s.module_id
        WHERE s.course_id = $1 AND mat.status = 'ready'
        ORDER BY
            CASE s.importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
            m.week_number NULLS LAST,
            s.created_at DESC
        LIMIT 250
        """,
        course_id,
    )

    if not signals:
        raise ValueError(
            "Esta materia no tiene clases procesadas con signals. "
            "Procesá al menos una clase antes de generar el mapa del curso."
        )

    signals_lines = []
    for s in signals:
        ctx = f" [{s['module_name']}]" if s["module_name"] else ""
        signals_lines.append(
            f"- [{s['type']}/{s['importance']}]{ctx} {s['content']}"
        )
    signals_text = "\n".join(signals_lines)

    title = course["name"]
    if course["code"]:
        title = f"{title} ({course['code']})"

    user_prompt = (
        f"CURSO: {title}\n\n"
        f"SIGNALS EXTRAÍDAS DE LAS CLASES PROCESADAS ({len(signals)} items):\n"
        f"{signals_text}\n\n"
        "Generá el mapa conceptual AGREGADO del curso siguiendo las reglas. "
        "Consolidá conceptos repetidos. Priorizá los exam_tips importantes."
    )

    client = _get_client()
    try:
        msg = await client.messages.create(
            # Sonnet (no Haiku): la agregación cruzada vale la diferencia.
            model=settings.CLAUDE_MODEL,
            max_tokens=4096,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT_COURSE,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
        )
    except APIError as exc:
        logger.error("Claude (course mindmap) API error: %s", exc)
        raise

    raw = "".join(getattr(b, "text", "") for b in msg.content).strip()
    markdown = _clean_markdown(raw)

    await db.execute(
        """
        UPDATE courses
        SET mind_map_markdown = $1, mind_map_generated_at = NOW()
        WHERE id = $2
        """,
        markdown, course_id,
    )

    logger.info(
        "Course mind map generado course=%s signals_in=%d chars_out=%d",
        course_id, len(signals), len(markdown),
    )
    return markdown

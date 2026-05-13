"""Chat RAG con historial multi-turn (tablas conversations + messages)."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from database import get_db, get_pool
from models.schemas import ChatRequest, ChatResponse, ChatSource
from config import settings
from services import claude_service, embeddings_service, openai_chat_service
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

# Cuántos turnos previos enviamos a Claude como contexto (decisión sesión revisión)
HISTORY_TURNS = 6


async def _generate_and_save_title(conversation_id: UUID, query: str) -> None:
    """BackgroundTask: genera el título de una conversación recién creada.

    Corre fuera del request, así que abre su propia conexión del pool.
    Nunca propaga errores — el título es nice-to-have."""
    try:
        title = await claude_service.generate_conversation_title(query)
        if not title:
            return
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE conversations SET title = $1 WHERE id = $2",
                title, conversation_id,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("title gen falló (no es bloqueante): %s", exc)


# ── Conversaciones ──────────────────────────────────────────────────────────


@router.get("/conversations")
async def list_conversations(
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    rows = await db.fetch(
        """
        SELECT id, user_id, course_id, module_id, title, channel,
               created_at, updated_at,
               (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS messages_count
        FROM conversations c
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 100
        """,
        user["id"],
    )
    return [dict(r) for r in rows]


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    conv = await db.fetchrow(
        "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id, user["id"],
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversación no encontrada"
        )
    msgs = await db.fetch(
        """
        SELECT id, role, content, sources, mode, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at
        """,
        conversation_id,
    )
    return {
        "conversation": dict(conv),
        "messages": [dict(m) for m in msgs],
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: UUID,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    deleted = await db.fetchval(
        "DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id",
        conversation_id, user["id"],
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversación no encontrada"
        )
    return {"deleted": True}


# ── POST /chat ──────────────────────────────────────────────────────────────


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    user_id = user["id"]
    is_new_conversation = payload.conversation_id is None

    # 1. Conversación: crear nueva si no vino conversation_id
    conversation_id = payload.conversation_id
    if conversation_id is None:
        conversation_id = await db.fetchval(
            """
            INSERT INTO conversations (user_id, course_id, module_id, channel)
            VALUES ($1, $2, $3, 'web')
            RETURNING id
            """,
            user_id, payload.course_id, payload.module_id,
        )
    else:
        owned = await db.fetchval(
            "SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2",
            conversation_id, user_id,
        )
        if not owned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Conversación no encontrada"
            )

    # 2. Persistir el mensaje del usuario
    await db.execute(
        """
        INSERT INTO messages (conversation_id, role, content, mode)
        VALUES ($1, 'user', $2, $3)
        """,
        conversation_id, payload.query, payload.mode,
    )

    # 3. Cargar últimos HISTORY_TURNS-1 (para no contar el que acabamos de insertar)
    history_rows = await db.fetch(
        """
        SELECT role, content
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        conversation_id, HISTORY_TURNS,
    )
    history = list(reversed([dict(r) for r in history_rows]))[:-1]

    # 4. Buscar chunks similares (scoped al user para evitar cross-tenant leak).
    # Si OpenAI falla (quota / red), seguimos sin RAG. Claude responde igual
    # con su conocimiento general — mejor degradación que 500.
    rag_warning: str | None = None
    try:
        chunks = await embeddings_service.search_similar(
            conn=db,
            query=payload.query,
            user_id=user_id,
            course_id=payload.course_id,
            module_id=payload.module_id,
            top_k=8,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("RAG falló (sigo sin contexto): %s", exc)
        chunks = []
        msg = str(exc)
        if "insufficient_quota" in msg or "429" in msg:
            rag_warning = "⚠️ La quota de OpenAI está agotada. Te respondo sin RAG (sin contexto de tus materiales)."
        else:
            rag_warning = f"⚠️ No pude buscar en tus materiales: {type(exc).__name__}. Te respondo sin RAG."

    # 4.b — En modo exam_prep prepend exam_tips del curso como contexto extra
    if payload.mode == "exam_prep" and payload.course_id is not None:
        tip_rows = await db.fetch(
            """
            SELECT s.content, s.importance,
                   m.name AS module_name, c.name AS course_name
            FROM signals s
            JOIN courses c ON c.id = s.course_id
            LEFT JOIN modules m ON m.id = s.module_id
            WHERE s.course_id = $1 AND c.user_id = $2 AND s.type = 'exam_tip'
            ORDER BY
                CASE s.importance
                    WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2
                END,
                s.created_at DESC
            LIMIT 30
            """,
            payload.course_id, user_id,
        )
        exam_chunks = [
            {
                "content": f"[exam_tip importance={r['importance']}] {r['content']}",
                "module_name": r["module_name"] or "general",
                "course_name": r["course_name"],
                "similarity": None,
                "kind": "pinned",
            }
            for r in tip_rows
        ]
        chunks = exam_chunks + chunks

    # 5. Llamar al LLM (provider configurable, default openai para ahorrar Claude).
    chat_fn = (
        openai_chat_service.chat_rag_openai
        if settings.CHAT_PROVIDER == "openai"
        else claude_service.chat_rag
    )
    try:
        answer = await chat_fn(
            query=payload.query,
            context_chunks=chunks,
            history=history,
            mode=payload.mode,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("chat_rag falló (provider=%s)", settings.CHAT_PROVIDER)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM no respondió ({settings.CHAT_PROVIDER}): {type(exc).__name__}: {str(exc)[:200]}",
        )

    # 6. Persistir la respuesta (con warning RAG si lo hubo)
    if isinstance(answer, str):
        answer_text = (rag_warning + "\n\n" + answer) if rag_warning else answer
        quiz_questions = None
    else:
        answer_text = json.dumps(answer, ensure_ascii=False)
        quiz_questions = answer if payload.mode == "quiz" else None

    sources = [
        ChatSource(
            module_name=c.get("module_name"),
            course_name=c.get("course_name"),
            similarity=(float(c["similarity"]) if c.get("similarity") is not None else None),
            excerpt=(c["content"] or "")[:160],
            kind=c.get("kind", "retrieved"),
        )
        for c in chunks
    ]

    await db.execute(
        """
        INSERT INTO messages (conversation_id, role, content, sources, mode)
        VALUES ($1, 'assistant', $2, $3::jsonb, $4)
        """,
        conversation_id,
        answer_text,
        json.dumps([s.model_dump() for s in sources]),
        payload.mode,
    )
    await db.execute(
        "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
        conversation_id,
    )

    # 7. Título async (solo en el primer turn de una conversación nueva)
    if is_new_conversation:
        background_tasks.add_task(
            _generate_and_save_title, conversation_id, payload.query
        )

    return ChatResponse(
        conversation_id=conversation_id,
        answer=answer_text,
        sources=sources,
        mode=payload.mode,
        quiz_questions=quiz_questions,
    )


# ── POST /chat/stream (SSE) ────────────────────────────────────────────────


@router.post("/chat/stream")
async def chat_stream(
    payload: ChatRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    """Versión streaming del chat. Devuelve text/event-stream con eventos:
      {type: 'token', text: '...'}  — cada delta de la generación
      {type: 'done',  conversation_id, sources, mode}  — al final
      {type: 'error', message}  — si algo falló durante el stream

    Solo modos prosa (explain/exam_prep). Quiz/flashcards usan /chat (JSON mode
    requiere respuesta completa).
    """
    if payload.mode in ("quiz", "flashcards"):
        raise HTTPException(
            status_code=400,
            detail="Streaming no soporta quiz/flashcards. Usá POST /chat.",
        )

    user_id = user["id"]
    is_new_conversation = payload.conversation_id is None

    # 1. Conversación
    conversation_id = payload.conversation_id
    if conversation_id is None:
        conversation_id = await db.fetchval(
            """
            INSERT INTO conversations (user_id, course_id, module_id, channel)
            VALUES ($1, $2, $3, 'web')
            RETURNING id
            """,
            user_id, payload.course_id, payload.module_id,
        )
    else:
        owned = await db.fetchval(
            "SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2",
            conversation_id, user_id,
        )
        if not owned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Conversación no encontrada"
            )

    # 2. Persistir mensaje del user
    await db.execute(
        """
        INSERT INTO messages (conversation_id, role, content, mode)
        VALUES ($1, 'user', $2, $3)
        """,
        conversation_id, payload.query, payload.mode,
    )

    # 3. Historial
    history_rows = await db.fetch(
        """
        SELECT role, content
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        conversation_id, HISTORY_TURNS,
    )
    history = list(reversed([dict(r) for r in history_rows]))[:-1]

    # 4. RAG
    rag_warning: str | None = None
    try:
        chunks = await embeddings_service.search_similar(
            conn=db,
            query=payload.query,
            user_id=user_id,
            course_id=payload.course_id,
            module_id=payload.module_id,
            top_k=8,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("RAG falló (sigo sin contexto): %s", exc)
        chunks = []
        msg = str(exc)
        if "insufficient_quota" in msg or "429" in msg:
            rag_warning = "⚠️ La quota de OpenAI está agotada. Te respondo sin RAG."
        else:
            rag_warning = f"⚠️ No pude buscar en tus materiales: {type(exc).__name__}."

    # 4.b Exam-prep pinned
    if payload.mode == "exam_prep" and payload.course_id is not None:
        tip_rows = await db.fetch(
            """
            SELECT s.content, s.importance,
                   m.name AS module_name, c.name AS course_name
            FROM signals s
            JOIN courses c ON c.id = s.course_id
            LEFT JOIN modules m ON m.id = s.module_id
            WHERE s.course_id = $1 AND c.user_id = $2 AND s.type = 'exam_tip'
            ORDER BY
                CASE s.importance
                    WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2
                END,
                s.created_at DESC
            LIMIT 30
            """,
            payload.course_id, user_id,
        )
        exam_chunks = [
            {
                "content": f"[exam_tip importance={r['importance']}] {r['content']}",
                "module_name": r["module_name"] or "general",
                "course_name": r["course_name"],
                "similarity": None,
                "kind": "pinned",
            }
            for r in tip_rows
        ]
        chunks = exam_chunks + chunks

    # Pre-armado de sources que iremos a mandar en el evento 'done'
    sources_dicts = [
        {
            "module_name": c.get("module_name"),
            "course_name": c.get("course_name"),
            "similarity": (float(c["similarity"]) if c.get("similarity") is not None else None),
            "excerpt": (c["content"] or "")[:160],
            "kind": c.get("kind", "retrieved"),
        }
        for c in chunks
    ]

    async def event_stream():
        full: list[str] = []
        try:
            # Si hay warning de RAG, lo emitimos como primer "token" para que
            # el user lo vea arriba de la respuesta.
            if rag_warning:
                prefix = rag_warning + "\n\n"
                full.append(prefix)
                yield f"data: {json.dumps({'type':'token','text':prefix}, ensure_ascii=False)}\n\n"

            async for token in openai_chat_service.chat_rag_openai_stream(
                query=payload.query,
                context_chunks=chunks,
                history=history,
                mode=payload.mode,
            ):
                full.append(token)
                yield f"data: {json.dumps({'type':'token','text':token}, ensure_ascii=False)}\n\n"

            answer_text = "".join(full)

            # Persistir respuesta + bump conv.
            # IMPORTANTE: la `db` inyectada por Depends(get_db) ya fue liberada
            # al pool cuando el handler retornó el StreamingResponse — el
            # generator sigue corriendo después de ese retorno. Adquirimos una
            # conexión fresca del pool para estas queries post-stream.
            pool = get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO messages (conversation_id, role, content, sources, mode)
                    VALUES ($1, 'assistant', $2, $3::jsonb, $4)
                    """,
                    conversation_id,
                    answer_text,
                    json.dumps(sources_dicts),
                    payload.mode,
                )
                await conn.execute(
                    "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
                    conversation_id,
                )

            # Evento final con metadata
            yield (
                "data: "
                + json.dumps({
                    "type": "done",
                    "conversation_id": str(conversation_id),
                    "sources": sources_dicts,
                    "mode": payload.mode,
                }, ensure_ascii=False)
                + "\n\n"
            )

            if is_new_conversation:
                background_tasks.add_task(
                    _generate_and_save_title, conversation_id, payload.query
                )
        except Exception as exc:  # noqa: BLE001
            logger.exception("chat_stream falló")
            yield (
                "data: "
                + json.dumps({
                    "type": "error",
                    "message": f"{type(exc).__name__}: {str(exc)[:200]}",
                }, ensure_ascii=False)
                + "\n\n"
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        # Estos headers ayudan a que proxies (nginx, CF) no buffereen el stream
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )

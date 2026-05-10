"""Chat RAG con historial multi-turn (tablas conversations + messages)."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from models.schemas import ChatRequest, ChatResponse, ChatSource
from services import claude_service, embeddings_service
from services.auth_service import get_current_user

if TYPE_CHECKING:
    import asyncpg

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

# Cuántos turnos previos enviamos a Claude como contexto (decisión sesión revisión)
HISTORY_TURNS = 6


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
    user: dict = Depends(get_current_user),
    db: "asyncpg.Connection" = Depends(get_db),
):
    user_id = user["id"]

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

    # 4. Buscar chunks similares
    chunks = await embeddings_service.search_similar(
        conn=db,
        query=payload.query,
        course_id=payload.course_id,
        module_id=payload.module_id,
        top_k=8,
    )

    # 5. Llamar a Claude
    answer = await claude_service.chat_rag(
        query=payload.query,
        context_chunks=chunks,
        history=history,
        mode=payload.mode,
    )

    # 6. Persistir la respuesta
    if isinstance(answer, str):
        answer_text = answer
        quiz_questions = None
    else:
        answer_text = json.dumps(answer, ensure_ascii=False)
        quiz_questions = answer if payload.mode == "quiz" else None

    sources = [
        ChatSource(
            module_name=c.get("module_name"),
            course_name=c.get("course_name"),
            similarity=float(c["similarity"]),
            excerpt=(c["content"] or "")[:160],
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

    return ChatResponse(
        conversation_id=conversation_id,
        answer=answer_text,
        sources=sources,
        mode=payload.mode,
        quiz_questions=quiz_questions,
    )

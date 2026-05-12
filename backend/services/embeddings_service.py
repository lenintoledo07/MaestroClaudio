"""Chunking + OpenAI embeddings + búsqueda vectorial (pgvector)."""

from __future__ import annotations

import logging
import re
from typing import Iterable
from uuid import UUID

import asyncpg
from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536

# Approx 4 chars ≈ 1 token (heurística OpenAI). 500 tokens ≈ 2000 chars.
CHUNK_CHARS = 2000
CHUNK_OVERLAP_CHARS = 200

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY vacía en settings")
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


# ─────────────────────────────────────────────────────────────────────────────
# Chunking
# ─────────────────────────────────────────────────────────────────────────────


def split_into_chunks(text: str) -> list[str]:
    """Divide en chunks de ~CHUNK_CHARS respetando límites de párrafo/oración.

    Estrategia:
    1. Split inicial por párrafos (\\n\\n).
    2. Si un párrafo es > CHUNK_CHARS, lo subdividimos por oraciones.
    3. Acumulamos párrafos hasta llegar a CHUNK_CHARS.
    4. Cada chunk arrastra CHUNK_OVERLAP_CHARS del final del anterior.
    """
    text = text.strip()
    if not text:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    units: list[str] = []
    for p in paragraphs:
        if len(p) <= CHUNK_CHARS:
            units.append(p)
        else:
            sentences = re.split(r"(?<=[.!?])\s+", p)
            buf: list[str] = []
            buf_len = 0
            for s in sentences:
                if buf_len + len(s) + 1 > CHUNK_CHARS and buf:
                    units.append(" ".join(buf))
                    buf, buf_len = [s], len(s)
                else:
                    buf.append(s)
                    buf_len += len(s) + 1
            if buf:
                units.append(" ".join(buf))

    chunks: list[str] = []
    current = ""
    for u in units:
        if not current:
            current = u
            continue
        if len(current) + len(u) + 2 <= CHUNK_CHARS:
            current = f"{current}\n\n{u}"
        else:
            chunks.append(current)
            tail = current[-CHUNK_OVERLAP_CHARS:] if len(current) > CHUNK_OVERLAP_CHARS else current
            current = f"{tail}\n\n{u}" if tail else u
    if current:
        chunks.append(current)

    return chunks


# ─────────────────────────────────────────────────────────────────────────────
# Embeddings
# ─────────────────────────────────────────────────────────────────────────────


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Genera embeddings para varios textos en una sola llamada."""
    if not texts:
        return []
    client = _get_client()
    resp = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )
    return [d.embedding for d in resp.data]


# Cache LRU+TTL para embeddings de queries de chat. La key es el texto
# normalizado (strip + lower) — embedding-3-small es estable, así que la
# misma pregunta dispara el mismo vector. TTL 1h para no almacenar
# eternamente y limit de 2000 entries (~12 MB en RAM con float32).
_QUERY_CACHE_TTL_S = 3600
_QUERY_CACHE_MAX = 2000
_query_cache: dict[str, tuple[float, list[float]]] = {}


def _query_cache_get(key: str) -> list[float] | None:
    import time
    entry = _query_cache.get(key)
    if not entry:
        return None
    ts, vec = entry
    if time.monotonic() - ts > _QUERY_CACHE_TTL_S:
        _query_cache.pop(key, None)
        return None
    return vec


def _query_cache_put(key: str, vec: list[float]) -> None:
    import time
    if len(_query_cache) >= _QUERY_CACHE_MAX:
        # Eviction simple: borrar el 20% más viejo. No es LRU estricto pero
        # alcanza para este caso (caché de chat, no de embeddings de docs).
        sorted_keys = sorted(_query_cache.items(), key=lambda kv: kv[1][0])
        for k, _ in sorted_keys[: _QUERY_CACHE_MAX // 5]:
            _query_cache.pop(k, None)
    _query_cache[key] = (time.monotonic(), vec)


async def get_embedding(text: str) -> list[float]:
    """Embedding de un solo texto. Cacheado con TTL 1h para ahorrar costos
    y latencia en queries repetidas (típico cuando el user revisita la app)."""
    key = (text or "").strip().lower()
    if key:
        cached = _query_cache_get(key)
        if cached is not None:
            return cached
    out = await embed_batch([text])
    if key:
        _query_cache_put(key, out[0])
    return out[0]


# ─────────────────────────────────────────────────────────────────────────────
# Persistencia + búsqueda
# ─────────────────────────────────────────────────────────────────────────────


async def store_chunks(
    *,
    conn: asyncpg.Connection,
    text: str,
    material_id: UUID,
    module_id: UUID | None,
    course_id: UUID | None,
    chunk_type: str = "transcript",
    batch_size: int = 20,
) -> int:
    """Borra chunks previos del material, recalcula y persiste. Retorna el N."""
    await delete_chunks_for_material(conn, material_id)

    chunks = split_into_chunks(text)
    if not chunks:
        return 0

    inserted = 0
    for batch_start in range(0, len(chunks), batch_size):
        batch = chunks[batch_start: batch_start + batch_size]
        embeddings = await embed_batch(batch)

        rows = [
            (
                material_id, module_id, course_id, content,
                _vec_to_pg(emb), batch_start + i, chunk_type, EMBEDDING_MODEL,
            )
            for i, (content, emb) in enumerate(zip(batch, embeddings))
        ]
        await conn.executemany(
            """
            INSERT INTO chunks (
                material_id, module_id, course_id, content, embedding,
                chunk_index, chunk_type, embedding_model
            )
            VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)
            """,
            rows,
        )
        inserted += len(rows)

    logger.info(
        "Embeddings: %d chunks → material=%s (model=%s)",
        inserted, material_id, EMBEDDING_MODEL,
    )
    return inserted


async def delete_chunks_for_material(
    conn: asyncpg.Connection, material_id: UUID
) -> int:
    result = await conn.execute(
        "DELETE FROM chunks WHERE material_id = $1", material_id
    )
    # asyncpg execute devuelve "DELETE N"
    try:
        return int(result.split()[-1])
    except (ValueError, IndexError):
        return 0


async def search_similar(
    *,
    conn: asyncpg.Connection,
    query: str,
    user_id: UUID,
    course_id: UUID | None = None,
    module_id: UUID | None = None,
    chunk_types: list[str] | None = None,
    top_k: int = 8,
) -> list[dict]:
    """Búsqueda vectorial scoped al user. Devuelve chunks con similarity,
    module_name, course_name. INNER JOIN courses + filtro user_id evita
    cross-tenant leak: un chunk solo es alcanzable si pertenece a un curso
    del user que llama."""
    embedding = await get_embedding(query)

    args: list = [_vec_to_pg(embedding), user_id]
    where: list[str] = ["co.user_id = $2"]

    if course_id:
        args.append(course_id)
        where.append(f"c.course_id = ${len(args)}")
    if module_id:
        args.append(module_id)
        where.append(f"c.module_id = ${len(args)}")
    if chunk_types:
        args.append(chunk_types)
        where.append(f"c.chunk_type = ANY(${len(args)})")

    args.append(top_k)
    sql = f"""
        SELECT c.content,
               c.chunk_type,
               c.module_id,
               c.course_id,
               m.name AS module_name,
               co.name AS course_name,
               1 - (c.embedding <=> $1::vector) AS similarity
        FROM chunks c
        INNER JOIN courses co ON c.course_id = co.id
        LEFT JOIN modules m   ON c.module_id  = m.id
        WHERE {' AND '.join(where)}
        ORDER BY c.embedding <=> $1::vector
        LIMIT ${len(args)}
    """
    rows = await conn.fetch(sql, *args)
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _vec_to_pg(embedding: Iterable[float]) -> str:
    """asyncpg necesita el vector como string '[0.1, 0.2, ...]' para pgvector."""
    return "[" + ",".join(f"{x:.7f}" for x in embedding) + "]"

-- Maestro Claudio · Initial schema
-- Aplicado automáticamente por el contenedor de Postgres en el primer arranque
-- (volumen vacío) gracias a docker-entrypoint-initdb.d.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 TEXT UNIQUE NOT NULL,
    name                  TEXT,
    google_refresh_token  TEXT,
    whatsapp_number       TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Cursos / asignaturas de la maestría
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    code        TEXT,
    semester    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS courses_user_idx ON courses(user_id);

-- ---------------------------------------------------------------------------
-- Materiales de estudio (PDFs, slides, audios, notas, vídeos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materials (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    source_type  TEXT NOT NULL CHECK (source_type IN ('pdf','pptx','audio','video','note','url')),
    source_uri   TEXT,
    raw_text     TEXT,
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS materials_course_idx ON materials(course_id);

-- ---------------------------------------------------------------------------
-- Chunks vectorizados (embeddings) para RAG
-- 1536 dims = text-embedding-3-small de OpenAI.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id  UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    chunk_index  INT  NOT NULL,
    content      TEXT NOT NULL,
    embedding    vector(1536),
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chunks_material_idx ON chunks(material_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- Conversaciones con el agente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
    title       TEXT,
    channel     TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web','mobile','whatsapp','voice')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations(user_id);

CREATE TABLE IF NOT EXISTS messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    content          TEXT NOT NULL,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Tareas / pendientes (sincronizadas con Google Calendar)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id                   UUID REFERENCES courses(id) ON DELETE SET NULL,
    title                       TEXT NOT NULL,
    description                 TEXT,
    due_at                      TIMESTAMPTZ,
    status                      TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','in_progress','done','cancelled')),
    google_calendar_event_id    TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks(user_id, due_at);
CREATE INDEX IF NOT EXISTS tasks_status_idx   ON tasks(status);

-- ---------------------------------------------------------------------------
-- Sesiones de estudio (pomodoros, repasos, quizzes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id    UUID REFERENCES courses(id) ON DELETE SET NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('pomodoro','review','quiz','flashcards')),
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ,
    summary      TEXT,
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS study_sessions_user_idx ON study_sessions(user_id, started_at DESC);

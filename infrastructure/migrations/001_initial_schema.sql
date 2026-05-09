-- Maestro Claudio · 001 Initial schema
--
-- Se aplica automáticamente por el contenedor de Postgres (pgvector/pg16) en el
-- primer arranque con volumen vacío gracias a docker-entrypoint-initdb.d.
--
-- Orden de las tablas: users → courses → modules → materials → signals → chunks
-- → evaluations → calendar_events → conversations → messages (respeta foreign keys).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id        TEXT UNIQUE NOT NULL,
    email            TEXT UNIQUE NOT NULL,
    name             TEXT,
    google_token     JSONB,            -- {access_token, refresh_token, expiry} encriptados
    drive_folder_id  TEXT,             -- carpeta raíz del estudiante en Drive
    push_token       TEXT,             -- Expo push token (mobile)
    timezone         TEXT NOT NULL DEFAULT 'America/Santiago',  -- IANA tz para scheduler
    whatsapp_number  TEXT,             -- E.164 sin '+' (ej: 56912345678)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. courses (materias)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                     TEXT NOT NULL,
    code                     TEXT,
    professor                TEXT,
    professor_whatsapp_name  TEXT,                                        -- nombre tal como aparece en WhatsApp export
    drive_folder_id          TEXT,
    color                    TEXT NOT NULL DEFAULT '#FF4D1C',
    status                   TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','paused','completed','deleted')),
    start_date               DATE,
    end_date                 DATE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS courses_user_idx        ON courses(user_id);
CREATE INDEX IF NOT EXISTS courses_user_status_idx ON courses(user_id, status);

-- ---------------------------------------------------------------------------
-- 3. modules (semanas / clases dentro de una materia)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    week_number        INT,
    topic              TEXT,
    class_date         DATE,
    calendar_event_id  TEXT,
    status             TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','processing','ready')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS modules_course_idx      ON modules(course_id);
CREATE INDEX IF NOT EXISTS modules_class_date_idx  ON modules(class_date);
CREATE INDEX IF NOT EXISTS modules_course_week_idx ON modules(course_id, week_number);

-- ---------------------------------------------------------------------------
-- 4. materials (archivos procesados: video, pdf, pptx, whatsapp_export)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materials (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id         UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    course_id         UUID REFERENCES courses(id),
    type              TEXT NOT NULL
                        CHECK (type IN ('video','pdf','pptx','whatsapp_export')),
    filename          TEXT,
    drive_file_id     TEXT,
    drive_url         TEXT,
    transcript        TEXT,
    summary_text      TEXT,
    audio_path        TEXT,
    duration_seconds  INT,
    status            TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','downloading','transcribing','extracting','ready','error')),
    error_message     TEXT,
    processed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS materials_module_idx ON materials(module_id);
CREATE INDEX IF NOT EXISTS materials_course_idx ON materials(course_id);
-- Partial index: solo materiales en proceso (los que importan para SSE/dashboard)
CREATE INDEX IF NOT EXISTS materials_status_active_idx ON materials(status)
    WHERE status IN ('pending', 'downloading', 'transcribing', 'extracting');

-- ---------------------------------------------------------------------------
-- 5. signals (señales pedagógicas extraídas por Claude)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signals (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id        UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    module_id          UUID REFERENCES modules(id),
    course_id          UUID REFERENCES courses(id),
    type               TEXT NOT NULL
                         CHECK (type IN ('exam_tip','important_content','reference','qa','pending_task')),
    content            TEXT NOT NULL,
    speaker            TEXT CHECK (speaker IN ('professor','student','unknown')),
    context            TEXT,
    timestamp_seconds  INT,
    importance         TEXT NOT NULL DEFAULT 'medium'
                         CHECK (importance IN ('high','medium','low')),
    source             TEXT CHECK (source IN ('recording','whatsapp','document')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signals_material_idx    ON signals(material_id);
-- Compuestos: cubren los queries más frecuentes (course/module + type, ordenados)
CREATE INDEX IF NOT EXISTS signals_course_type_idx ON signals(course_id, type, importance DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS signals_module_type_idx ON signals(module_id, type);

-- ---------------------------------------------------------------------------
-- 6. chunks (fragmentos vectorizados para RAG)
--   1536 dims = text-embedding-3-small de OpenAI.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id  UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    module_id    UUID REFERENCES modules(id),
    course_id    UUID REFERENCES courses(id),
    content      TEXT NOT NULL,
    embedding    vector(1536),
    chunk_index  INT,
    chunk_type   TEXT NOT NULL DEFAULT 'transcript',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chunks_course_idx ON chunks(course_id);
CREATE INDEX IF NOT EXISTS chunks_module_idx ON chunks(module_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- 7. evaluations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    type               TEXT NOT NULL DEFAULT 'exam'
                         CHECK (type IN ('exam','assignment','project','quiz')),
    due_date           DATE NOT NULL,
    description        TEXT,
    weight_pct         NUMERIC(5,2),
    status             TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','submitted','graded')),
    grade              NUMERIC(5,2),
    calendar_event_id  TEXT,
    reminder_sent_7d   BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_sent_1d   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evaluations_course_due_idx ON evaluations(course_id, due_date);
-- Partial index: solo pendientes, para el scheduler de recordatorios
CREATE INDEX IF NOT EXISTS evaluations_due_pending_idx ON evaluations(due_date)
    WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 8. calendar_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_event_id  TEXT UNIQUE,
    course_id        UUID REFERENCES courses(id),
    module_id        UUID REFERENCES modules(id),
    title            TEXT,
    event_date       DATE,
    start_time       TIME,
    end_time         TIME,
    material_status  TEXT NOT NULL DEFAULT 'missing'
                       CHECK (material_status IN ('missing','partial','complete')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calendar_events_module_idx     ON calendar_events(module_id);
CREATE INDEX IF NOT EXISTS calendar_events_course_date_idx ON calendar_events(course_id, event_date);

-- ---------------------------------------------------------------------------
-- 9. conversations (historial de chat RAG, multi-turn)
-- ---------------------------------------------------------------------------
-- El backend envía a Claude los últimos 6 mensajes de la conversación como
-- contexto. En WhatsApp, una conversación se mantiene "abierta" mientras haya
-- menos de 2h de inactividad; tras eso se inicia una nueva.
CREATE TABLE IF NOT EXISTS conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
    module_id   UUID REFERENCES modules(id) ON DELETE SET NULL,
    title       TEXT,                    -- generado por Claude del primer turn
    channel     TEXT NOT NULL DEFAULT 'web'
                  CHECK (channel IN ('web', 'mobile', 'whatsapp')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
    ON conversations(user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 10. messages (turnos de cada conversación)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    sources         JSONB,               -- chunks usados (solo cuando role='assistant')
    mode            TEXT CHECK (mode IN ('explain', 'quiz', 'flashcards', 'exam_prep')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx
    ON messages(conversation_id, created_at);

-- ===========================================================================
-- SEED · Materias iniciales de la Maestría en Ciberseguridad
-- ===========================================================================
--
-- ⚠️  Este INSERT NO se ejecuta automáticamente: requiere el `user_id` del
-- estudiante, que sólo existe DESPUÉS de completar el OAuth con Google por
-- primera vez. Correrlo a mano (o disparado desde un script post-login) la
-- primera vez que el usuario inicie sesión.
--
-- Opción A — desde psql, sustituyendo el UUID:
--
--   INSERT INTO courses (user_id, name, color) VALUES
--     ('<UUID-DEL-USUARIO>', 'Hacking Ético',                 '#FF4D1C'),
--     ('<UUID-DEL-USUARIO>', 'Cumplimiento Normativo y RGPD', '#8B5CF6'),
--     ('<UUID-DEL-USUARIO>', 'Monitorización y Data Mining',  '#06B6D4'),
--     ('<UUID-DEL-USUARIO>', 'Gobierno de la Seguridad',      '#22C55E');
--
-- Opción B — con variable de psql:
--
--   psql "$DATABASE_URL" \
--     -v user_id="'00000000-0000-0000-0000-000000000000'" <<'SQL'
--   INSERT INTO courses (user_id, name, color) VALUES
--     (:user_id, 'Hacking Ético',                 '#FF4D1C'),
--     (:user_id, 'Cumplimiento Normativo y RGPD', '#8B5CF6'),
--     (:user_id, 'Monitorización y Data Mining',  '#06B6D4'),
--     (:user_id, 'Gobierno de la Seguridad',      '#22C55E');
--   SQL
--
-- Opción C — desde Python (asyncpg) tras el primer login OAuth:
--
--   INITIAL_COURSES = [
--       ('Hacking Ético',                 '#FF4D1C'),
--       ('Cumplimiento Normativo y RGPD', '#8B5CF6'),
--       ('Monitorización y Data Mining',  '#06B6D4'),
--       ('Gobierno de la Seguridad',      '#22C55E'),
--   ]
--   await conn.executemany(
--       "INSERT INTO courses (user_id, name, color) VALUES ($1, $2, $3)",
--       [(user_id, name, color) for name, color in INITIAL_COURSES],
--   )
-- ===========================================================================

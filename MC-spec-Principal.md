# Maestro Claudio — Especificación Técnica Definitiva

**Nombre del proyecto:** Maestro Claudio
**Repositorio:** `lenintoledo07/maestro-claudio`
**Dominio producción:** `study.denario.cloud`
**Versión:** 4.0 — Definitiva
**Fecha:** Mayo 2026
**Autor:** Lenin Toledo

---

## Índice

1. [Visión General](#1-visión-general)
2. [Materias Iniciales](#2-materias-iniciales)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Arquitectura del Sistema](#4-arquitectura-del-sistema)
5. [Modelo de Datos](#5-modelo-de-datos)
6. [API Backend](#6-api-backend)
7. [Pipeline de Procesamiento](#7-pipeline-de-procesamiento)
8. [Extracción de Señales](#8-extracción-de-señales-claude)
9. [RAG Engine](#9-rag-engine)
10. [Web App — Frontend](#10-web-app--frontend)
11. [Mobile App — React Native](#11-mobile-app--react-native-expo)
12. [Design System V3](#12-design-system-v3-abstract-intelligence)
13. [Google OAuth2](#13-google-oauth2)
14. [Google Calendar](#14-integración-google-calendar)
15. [WhatsApp](#15-whatsapp--solo-lectura-y-notificaciones)
16. [MCP Server](#16-mcp-server)
17. [Gestión Dinámica de Materias](#17-gestión-dinámica-de-materias)
18. [Infraestructura](#18-infraestructura-docker)
19. [Entorno Local — Setup Mac](#19-entorno-local--setup-en-mac)
20. [GitHub — Repositorio y Ramas](#20-github--repositorio-y-ramas)
21. [CI/CD — Deploy Automático](#21-cicd--deploy-automático)
22. [Plan de Implementación](#22-plan-de-implementación)
23. [Variables de Entorno](#23-variables-de-entorno)

---

## 1. Visión General

Maestro Claudio es un agente de estudio personalizado para la Maestría en Ciberseguridad (Universidad Internacional de Valencia). Procesa grabaciones de clases, documentos y conversaciones de WhatsApp para extraer conocimiento estructurado, generar resúmenes en texto y audio, y asistir al estudiante con contexto acumulado a lo largo del semestre.

### Principios de diseño

- **Proactivo, no reactivo** — el agente detecta clases pendientes sin que el usuario lo solicite
- **Contexto acumulativo** — el conocimiento crece semana a semana, sin pérdida entre sesiones
- **Multi-fuente** — grabaciones + PPT/PDF + WhatsApp export + Google Calendar
- **Cero almacenamiento de video** — los archivos pesados viven en Google Drive; el VPS solo procesa texto
- **WhatsApp = solo consumo** — consultas y notificaciones; toda gestión desde la app
- **Interoperable** — expuesto como MCP server para consumo por otros agentes
- **Materias dinámicas** — agregar, pausar, completar o eliminar materias en cualquier momento

---

## 2. Materias Iniciales

Semestre 1 — 4 materias activas. El sistema soporta agregar y retirar materias libremente.

| # | Materia | Color | Código |
|---|---|---|---|
| 01 | Hacking Ético | `#FF4D1C` naranja | `HE-01` |
| 02 | Cumplimiento Normativo y RGPD | `#8B5CF6` púrpura | `CNR-02` |
| 03 | Monitorización y Data Mining | `#06B6D4` cyan | `MDM-03` |
| 04 | Gobierno de la Seguridad | `#22C55E` verde | `GS-04` |

### SQL de inserción inicial

```sql
INSERT INTO courses (name, code, color, status) VALUES
  ('Hacking Ético',                 'HE-01',  '#FF4D1C', 'active'),
  ('Cumplimiento Normativo y RGPD', 'CNR-02', '#8B5CF6', 'active'),
  ('Monitorización y Data Mining',  'MDM-03', '#06B6D4', 'active'),
  ('Gobierno de la Seguridad',      'GS-04',  '#22C55E', 'active');
```

### Estructura de carpetas en Google Drive

```
📁 Computadoras-Mi Mac-Documents-Master/
   📁 [01] Hacking Ético/
   │  📁 Semana 01 — Introducción y metodología/
   │     🎥 grabacion.mp4
   │     📊 slides.pptx
   📁 [02] Cumplimiento Normativo y RGPD/
   📁 [03] Monitorización y Data Mining/
   📁 [04] Gobierno de la Seguridad/
```

---

## 3. Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| **Backend** | Python 3.11 + FastAPI | Consistente con proyectos existentes en el VPS |
| **Workers** | Celery + Redis | Procesamiento asíncrono de videos |
| **Base de datos** | PostgreSQL 15 + pgvector | Ya disponible en el VPS |
| **Web App** | React 18 + Vite + CSS custom | PWA instalable; design system V3 |
| **Mobile App** | React Native + Expo SDK 51 | App nativa iOS/Android |
| **Auth** | Google OAuth2 | Drive + Calendar + Identity con un solo login |
| **Transcripción** | Deepgram API (primario) | Detección de hablantes; ~$0.74/clase de 2h |
| **Transcripción fallback** | Whisper `small` local | Solo si Deepgram no disponible |
| **LLM** | Claude API `claude-sonnet-4-6` (con prompt caching) | Extracción de señales + RAG + summarizer. System prompt cacheado para reducir ~75% del costo de input tokens |
| **Embeddings** | OpenAI `text-embedding-3-small` | 1536 dims; compatible con pgvector |
| **Audio** | ElevenLabs API (voz: Mateo) | Resúmenes en español neutro |
| **MCP Server** | FastMCP (Python) | Expone tools para otros agentes |
| **WhatsApp** | Meta Cloud API | Notificaciones + consultas básicas (read-only) |
| **Deploy backend** | Docker Compose en Hetzner | Consistente con infra actual |
| **Deploy web** | Vercel (gratis) | CDN global; deploy automático |
| **Deploy mobile** | Expo EAS Build | Genera .ipa / .apk |
| **CI/CD** | GitHub Actions | Push a main → deploy automático |

### Restricción de RAM (VPS: 2 CPU / 4GB)

Whisper `small` necesita ~2GB RAM. Usar Deepgram como modo primario para no impactar otros servicios durante el procesamiento.

---

## 4. Arquitectura del Sistema

```
FUENTES DE DATOS
────────────────────────────────────────────────────────────────
Google Drive          Google Calendar       WhatsApp Export
📁 Grabaciones        📅 Eventos clase       💬 chat.txt
📊 PDFs / PPTs        (detección auto)       (upload manual)
        │                    │                      │
        └────────────────────┴──────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │         FastAPI Backend                 │
        │         study.denario.cloud/api         │
        │                                         │
        │   ┌──────────────┐  ┌───────────────┐   │
        │   │   Ingestion  │  │  RAG Engine   │   │
        │   │   Pipeline   │  │  (pgvector)   │   │
        │   └──────┬───────┘  └───────────────┘   │
        │          │                               │
        │   ┌──────▼──────────────────────────┐   │
        │   │         Celery Workers           │   │
        │   │  Deepgram → Claude → Embeddings  │   │
        │   │         → ElevenLabs             │   │
        │   └─────────────────────────────────┘   │
        └────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
     Web App            Mobile App         MCP Server
  (React PWA)        (React Native)        (FastMCP)
  Vercel CDN         Expo / TestFlight     port 8002
          │                  │
          └──────────────────┘
                    │
              WhatsApp API
          (notificaciones + consultas)
```

---

## 5. Modelo de Datos

### 5.1 users

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id       TEXT UNIQUE NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    name            TEXT,
    google_token    JSONB,
    drive_folder_id TEXT,
    push_token      TEXT,                              -- Expo push token (mobile)
    timezone        TEXT DEFAULT 'America/Santiago',   -- IANA tz para scheduler
    whatsapp_number TEXT,                              -- E.164 sin '+' (ej: 56912345678)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 courses (materias)

```sql
CREATE TABLE courses (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID REFERENCES users(id) ON DELETE CASCADE,
    name                     TEXT NOT NULL,
    code                     TEXT,
    professor                TEXT,
    professor_whatsapp_name  TEXT,                          -- nombre tal como aparece en WhatsApp export
    drive_folder_id          TEXT,
    color                    TEXT DEFAULT '#FF4D1C',
    status                   TEXT DEFAULT 'active',         -- active | paused | completed | deleted
    start_date               DATE,
    end_date                 DATE,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_courses_user_status ON courses(user_id, status);
```

### 5.3 modules (semanas/clases)

```sql
CREATE TABLE modules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id         UUID REFERENCES courses(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    week_number       INT,
    topic             TEXT,
    class_date        DATE,
    calendar_event_id TEXT,
    status            TEXT DEFAULT 'pending',  -- pending | processing | ready
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_modules_course_week ON modules(course_id, week_number);
```

### 5.4 materials (archivos procesados)

```sql
CREATE TABLE materials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id       UUID REFERENCES modules(id) ON DELETE CASCADE,
    course_id       UUID REFERENCES courses(id),
    type            TEXT NOT NULL,  -- video | pdf | pptx | whatsapp_export
    filename        TEXT,
    drive_file_id   TEXT,
    drive_url       TEXT,
    transcript      TEXT,
    summary_text    TEXT,
    audio_path      TEXT,
    duration_seconds INT,
    status          TEXT DEFAULT 'pending',
    -- pending | downloading | transcribing | extracting | ready | error
    error_message   TEXT,
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_materials_module ON materials(module_id);
CREATE INDEX idx_materials_course ON materials(course_id);
-- Partial index: solo los materiales en proceso (los que importan para SSE/dashboard)
CREATE INDEX idx_materials_status_active ON materials(status)
    WHERE status IN ('pending', 'downloading', 'transcribing', 'extracting');
```

### 5.5 signals (señales pedagógicas)

```sql
CREATE TABLE signals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
    module_id   UUID REFERENCES modules(id),
    course_id   UUID REFERENCES courses(id),
    type        TEXT NOT NULL,
    -- exam_tip | important_content | reference | qa | pending_task
    content     TEXT NOT NULL,
    speaker     TEXT,      -- professor | student | unknown
    context     TEXT,
    timestamp_seconds INT,
    importance  TEXT DEFAULT 'medium',  -- high | medium | low
    source      TEXT,  -- recording | whatsapp | document
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_course_type ON signals(course_id, type, importance DESC, created_at DESC);
CREATE INDEX idx_signals_module_type  ON signals(module_id, type);
CREATE INDEX idx_signals_material     ON signals(material_id);
```

### 5.6 chunks (RAG — pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
    module_id   UUID REFERENCES modules(id),
    course_id   UUID REFERENCES courses(id),
    content     TEXT NOT NULL,
    embedding   vector(1536),
    chunk_index INT,
    chunk_type  TEXT DEFAULT 'transcript',
    -- transcript | document | whatsapp
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunks_embedding ON chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_course ON chunks (course_id);
CREATE INDEX idx_chunks_module ON chunks (module_id);
```

### 5.7 evaluations

```sql
CREATE TABLE evaluations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id         UUID REFERENCES courses(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    type              TEXT DEFAULT 'exam',
    -- exam | assignment | project | quiz
    due_date          DATE NOT NULL,
    description       TEXT,
    weight_pct        NUMERIC(5,2),
    status            TEXT DEFAULT 'pending',
    -- pending | submitted | graded
    grade             NUMERIC(5,2),
    calendar_event_id TEXT,
    reminder_sent_7d  BOOLEAN DEFAULT FALSE,
    reminder_sent_1d  BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evaluations_course_due ON evaluations(course_id, due_date);
-- Partial index: solo pendientes, para el scheduler de recordatorios
CREATE INDEX idx_evaluations_due_pending ON evaluations(due_date)
    WHERE status = 'pending';
```

### 5.8 calendar_events

```sql
CREATE TABLE calendar_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_event_id TEXT UNIQUE,
    course_id       UUID REFERENCES courses(id),
    module_id       UUID REFERENCES modules(id),
    title           TEXT,
    event_date      DATE,
    start_time      TIME,
    end_time        TIME,
    material_status TEXT DEFAULT 'missing',
    -- missing | partial | complete
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calendar_events_course_date ON calendar_events(course_id, event_date);
```

### 5.9 conversations + messages (historial de chat RAG)

```sql
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
    module_id   UUID REFERENCES modules(id) ON DELETE SET NULL,
    title       TEXT,                  -- generado por Claude del primer turn
    channel     TEXT DEFAULT 'web',    -- web | mobile | whatsapp
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,     -- user | assistant
    content         TEXT NOT NULL,
    sources         JSONB,             -- chunks usados (solo cuando role=assistant)
    mode            TEXT,              -- explain | quiz | flashcards | exam_prep
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX idx_messages_conversation      ON messages(conversation_id, created_at);
```

Reglas:
- El backend envía a Claude **los últimos 6 mensajes** de la conversación como contexto multi-turn.
- En WhatsApp, la conversación se mantiene "abierta" mientras haya menos de 2h de inactividad; tras eso se inicia una nueva.
- En web/mobile el usuario puede tener múltiples conversaciones simultáneas (sidebar con historial).

---

## 6. API Backend

### 6.1 Estructura de archivos

```
backend/
├── main.py
├── routers/
│   ├── auth.py           Google OAuth2
│   ├── courses.py        CRUD materias
│   ├── modules.py        CRUD semanas
│   ├── materials.py      Upload + procesamiento
│   ├── signals.py        Exam tips, refs, Q&A
│   ├── chat.py           RAG query
│   ├── evaluations.py    CRUD evaluaciones
│   ├── calendar.py       Sync Google Calendar
│   └── whatsapp.py       Webhook Meta Cloud API
├── services/
│   ├── drive_service.py
│   ├── deepgram_service.py
│   ├── whisper_service.py
│   ├── claude_service.py
│   ├── embeddings_service.py
│   ├── elevenlabs_service.py
│   ├── calendar_service.py
│   └── whatsapp_service.py
├── workers/
│   ├── celery_app.py
│   └── tasks.py
├── models/
│   └── *.py              SQLAlchemy models
└── scheduler.py          APScheduler
```

### 6.2 Endpoints

```
# AUTH
GET  /auth/google          → Redirect OAuth2
GET  /auth/callback        → Recibe code, crea sesión
POST /auth/logout
GET  /auth/me

# COURSES (materias)
GET    /courses
POST   /courses
PATCH  /courses/{id}       → nombre, estado, color, profesor, drive_folder
DELETE /courses/{id}

# MODULES (semanas)
GET    /courses/{course_id}/modules
POST   /courses/{course_id}/modules
PATCH  /modules/{id}
DELETE /modules/{id}

# MATERIALS
POST   /modules/{module_id}/materials/drive   → Drive URL/ID
POST   /modules/{module_id}/materials/upload  → WhatsApp .txt
GET    /materials/{id}/status                 → SSE stream
GET    /materials/{id}/transcript
GET    /materials/{id}/summary
GET    /materials/{id}/audio
DELETE /materials/{id}

# SIGNALS
GET    /courses/{course_id}/exam-tips
GET    /courses/{course_id}/references
GET    /courses/{course_id}/qa
GET    /courses/{course_id}/pending-tasks
GET    /modules/{module_id}/signals

# CHAT (RAG) — historial multi-turn persistido
GET    /conversations                              → lista conversaciones del usuario
GET    /conversations/{id}                         → mensajes de una conversación
DELETE /conversations/{id}                         → borrar una conversación
POST   /chat
       Body:     { query, conversation_id?, course_id?, module_id?,
                   mode: explain|quiz|flashcards|exam_prep }
                 # si conversation_id es null → crea nueva
                 # backend envía últimos 6 mensajes a Claude como contexto
       Response: { conversation_id, answer, sources, quiz_questions? }

# EVALUATIONS
GET    /evaluations
GET    /evaluations/upcoming
POST   /evaluations
PATCH  /evaluations/{id}
DELETE /evaluations/{id}

# CALENDAR
POST   /calendar/sync
GET    /calendar/weekly-status

# WHATSAPP (webhook)
GET    /webhook/whatsapp    → Verificación Meta
POST   /webhook/whatsapp    → Mensajes entrantes
```

---

## 7. Pipeline de Procesamiento

### 7.1 Video (.mp4)

```
1.  Usuario provee Drive File ID o URL desde la app
2.  Backend obtiene metadata (nombre, tamaño, duración)
3.  Material creado en DB: status = 'downloading'
4.  Celery task: process_material.delay(material_id)

── EN EL WORKER ──────────────────────────────────────
5.  Download temporal: /tmp/{material_id}.mp4
6.  status = 'transcribing'
7.  Deepgram API con diarización (identifica hablantes):
    [PROFESOR 00:05:23] "El algoritmo Kyber..."
    [ALUMNO   00:23:41] "¿Eso reemplaza a RSA?"
    [PROFESOR 00:23:48] "Para 2030 sí, pero..."
8.  Borrar /tmp/{material_id}.mp4  ← INMEDIATO
9.  status = 'extracting'
10. Claude: extracción de señales pedagógicas → signals DB
11. Claude: generar resumen (500-800 palabras)
12. ElevenLabs (voz Mateo): TTS → /app/audio/{id}.mp3
13. Chunking: fragmentos ~500 tokens, overlap 50
14. OpenAI Embeddings → pgvector
15. status = 'ready'
16. Notificar: SSE al frontend + WhatsApp
```

### 7.2 PDF / PPTX

```
Igual que video pero:
5.  PyMuPDF (PDF) o python-pptx (PPTX) extrae texto
8.  Borrar archivo temporal
→   Continúa desde paso 9
```

### 7.3 WhatsApp Export (.txt)

```
1.  Upload directo del .txt desde la app
2.  Parser detecta formato WhatsApp:
    [DD/MM/YYYY, HH:MM:SS] Nombre: Mensaje
3.  Identifica mensajes del profesor (por nombre configurado)
4.  Claude: extracción de señales
5.  Chunking y embeddings
    (NO se genera audio — es texto de chat)
```

---

## 8. Extracción de Señales (Claude)

```python
EXTRACTION_PROMPT = """
Analiza esta transcripción y extrae información pedagógica.
Responde SOLO con JSON, sin texto adicional.

{
  "resumen_ejecutivo": "3-5 oraciones del tema central",
  "conceptos_clave": ["concepto1", "concepto2"],
  "exam_tips": [
    {
      "contenido": "qué dijo (parafrasear)",
      "contexto": "por qué es importante para el examen",
      "speaker": "professor|student|unknown",
      "timestamp_aprox": "MM:SS o null",
      "importancia": "high|medium"
    }
  ],
  "contenido_importante": [
    { "tema": "...", "detalle": "...", "nivel_enfasis": "high|medium" }
  ],
  "referencias_externas": [
    {
      "tipo": "paper|libro|norma|sitio|tool",
      "titulo": "...",
      "autor_o_entidad": "...",
      "donde_buscar": "..."
    }
  ],
  "qa_aclaraciones": [
    {
      "pregunta": "...",
      "respuesta_profesor": "...",
      "concepto_aclarado": "...",
      "importante": true
    }
  ],
  "pendientes": [
    {
      "descripcion": "...",
      "fecha_mencionada": "YYYY-MM-DD o null",
      "tipo": "tarea|lectura|evaluacion|buscar_recurso"
    }
  ]
}

TRANSCRIPCIÓN:
{transcript}
"""
```

---

## 9. RAG Engine

```python
async def search_chunks(
    query: str,
    course_id: str = None,
    module_id: str = None,
    chunk_types: list = None,
    top_k: int = 8
) -> list:
    embedding = await get_embedding(query)
    conditions, params = ["1=1"], [embedding]

    if course_id:
        params.append(course_id)
        conditions.append(f"course_id = ${len(params)}")
    if module_id:
        params.append(module_id)
        conditions.append(f"module_id = ${len(params)}")

    params.append(top_k)
    sql = f"""
        SELECT c.content, c.chunk_type, m.name as module_name,
               co.name as course_name,
               1 - (c.embedding <=> $1::vector) AS similarity
        FROM chunks c
        JOIN modules m  ON c.module_id = m.id
        JOIN courses co ON c.course_id = co.id
        WHERE {' AND '.join(conditions)}
        ORDER BY similarity DESC
        LIMIT ${len(params)}
    """
    return await db.fetch(sql, *params)
```

### Modos de interacción

| Modo | Descripción |
|---|---|
| `explain` | Responde con contexto de los materiales |
| `quiz` | Genera 5 preguntas de opción múltiple |
| `flashcards` | Genera 10 pares pregunta-respuesta |
| `exam_prep` | Consolida exam_tips + conceptos + Q&A del curso |

---

## 10. Web App — Frontend

### Tecnologías
- React 18 + Vite
- CSS custom con variables (design system V3)
- PWA: manifest + service worker
- Deploy: Vercel (gratis, automático)

### Estructura

```
web/
├── public/
│   └── manifest.json
├── src/
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── CourseDetail.jsx
│   │   ├── ClassDetail.jsx
│   │   └── Settings.jsx
│   ├── components/
│   │   ├── CourseCard.jsx
│   │   ├── WeekCard.jsx
│   │   ├── ClassCard.jsx
│   │   ├── SignalCards.jsx
│   │   ├── AudioPlayer.jsx
│   │   ├── ChatInterface.jsx
│   │   ├── EvaluationBanner.jsx
│   │   ├── WeeklyChecklist.jsx
│   │   ├── MaterialUploader.jsx
│   │   ├── ProcessingStatus.jsx
│   │   └── AbstractArt.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useCourses.js
│   │   ├── useChat.js
│   │   └── useSSE.js
│   └── styles/
│       ├── tokens.css
│       ├── typography.css
│       └── components.css
└── vite.config.js
```

### PWA config

```json
{
  "name": "Maestro Claudio",
  "short_name": "MaestroClaudio",
  "theme_color": "#111111",
  "background_color": "#111111",
  "display": "standalone",
  "start_url": "/"
}
```

---

## 11. Mobile App — React Native + Expo

### Tecnologías
- Expo SDK 51 (managed workflow)
- Expo Router (file-based routing)
- Expo EAS Build para distribución
- TestFlight para iOS (uso personal, sin App Store)

### Dependencias clave

```json
{
  "expo": "~51.0.0",
  "expo-router": "^3.0.0",
  "expo-notifications": "~0.28.0",
  "expo-auth-session": "~5.4.0",
  "expo-av": "~14.0.0",
  "expo-document-picker": "~12.0.0",
  "@expo-google-fonts/bebas-neue": "latest",
  "@expo-google-fonts/dm-sans": "latest",
  "@expo-google-fonts/space-mono": "latest",
  "@react-native-async-storage/async-storage": "^1.23.1"
}
```

### Estructura

```
mobile/
├── app/
│   ├── (tabs)/
│   │   ├── index.jsx        Dashboard
│   │   ├── courses.jsx      Lista de materias
│   │   ├── chat.jsx         Chat global
│   │   └── calendar.jsx     Evaluaciones
│   └── course/[id].jsx      Detalle de materia
├── components/
├── constants/
│   ├── Colors.ts
│   └── Typography.ts
└── hooks/
```

### Funcionalidades por plataforma

| Feature | Web | Mobile |
|---|---|---|
| Dashboard completo | ✅ | ✅ |
| Subir material (Drive URL) | ✅ | ✅ |
| Subir WhatsApp .txt | ✅ | ✅ (share sheet) |
| Chat RAG | ✅ | ✅ |
| Audio player | ✅ | ✅ (background) |
| Push notifications | Limitado | ✅ nativas |
| Google OAuth | ✅ | ✅ (Expo Auth Session) |
| Gestión de materias | ✅ | ✅ |

---

## 12. Design System V3 "Abstract Intelligence"

### Filosofía
- Sin fotografías — reemplazadas por abstracciones SVG únicas por materia
- Tipografía como elemento visual — números oversized como decoración
- Gradient meshes — profundidad y calor en cards clave
- Color semántico — cada señal tiene color consistente

### Colores (CSS Variables)

```css
:root {
  /* Fondos */
  --bg:    #111111;
  --bg2:   #181818;
  --bg3:   #202020;
  --bg4:   #282828;

  /* Brand */
  --orange:  #FF4D1C;
  --orange2: #FF7A4D;

  /* Señales pedagógicas */
  --tip:     #F59E0B;   /* exam tips     */
  --ref:     #FF4D1C;   /* referencias   */
  --qa:      #22C55E;   /* Q&A           */
  --pending: #EF4444;   /* pendientes    */

  /* Materias */
  --c-hacking:    #FF4D1C;
  --c-normativa:  #8B5CF6;
  --c-monitoring: #06B6D4;
  --c-gobierno:   #22C55E;

  /* Texto */
  --text:   #EFEFEF;
  --muted:  #777777;
  --muted2: #444444;

  /* Bordes */
  --border:  #252525;
  --border2: #303030;
}
```

### Tipografía

```css
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');

/* Roles:
   Bebas Neue  → Títulos, números grandes, stats
   DM Sans     → Texto, labels, botones
   Space Mono  → Fechas, códigos, badges, kickers
*/
```

### React Native — tokens

```typescript
// constants/Colors.ts
export const Colors = {
  bg: '#111111', bg2: '#181818', bg3: '#202020',
  orange: '#FF4D1C', orange2: '#FF7A4D',
  tip: '#F59E0B', ref: '#FF4D1C', qa: '#22C55E',
  text: '#EFEFEF', muted: '#777777',
  border: '#252525',
  courses: {
    hacking:    '#FF4D1C',
    normativa:  '#8B5CF6',
    monitoring: '#06B6D4',
    gobierno:   '#22C55E',
  }
}
```

---

## 13. Google OAuth2

```
Scopes necesarios:
  openid profile email                              → identidad
  https://www.googleapis.com/auth/drive.readonly    → leer Drive
  https://www.googleapis.com/auth/calendar.readonly → leer Calendar

Flujo:
1. Usuario visita study.denario.cloud → no hay sesión → /login
2. Click "Iniciar sesión con Google"
3. Redirect a Google OAuth2 con los 3 scopes
4. Google redirige a /auth/callback?code=XXX
5. Backend: exchange code → access_token + refresh_token
6. Tokens guardados encriptados en users.google_token
7. JWT de sesión (HTTPOnly cookie, 7 días)
8. Redirect al Dashboard
```

---

## 14. Integración Google Calendar

### Sync automático (APScheduler)

```python
# Corre cada lunes a 08:00 hora de Santiago (UTC-3 → 11:00 UTC)
@scheduler.scheduled_job('cron', day_of_week='mon', hour=11)
async def weekly_calendar_sync():
    # 1. Obtener eventos de la semana pasada
    # 2. Filtrar por nombres de materias configurados
    # 3. Cruzar con tabla calendar_events
    # 4. Notificar: WhatsApp + push web
```

### Notificación semanal (WhatsApp, lunes 08:00)

```
📅 Semana 18 — Maestro Claudio

Clases detectadas esta semana:
• Lun 12/05 — Hacking Ético ❌
• Mié 14/05 — Monitorización ❌
• Vie 16/05 — Gobierno Seguridad ❌

¿Tienes las grabaciones disponibles?
```

---

## 15. WhatsApp — Solo Lectura y Notificaciones

WhatsApp es un canal de **consumo**, no de gestión.
Toda la administración ocurre exclusivamente en la web app o app móvil.

### Lo que SÍ puede hacer por WhatsApp

- Recibir notificaciones automáticas
- Consultar: "dame mis exam tips de esta semana"
- Consultar: "¿qué tengo pendiente?"
- Chat RAG básico: "explícame el concepto X"

### Lo que NO puede hacer por WhatsApp

- Agregar o eliminar materias
- Subir material o configurar Drive
- Gestionar evaluaciones
- Cambiar configuración de la cuenta

### Eventos que generan notificaciones automáticas

| Evento | Mensaje |
|---|---|
| Material procesado | "✅ Clase lista — N exam tips detectados" |
| Sync semanal | "📅 Tienes N clases sin procesar esta semana" |
| Evaluación en 7 días | "⏰ {título} en 7 días. ¿Repasamos?" |
| Evaluación en 1 día | "🔴 {título} es mañana. Tus exam tips: ..." |
| Error de procesamiento | "⚠️ Error procesando {archivo}. Ver en la app." |
| Deploy exitoso | "✅ Maestro Claudio actualizado correctamente" |

---

## 16. MCP Server

Accesible en `https://study.denario.cloud/mcp` — permite que otros agentes (Claude.ai, Claude Code, tu AI Agent personal) consulten el conocimiento de la Maestría.

### Tools expuestos

```python
@mcp.tool()
async def study_search(query, course_id=None, subject_name=None, week=None)
# Busca en el material académico indexado

@mcp.tool()
async def get_exam_tips(course_id=None, subject_name=None)
# Exam tips detectados en grabaciones y WhatsApp

@mcp.tool()
async def get_pending_tasks()
# Evaluaciones próximas y tareas pendientes

@mcp.tool()
async def get_class_summary(course_id, week)
# Resumen de una clase específica

@mcp.tool()
async def get_references(subject_name=None, topic=None)
# Referencias bibliográficas mencionadas en clases

@mcp.tool()
async def get_qa_pairs(subject_name=None, topic=None)
# Preguntas de compañeros + aclaraciones del profesor

@mcp.tool()
async def list_courses()
# Lista materias activas con estado de procesamiento

@mcp.tool()
async def get_weekly_status()
# Estado de la semana: clases detectadas vs material subido
```

### Conexión desde Claude.ai

```
Settings → Connectors → Add MCP Server
URL: https://study.denario.cloud/mcp
Auth: Bearer {MCP_TOKEN}
```

### Conexión desde Claude Code

```json
// ~/.claude/mcp_servers.json
{
  "maestro-claudio": {
    "type": "url",
    "url": "https://study.denario.cloud/mcp",
    "headers": { "Authorization": "Bearer {MCP_TOKEN}" }
  }
}
```

---

## 17. Gestión Dinámica de Materias

### Acciones desde la app

| Acción | Resultado |
|---|---|
| **Agregar materia** | Nueva fila en courses, carpeta sugerida en Drive |
| **Editar materia** | Actualiza nombre, color, profesor, carpeta Drive |
| **Pausar** | `status = 'paused'` — oculta del dashboard activo |
| **Completar** | `status = 'completed'` — pasa al historial |
| **Eliminar** | Soft delete con confirmación — borra todo el contenido |
| **Restaurar** | `status = 'active'` — vuelve al dashboard |

### Flujo de onboarding de nueva materia

```
1. Tap "+ Agregar materia"
2. Formulario: nombre, código (opcional), profesor (opcional), color
3. Conectar carpeta Drive (opcional — se puede después)
4. Materia creada → aparece en sidebar y dashboard
```

---

## 18. Infraestructura Docker

### Estructura de archivos

```
infrastructure/
├── docker-compose.dev.yml    ← Desarrollo local
├── docker-compose.prod.yml   ← Producción en Hetzner
└── migrations/
    └── 001_initial_schema.sql
```

### docker-compose.dev.yml (Mac local)

```yaml
version: '3.8'
services:
  maestro-api:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports: ["8001:8001"]
    volumes:
      - ./backend:/app          # hot reload
      - ./audio:/app/audio
    env_file: .env.local
    command: uvicorn main:app --reload --host 0.0.0.0 --port 8001
    depends_on: [redis, postgres-dev]

  maestro-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    volumes:
      - ./backend:/app
      - /tmp:/tmp
      - ./audio:/app/audio
    env_file: .env.local
    command: celery -A workers.celery_app worker --loglevel=info --concurrency=1
    depends_on: [redis, postgres-dev]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  postgres-dev:
    image: pgvector/pgvector:pg15
    ports: ["5433:5432"]   # 5433 para no chocar con otros servicios
    environment:
      POSTGRES_DB: maestro_claudio_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes:
      - pgdata_dev:/var/lib/postgresql/data

volumes:
  pgdata_dev:
```

### docker-compose.prod.yml (Hetzner VPS)

```yaml
version: '3.8'
services:
  maestro-api:
    build: ./backend
    ports: ["8001:8001"]
    volumes: ["./audio:/app/audio"]
    env_file: .env.production
    restart: always
    depends_on: [redis]

  maestro-worker:
    build: ./backend
    command: celery -A workers.celery_app worker --loglevel=info --concurrency=2
    volumes:
      - /tmp:/tmp
      - ./audio:/app/audio
    env_file: .env.production
    restart: always
    depends_on: [redis]

  maestro-mcp:
    build: ./mcp
    ports: ["8002:8002"]
    env_file: .env.production
    restart: always

  redis:
    image: redis:7-alpine
    volumes: ["redis_data:/data"]
    restart: always

  # PostgreSQL usa la instancia existente del VPS (nueva DB maestro_claudio)

volumes:
  redis_data:
```

---

## 19. Entorno Local — Setup en Mac

### Instalación única (una sola vez)

```bash
# 1. Homebrew (si no lo tienes)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Herramientas base
brew install git python@3.11 node

# 3. Docker Desktop
# Descargar en: https://docker.com/products/docker-desktop
# Instalar y abrir la app

# 4. Expo CLI (para mobile)
npm install -g @expo/cli eas-cli

# 5. Clonar el repo
git clone https://github.com/lenintoledo07/maestro-claudio
cd maestro-claudio

# 6. Crear variables de entorno locales
cp .env.example .env.local
# Editar .env.local con tus API keys reales
```

### Levantar el entorno de desarrollo

```bash
# Terminal 1 — Backend + Workers + Redis + DB local
docker-compose -f infrastructure/docker-compose.dev.yml up

# Terminal 2 — Web App
cd web && npm install && npm run dev
# → http://localhost:5173

# Terminal 3 — Mobile (opcional, cuando trabajas en mobile)
cd mobile && npm install && npx expo start
# → Escanear QR con Expo Go en tu teléfono
```

### Lo que tienes disponible en local

```
http://localhost:5173   → Web App (React, hot reload)
http://localhost:8001   → API Backend (Python, hot reload)
http://localhost:8001/docs → Swagger UI (documentación interactiva)
localhost:5433          → PostgreSQL local (solo desarrollo)
Expo Go en tu teléfono  → Mobile App
```

### Hot reload — cambios instantáneos

- Modificas un `.py` → el servidor se reinicia en ~2 segundos
- Modificas un `.jsx` → el browser se actualiza solo (Vite HMR)
- Modificas un archivo mobile → Expo Go en tu teléfono se actualiza solo

---

## 20. GitHub — Repositorio y Ramas

### Estructura de ramas

```
main      ← PRODUCCIÓN
          Cada push aquí dispara el deploy automático.
          Solo mergear cuando algo está listo.

develop   ← DESARROLLO
          Aquí trabajas día a día.
          Push libre, no afecta producción.

feature/* ← FUNCIONALIDADES (opcional)
          Para features grandes o experimentales.
          Ej: feature/whatsapp-integration
```

### Crear el repositorio

```bash
# 1. En github.com → New Repository
#    Nombre: maestro-claudio | Privado: Sí

# 2. En tu Mac
cd maestro-claudio
git init
git add .
git commit -m "feat: initial project structure"
git branch -M main
git remote add origin https://github.com/lenintoledo07/maestro-claudio.git
git push -u origin main

# 3. Crear rama develop
git checkout -b develop
git push origin develop
```

### Flujo de trabajo diario

```bash
# Trabajar siempre en develop
git checkout develop

# ... hacés cambios y los probás localmente ...

# Guardar progreso (no afecta producción)
git add .
git commit -m "feat: agregar exam tips por materia"
git push origin develop

# ── Cuando algo está listo para publicar ──

git checkout main
git merge develop
git push origin main          # ← dispara CI/CD automático
git checkout develop          # volver a develop para seguir
```

### .gitignore esencial

```
.env.local
.env.production
.env*.local
__pycache__/
*.pyc
node_modules/
dist/
.expo/
audio/
/tmp/
*.mp4
*.mp3
```

---

## 21. CI/CD — Deploy Automático

### Cómo funciona

```
Tu Mac
  │  git push origin main
  ▼
GitHub
  │  GitHub Actions se activa
  ├──────────────────────────────────►  Vercel
  │                                     Redeploya la web app automáticamente
  │                                     (Vercel ya está conectado al repo)
  │
  ├──► SSH al VPS Hetzner
  │     git pull origin main
  │     docker-compose up --build
  │     (backend + workers + MCP actualizados)
  │
  └──► WhatsApp a Lenin
        "✅ Maestro Claudio actualizado"
```

### Archivo .github/workflows/deploy.yml

```yaml
name: Deploy Maestro Claudio

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy al VPS via SSH
        uses: appleboy/ssh-action@master
        with:
          host:     ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key:      ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/maestro-claudio
            git pull origin main
            docker-compose -f infrastructure/docker-compose.prod.yml \
              up -d --build maestro-api maestro-worker maestro-mcp
            echo "Backend actualizado OK"

  notify:
    runs-on: ubuntu-latest
    needs: [deploy-backend]
    if: always()
    steps:
      - name: Notificar por WhatsApp
        run: |
          if [ "${{ needs.deploy-backend.result }}" = "success" ]; then
            MSG="✅ Maestro Claudio actualizado correctamente"
          else
            MSG="❌ Error en el deploy. Revisar GitHub Actions."
          fi
          curl -s -X POST \
            "https://graph.facebook.com/${{ vars.META_API_VERSION || 'v21.0' }}/${{ secrets.WA_PHONE_ID }}/messages" \
            -H "Authorization: Bearer ${{ secrets.WA_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d "{\"messaging_product\":\"whatsapp\",\"to\":\"${{ secrets.WA_MY_NUMBER }}\",\"type\":\"text\",\"text\":{\"body\":\"$MSG\"}}"
```

### GitHub Secrets — configurar una sola vez

```
Ir a: github.com/lenintoledo07/maestro-claudio
      → Settings → Secrets and variables → Actions → New repository secret

VPS_HOST       → IP de tu Hetzner (ej: 65.21.xxx.xxx)
VPS_USER       → root
VPS_SSH_KEY    → Contenido de ~/.ssh/id_rsa en tu Mac
                 (cat ~/.ssh/id_rsa y copiar todo)
WA_PHONE_ID    → ID de tu número en Meta Cloud API
WA_TOKEN       → Token de acceso permanente de WhatsApp
WA_MY_NUMBER   → Tu número con código país (ej: 56912345678)
```

### Setup Vercel — una sola vez (5 minutos)

```
1. Ir a vercel.com → "Add New Project"
2. Importar: lenintoledo07/maestro-claudio
3. Root Directory: web/
4. Framework Preset: Vite
5. Environment Variables:
   VITE_API_URL = https://study.denario.cloud/api
6. Deploy
7. Settings → Domains → Agregar: study.denario.cloud

Desde este momento, cada push a main redeploya la web automáticamente.
Vercel también crea un preview por cada push a develop (URL temporal para revisar).
```

### Setup VPS para recibir deploys — una sola vez

```bash
# Conectarse al VPS
ssh root@TU_IP_HETZNER

# Instalar Docker si no está instalado
curl -fsSL https://get.docker.com | sh

# Clonar el repo
cd /opt
git clone https://github.com/lenintoledo07/maestro-claudio
cd maestro-claudio

# Crear .env de producción
cp .env.example .env.production
nano .env.production    # Completar con API keys reales

# Crear la base de datos en el PostgreSQL existente
psql -U postgres -c "CREATE DATABASE maestro_claudio;"

# Primer arranque
docker-compose -f infrastructure/docker-compose.prod.yml up -d

# Autorizar la clave SSH de GitHub Actions
# (pegar el contenido de la clave pública generada para los Secrets)
echo "TU_CLAVE_PUBLICA" >> ~/.ssh/authorized_keys
```

### Tiempos de deploy

| Componente | Tiempo |
|---|---|
| Backend (Hetzner) | ~60 segundos |
| Web App (Vercel) | ~45 segundos |
| Notificación WhatsApp | ~2 minutos |
| **Total hasta usar la nueva versión** | **~2 minutos** |

---

## 22. Plan de Implementación

| Fase | Contenido | Días est. |
|---|---|---|
| **0 — Setup** | Repo GitHub + setup Mac + Vercel + VPS preparado | 1 |
| **1 — Backend base** | Schema SQL + Auth Google + CRUD courses/modules + Docker dev | 3-4 |
| **2 — Ingestion** | Drive service + Deepgram + Claude extracción + pgvector | 3-4 |
| **3 — RAG + Audio** | RAG engine + summarizer + ElevenLabs + chat endpoint | 2-3 |
| **4 — Web App** | React + design V3 + todas las vistas + PWA | 3-4 |
| **5 — Calendar + WhatsApp** | Google Calendar sync + Meta API + APScheduler | 2 |
| **6 — Mobile** | React Native + Expo + todas las screens + EAS Build | 3-4 |
| **7 — MCP Server** | FastMCP + 8 tools + auth + test desde Claude.ai | 1-2 |
| **Total** | | **18-24 días** |

### Orden sugerido para arrancar

```
Hoy:
  1. Crear repo en GitHub ← 5 minutos
  2. Conectar Vercel      ← 5 minutos
  3. Setup VPS            ← 15 minutos

Mañana:
  4. Generar estructura de carpetas del proyecto
  5. Schema SQL y migraciones
  6. Google OAuth2 funcionando
  → Primera versión deployada (aunque vacía)
```

---

## 23. Variables de Entorno

### .env.example (commiteado en el repo)

```env
# App
SECRET_KEY=
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://dev:dev@localhost:5433/maestro_claudio_dev

# Redis
REDIS_URL=redis://localhost:6379

# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8001/auth/callback

# APIs
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-6
CLAUDE_MODEL_BULK=claude-haiku-4-5         # opcional, para reprocesamientos masivos
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# WhatsApp (Meta Cloud API)
META_API_VERSION=v21.0
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_MY_NUMBER=

# MCP
MCP_AUTH_TOKEN=
```

### Diferencias entre .env.local y .env.production

| Variable | Local | Producción |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` |
| `DATABASE_URL` | `localhost:5433/maestro_claudio_dev` | `localhost:5432/maestro_claudio` |
| `FRONTEND_URL` | `http://localhost:5173` | `https://study.denario.cloud` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8001/auth/callback` | `https://study.denario.cloud/api/auth/callback` |

---

## Estructura Final del Repositorio

```
lenintoledo07/maestro-claudio/
│
├── .github/
│   └── workflows/
│       └── deploy.yml          ← CI/CD automático
│
├── backend/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── requirements.txt
│   ├── main.py
│   ├── routers/
│   ├── services/
│   ├── workers/
│   ├── models/
│   └── scheduler.py
│
├── mcp/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── server.py
│
├── web/
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   └── manifest.json
│   └── src/
│       ├── pages/
│       ├── components/
│       └── styles/
│
├── mobile/
│   ├── package.json
│   ├── app.json
│   ├── app/
│   ├── components/
│   └── constants/
│
├── infrastructure/
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   └── migrations/
│       └── 001_initial_schema.sql
│
├── .env.example                ← Template (commiteado)
├── .gitignore                  ← .env.local y .env.production excluidos
└── README.md
```

---

*Maestro Claudio — Especificación Técnica Definitiva v4.0*
*Documento completo y listo para comenzar el desarrollo.*
*Mayo 2026 — Lenin Toledo*

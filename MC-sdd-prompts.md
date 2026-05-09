# Maestro Claudio — Prompts SDD (Spec-Driven Development)
**Metodología:** Spec-Driven Development
**Herramienta:** Claude Code (`claude` en terminal)
**Versión:** 1.0 | Mayo 2026

---

## Cómo usar estos prompts

1. Abre la terminal en tu Mac
2. Entra al proyecto: `cd maestro-claudio`
3. Abre Claude Code: `claude`
4. Copia y pega el prompt correspondiente
5. Revisa lo que genera, pruébalo, luego pasa al siguiente
6. **Nunca saltes fases** — cada una depende de la anterior

---

## FASE 0 — Setup del Proyecto

### Prompt 0.1 — Estructura inicial del repositorio

```
Estoy construyendo "Maestro Claudio", un agente de estudio personal para mi Maestría en Ciberseguridad.

Crea la estructura completa de carpetas y archivos base del proyecto con las siguientes especificaciones:

ESTRUCTURA REQUERIDA:
maestro-claudio/
├── .github/workflows/deploy.yml
├── backend/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── requirements.txt
│   ├── main.py
│   ├── routers/ (vacío con __init__.py)
│   ├── services/ (vacío con __init__.py)
│   ├── workers/ (vacío con __init__.py)
│   └── models/ (vacío con __init__.py)
├── mcp/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── server.py (esqueleto)
├── web/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── pages/ (vacío)
│       ├── components/ (vacío)
│       └── styles/
│           └── tokens.css
├── mobile/
│   ├── package.json
│   └── app.json
├── infrastructure/
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.example
├── .gitignore
└── README.md

SPECS:
- Backend: Python 3.11 + FastAPI + Celery + Redis
- Web: React 18 + Vite (sin Tailwind, CSS custom)
- Mobile: React Native + Expo SDK 51
- DB: PostgreSQL + pgvector
- Python packages en requirements.txt: fastapi, uvicorn, celery, redis, asyncpg, sqlalchemy, pgvector, anthropic, deepgram-sdk, elevenlabs, google-auth, google-auth-oauthlib, google-api-python-client, openai, pymupdf, python-pptx, python-multipart, python-jose, apscheduler, fastmcp
- El .gitignore debe excluir: .env.local, .env.production, __pycache__, node_modules, dist, .expo, audio/, *.mp4, *.mp3

Para el .env.example incluir estas variables sin valores (excepto donde se indica un default):
SECRET_KEY, ENVIRONMENT, FRONTEND_URL, DATABASE_URL, REDIS_URL,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
CLAUDE_API_KEY,
CLAUDE_MODEL=claude-sonnet-4-6,
CLAUDE_MODEL_BULK=claude-haiku-4-5,
DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID,
META_API_VERSION=v21.0,
WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_WEBHOOK_VERIFY_TOKEN, WHATSAPP_MY_NUMBER,
MCP_AUTH_TOKEN

Genera todos los archivos con contenido real y funcional, no placeholders vacíos.
```

---

### Prompt 0.2 — Schema SQL completo

```
Crea el archivo infrastructure/migrations/001_initial_schema.sql con el schema completo de Maestro Claudio.

TABLAS REQUERIDAS (en este orden para respetar foreign keys):

1. users
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - google_id TEXT UNIQUE NOT NULL
   - email TEXT UNIQUE NOT NULL
   - name TEXT
   - google_token JSONB (access_token + refresh_token encriptados)
   - drive_folder_id TEXT
   - push_token TEXT             -- Expo push token (mobile)
   - timezone TEXT DEFAULT 'America/Santiago'  -- IANA tz, usado por scheduler
   - whatsapp_number TEXT        -- E.164 sin '+' (ej: 56912345678)
   - created_at TIMESTAMPTZ DEFAULT NOW()

2. courses (materias)
   - id UUID PRIMARY KEY
   - user_id UUID REFERENCES users(id) ON DELETE CASCADE
   - name TEXT NOT NULL
   - code TEXT
   - professor TEXT
   - professor_whatsapp_name TEXT  -- nombre tal como aparece en WhatsApp export
   - drive_folder_id TEXT
   - color TEXT DEFAULT '#FF4D1C'
   - status TEXT DEFAULT 'active'  -- active|paused|completed|deleted
   - start_date DATE, end_date DATE
   - created_at TIMESTAMPTZ DEFAULT NOW()

3. modules (semanas/clases dentro de una materia)
   - id UUID PRIMARY KEY
   - course_id UUID REFERENCES courses(id) ON DELETE CASCADE
   - name TEXT NOT NULL
   - week_number INT
   - topic TEXT
   - class_date DATE
   - calendar_event_id TEXT
   - status TEXT DEFAULT 'pending'  -- pending|processing|ready
   - created_at TIMESTAMPTZ DEFAULT NOW()

4. materials (archivos procesados)
   - id UUID PRIMARY KEY
   - module_id UUID REFERENCES modules(id) ON DELETE CASCADE
   - course_id UUID REFERENCES courses(id)
   - type TEXT NOT NULL  -- video|pdf|pptx|whatsapp_export
   - filename TEXT, drive_file_id TEXT, drive_url TEXT
   - transcript TEXT, summary_text TEXT, audio_path TEXT
   - duration_seconds INT
   - status TEXT DEFAULT 'pending'
   -- pending|downloading|transcribing|extracting|ready|error
   - error_message TEXT
   - processed_at TIMESTAMPTZ
   - created_at TIMESTAMPTZ DEFAULT NOW()

5. signals (señales pedagógicas extraídas por Claude)
   - id UUID PRIMARY KEY
   - material_id UUID REFERENCES materials(id) ON DELETE CASCADE
   - module_id UUID REFERENCES modules(id)
   - course_id UUID REFERENCES courses(id)
   - type TEXT NOT NULL
   -- exam_tip|important_content|reference|qa|pending_task
   - content TEXT NOT NULL
   - speaker TEXT  -- professor|student|unknown
   - context TEXT
   - timestamp_seconds INT
   - importance TEXT DEFAULT 'medium'  -- high|medium|low
   - source TEXT  -- recording|whatsapp|document
   - created_at TIMESTAMPTZ DEFAULT NOW()

6. chunks (fragmentos para RAG — pgvector)
   - id UUID PRIMARY KEY
   - material_id UUID REFERENCES materials(id) ON DELETE CASCADE
   - module_id UUID REFERENCES modules(id)
   - course_id UUID REFERENCES courses(id)
   - content TEXT NOT NULL
   - embedding vector(1536)
   - chunk_index INT
   - chunk_type TEXT DEFAULT 'transcript'
   - created_at TIMESTAMPTZ DEFAULT NOW()
   - Índices: ivfflat en embedding, btree en course_id y module_id

7. evaluations
   - id UUID PRIMARY KEY
   - course_id UUID REFERENCES courses(id) ON DELETE CASCADE
   - title TEXT NOT NULL
   - type TEXT DEFAULT 'exam'  -- exam|assignment|project|quiz
   - due_date DATE NOT NULL
   - description TEXT, weight_pct NUMERIC(5,2)
   - status TEXT DEFAULT 'pending'  -- pending|submitted|graded
   - grade NUMERIC(5,2), calendar_event_id TEXT
   - reminder_sent_7d BOOLEAN DEFAULT FALSE
   - reminder_sent_1d BOOLEAN DEFAULT FALSE
   - created_at TIMESTAMPTZ DEFAULT NOW()

8. calendar_events
   - id UUID PRIMARY KEY
   - google_event_id TEXT UNIQUE
   - course_id UUID REFERENCES courses(id)
   - module_id UUID REFERENCES modules(id)
   - title TEXT, event_date DATE, start_time TIME, end_time TIME
   - material_status TEXT DEFAULT 'missing'  -- missing|partial|complete
   - created_at TIMESTAMPTZ DEFAULT NOW()

9. conversations (historial de chat RAG, multi-turn)
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - user_id UUID REFERENCES users(id) ON DELETE CASCADE
   - course_id UUID REFERENCES courses(id) ON DELETE SET NULL
   - module_id UUID REFERENCES modules(id) ON DELETE SET NULL
   - title TEXT             -- generado por Claude del primer turn
   - channel TEXT DEFAULT 'web'   -- web|mobile|whatsapp
   - created_at TIMESTAMPTZ DEFAULT NOW()
   - updated_at TIMESTAMPTZ DEFAULT NOW()

10. messages (turnos de cada conversación)
    - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    - conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE
    - role TEXT NOT NULL    -- user|assistant
    - content TEXT NOT NULL
    - sources JSONB         -- chunks usados (solo cuando role=assistant)
    - mode TEXT             -- explain|quiz|flashcards|exam_prep
    - created_at TIMESTAMPTZ DEFAULT NOW()

ÍNDICES SECUNDARIOS (al final, después de todos los CREATE TABLE):

CREATE INDEX idx_courses_user_status         ON courses(user_id, status);
CREATE INDEX idx_modules_course_week         ON modules(course_id, week_number);
CREATE INDEX idx_materials_module            ON materials(module_id);
CREATE INDEX idx_materials_course            ON materials(course_id);
CREATE INDEX idx_materials_status_active     ON materials(status)
    WHERE status IN ('pending', 'downloading', 'transcribing', 'extracting');
CREATE INDEX idx_signals_course_type         ON signals(course_id, type, importance DESC, created_at DESC);
CREATE INDEX idx_signals_module_type         ON signals(module_id, type);
CREATE INDEX idx_signals_material            ON signals(material_id);
CREATE INDEX idx_evaluations_course_due      ON evaluations(course_id, due_date);
CREATE INDEX idx_evaluations_due_pending     ON evaluations(due_date) WHERE status = 'pending';
CREATE INDEX idx_calendar_events_course_date ON calendar_events(course_id, event_date);
CREATE INDEX idx_conversations_user_updated  ON conversations(user_id, updated_at DESC);
CREATE INDEX idx_messages_conversation       ON messages(conversation_id, created_at);

Al final del archivo agregar el INSERT de las 4 materias iniciales:
- Hacking Ético (#FF4D1C)
- Cumplimiento Normativo y RGPD (#8B5CF6)
- Monitorización y Data Mining (#06B6D4)
- Gobierno de la Seguridad (#22C55E)

Nota: el INSERT de materias requiere un user_id. Dejarlo como comentario con instrucción de correrlo después del primer login.
```

---

### Prompt 0.3 — Docker Compose desarrollo y producción

```
Crea los dos archivos Docker Compose para Maestro Claudio.

ARCHIVO 1: infrastructure/docker-compose.dev.yml (para Mac local)

Servicios:
- maestro-api: FastAPI con hot reload
  - build: ./backend con Dockerfile.dev
  - puerto: 8001:8001
  - volumes: ./backend:/app (hot reload) y ./audio:/app/audio
  - env_file: .env.local
  - command: uvicorn main:app --reload --host 0.0.0.0 --port 8001
  - depends_on: redis, postgres-dev

- maestro-worker: Celery con concurrency=1 (Mac tiene 4GB RAM compartidos)
  - mismo build que api
  - volumes: ./backend:/app, /tmp:/tmp, ./audio:/app/audio
  - env_file: .env.local
  - command: celery -A workers.celery_app worker --loglevel=info --concurrency=1

- redis: redis:7-alpine, puerto 6379:6379

- postgres-dev: pgvector/pgvector:pg15
  - puerto: 5433:5432 (5433 para no chocar con otros PostgreSQL)
  - DB: maestro_claudio_dev, user: dev, password: dev
  - volume persistente pgdata_dev

ARCHIVO 2: infrastructure/docker-compose.prod.yml (para Hetzner VPS)

Servicios:
- maestro-api: igual pero sin hot reload, restart: always, env_file: .env.production
- maestro-worker: concurrency=2, restart: always
- maestro-mcp: build ./mcp, puerto 8002:8002, restart: always
- redis: redis:7-alpine con volumen persistente, restart: always
- NO incluir postgres (usa el PostgreSQL existente del VPS)

También crea backend/Dockerfile.dev con:
- FROM python:3.11-slim
- Instalar dependencias del sistema (libpq-dev, ffmpeg para Whisper fallback)
- pip install requirements.txt
- WORKDIR /app

Y backend/Dockerfile para producción (igual pero sin volúmenes de desarrollo).
```

---

### Prompt 0.4 — CI/CD GitHub Actions

```
Crea el archivo .github/workflows/deploy.yml para Maestro Claudio.

El workflow debe:
1. Dispararse SOLO en push a la rama main
2. Tener dos jobs: deploy-backend y notify

JOB deploy-backend:
- Usar ubuntu-latest
- Usar la action appleboy/ssh-action@master
- Conectarse al VPS con secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY
- En el VPS ejecutar:
  cd /opt/maestro-claudio
  git pull origin main
  docker-compose -f infrastructure/docker-compose.prod.yml up -d --build maestro-api maestro-worker maestro-mcp
  docker image prune -f

JOB notify:
- Depende de deploy-backend
- Correr siempre (if: always())
- Enviar mensaje WhatsApp via Meta Cloud API usando secrets:
  WA_PHONE_ID, WA_TOKEN, WA_MY_NUMBER
- Si el deploy fue exitoso: "✅ Maestro Claudio actualizado correctamente"
- Si falló: "❌ Error en el deploy. Revisar GitHub Actions."

También crea un archivo .github/workflows/preview.yml que:
- Se dispare en push a develop
- No haga deploy (Vercel lo maneja automáticamente)
- Solo corra un check básico: que el requirements.txt sea válido con pip check
```

---

## FASE 1 — Backend Base

### Prompt 1.1 — FastAPI app principal + configuración

```
Crea el backend de Maestro Claudio con FastAPI.

Crea backend/main.py con:
- Aplicación FastAPI con título "Maestro Claudio API", versión "1.0.0"
- CORS configurado para aceptar el frontend (desde env FRONTEND_URL)
- Incluir routers: auth, courses, modules, materials, signals, chat, evaluations, calendar, whatsapp
- Middleware para logging de requests
- Endpoint GET /health que retorne {"status": "ok", "service": "maestro-claudio"}
- Lifespan handler que conecte a la DB al arrancar

Crea backend/database.py con:
- Conexión asyncpg a PostgreSQL (DATABASE_URL desde env)
- Pool de conexiones (min=2, max=10)
- Función get_db() como dependency de FastAPI
- Función init_db() que ejecuta las migraciones

Crea backend/config.py con:
- Clase Settings usando pydantic BaseSettings
- Leer todas las variables del .env.example
- Instancia global: settings = Settings()

Crea backend/models/schemas.py con los Pydantic schemas para:
- Course: CourseCreate, CourseUpdate, CourseResponse
- Module: ModuleCreate, ModuleUpdate, ModuleResponse
- Material: MaterialCreate, MaterialResponse
- Signal: SignalResponse
- Evaluation: EvaluationCreate, EvaluationUpdate, EvaluationResponse
- Chat: ChatRequest, ChatResponse

Todo con tipos correctos, Optional donde corresponde, y ejemplos en Config.
```

---

### Prompt 1.2 — Google OAuth2

```
Implementa el flujo completo de Google OAuth2 para Maestro Claudio.

Crea backend/routers/auth.py con:

GET /auth/google
- Genera la URL de autorización de Google con scopes:
  openid, profile, email,
  https://www.googleapis.com/auth/drive.readonly,
  https://www.googleapis.com/auth/calendar.readonly
- Redirige al usuario a Google

GET /auth/callback
- Recibe el code de Google
- Intercambia por access_token + refresh_token
- Busca o crea el usuario en la tabla users
- Guarda los tokens encriptados en users.google_token (usar Fernet de cryptography)
- Crea un JWT de sesión (HTTPOnly cookie, 7 días, usando python-jose)
- Redirige al frontend: FRONTEND_URL/dashboard

POST /auth/logout
- Borra la cookie de sesión
- Retorna {"message": "logged out"}

GET /auth/me
- Requiere autenticación (JWT en cookie)
- Retorna el usuario actual: id, email, name, drive_folder_id

Crea backend/services/auth_service.py con:
- Función get_current_user(request) para usar como Dependency
- Función refresh_google_token(user_id) que renueva el access_token si expiró
- Función encrypt_token(data) y decrypt_token(data) con Fernet

Variables de entorno que usa: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SECRET_KEY
```

---

### Prompt 1.3 — CRUD de Cursos (materias)

```
Implementa el CRUD completo de materias para Maestro Claudio.

Crea backend/routers/courses.py con estos endpoints (todos requieren autenticación):

GET /courses
- Lista todas las materias del usuario autenticado
- Filtro opcional por status: ?status=active|paused|completed
- Incluye conteo de modules y materials por curso
- Ordenar por created_at DESC

POST /courses
- Crea nueva materia
- Body: { name, code?, professor?, color?, drive_folder_id? }
- Status inicial: 'active'
- Retorna el curso creado

PATCH /courses/{course_id}
- Actualiza: name, code, professor, color, drive_folder_id, status
- Solo el dueño puede modificar
- Status válidos: active, paused, completed
- No permitir status 'deleted' por aquí (usar DELETE)

DELETE /courses/{course_id}
- Soft delete: status = 'deleted', no borra datos
- Requiere confirmación: body { confirm: true }
- Si confirm no es true, retornar 400 con mensaje explicativo

POST /courses/{course_id}/restore
- Restaurar curso eliminado: status = 'active'

Crea backend/services/course_service.py con la lógica de negocio separada del router.

Usa asyncpg directamente (no ORM) para las queries. Las queries deben ser parametrizadas.
```

---

### Prompt 1.4 — CRUD de Módulos (semanas)

```
Implementa el CRUD de módulos (semanas/clases) para Maestro Claudio.

Crea backend/routers/modules.py:

GET /courses/{course_id}/modules
- Lista semanas de una materia ordenadas por week_number
- Incluye count de materials y signals por módulo
- Incluye status de cada material (para mostrar progreso)

POST /courses/{course_id}/modules
- Crea nueva semana
- Body: { name, week_number?, topic?, class_date? }
- Verifica que el course_id pertenezca al usuario autenticado

PATCH /modules/{module_id}
- Actualiza: name, week_number, topic, class_date, status

DELETE /modules/{module_id}
- Elimina el módulo y todos sus materials y signals en cascada
- Advertir si tiene materials procesados (retornar conteo en la respuesta antes de borrar)

Crea backend/services/module_service.py con la lógica separada.

Importante: todas las queries deben verificar que el módulo pertenece al usuario autenticado (join con courses y users).
```

---

### Prompt 1.5 — CRUD de Evaluaciones

```
Implementa el CRUD de evaluaciones y el endpoint de próximas evaluaciones.

Crea backend/routers/evaluations.py:

GET /evaluations
- Lista todas las evaluaciones del usuario
- Filtros opcionales: ?course_id=X&status=pending
- Ordenar por due_date ASC
- Incluir nombre del curso en la respuesta

GET /evaluations/upcoming
- Evaluaciones en los próximos 30 días
- Incluir días restantes calculados
- Ordenar por due_date ASC

POST /evaluations
- Body: { course_id, title, type, due_date, description?, weight_pct? }
- Validar que due_date sea futura
- type válidos: exam, assignment, project, quiz

PATCH /evaluations/{evaluation_id}
- Actualizar cualquier campo
- Si status cambia a 'graded', requerir grade en el body

DELETE /evaluations/{evaluation_id}
- Hard delete (las evaluaciones no necesitan soft delete)

Crea backend/scheduler.py con APScheduler:
- Job que corre cada día a las 08:00 (Santiago, UTC-3)
- Busca evaluaciones en los próximos 7 días → envía WhatsApp si reminder_sent_7d = false
- Busca evaluaciones mañana → envía WhatsApp si reminder_sent_1d = false
- Actualiza los flags reminder_sent_7d y reminder_sent_1d
- Integrar el scheduler en el lifespan de main.py
```

---

## FASE 2 — Pipeline de Procesamiento

### Prompt 2.1 — Celery + Workers

```
Configura Celery para el procesamiento asíncrono de materiales en Maestro Claudio.

Crea backend/workers/celery_app.py:
- Configurar Celery con Redis como broker y backend
- Configurar serializer JSON
- Task routes: todas las tasks de procesamiento en la cola 'materials'
- Retry automático en caso de falla: max 3 intentos, backoff exponencial

Crea backend/workers/tasks.py con la task principal:

@celery_app.task(bind=True, max_retries=3)
def process_material(self, material_id: str):
    """
    Orquesta el pipeline completo de procesamiento de un material.
    
    Pasos:
    1. Actualizar status a 'downloading'
    2. Según el tipo:
       - video: llamar a download_from_drive() → transcribe_with_deepgram()
       - pdf/pptx: llamar a download_from_drive() → extract_text()
       - whatsapp_export: el texto ya está en la DB, saltar descarga
    3. Actualizar status a 'extracting'
    4. Llamar a extract_signals_with_claude(transcript, material_id)
    5. Llamar a generate_summary_with_claude(transcript)
    6. Llamar a generate_audio_with_elevenlabs(summary, material_id)
    7. Llamar a generate_embeddings(transcript, material_id)
    8. Actualizar status a 'ready', processed_at = now()
    9. Notificar al usuario (WhatsApp + SSE)
    
    En caso de error en cualquier paso:
    - Actualizar status a 'error', guardar error_message
    - Si quedan reintentos: self.retry(exc=exc, countdown=60)
    - Si no quedan reintentos: notificar al usuario del error
    """
    pass  # Implementar el orquestador

La implementación real de cada paso va en los services (siguientes prompts).
El task solo orquesta, no implementa la lógica.
```

---

### Prompt 2.2 — Google Drive Service

```
Implementa el servicio de Google Drive para Maestro Claudio.

Crea backend/services/drive_service.py con:

async def get_file_metadata(user_id: str, file_id: str) -> dict:
    """
    Obtiene metadata de un archivo de Drive.
    Retorna: { id, name, mimeType, size, webViewLink, duration (si es video) }
    Usa el access_token del usuario (con refresh automático si expiró).
    """

async def download_file_temporarily(user_id: str, file_id: str, dest_path: str) -> str:
    """
    Descarga un archivo de Drive a /tmp/{file_id}.{ext}
    Retorna el path local del archivo descargado.
    El caller es responsable de borrar el archivo después de usarlo.
    Manejar archivos grandes con streaming (no cargar todo en memoria).
    """

def detect_file_type(mime_type: str) -> str:
    """
    Convierte mimeType de Google a nuestros tipos internos:
    video/mp4, video/quicktime → 'video'
    application/pdf → 'pdf'
    application/vnd.openxmlformats... (pptx) → 'pptx'
    application/vnd.ms-powerpoint → 'pptx'
    """

async def list_folder_contents(user_id: str, folder_id: str) -> list:
    """
    Lista archivos dentro de una carpeta de Drive.
    Útil para el onboarding cuando el usuario conecta su carpeta del Master.
    """

Importante:
- Usar google-api-python-client
- Siempre verificar que el token no expiró antes de hacer requests
- Si el token expiró, llamar a auth_service.refresh_google_token(user_id)
- Manejar errores 403 (sin permisos) y 404 (archivo no encontrado)
- Log de cada descarga con tamaño y tiempo
```

---

### Prompt 2.3 — Transcripción con Deepgram

```
Implementa el servicio de transcripción con Deepgram para Maestro Claudio.

Crea backend/services/deepgram_service.py con:

async def transcribe_video(file_path: str) -> dict:
    """
    Transcribe un video/audio usando Deepgram Nova-2.
    
    Configuración de Deepgram:
    - model: "nova-2"
    - language: "es" (español)
    - diarize: True (identifica hablantes: PROFESOR vs ALUMNO)
    - punctuate: True
    - paragraphs: True
    - smart_format: True
    - utterances: True (para timestamps por segmento)
    
    Retorna:
    {
      "transcript_raw": "texto completo sin formato",
      "transcript_formatted": texto con hablantes y timestamps:
        "[HABLANTE_0 00:05:23] El algoritmo Kyber..."
        "[HABLANTE_1 00:23:41] ¿Eso reemplaza a RSA?"
      "duration_seconds": 6720,
      "speakers_count": 2,
      "words": [...],  # para timestamps precisos
      "utterances": [...]
    }
    
    Nota: Deepgram no sabe quién es el profesor.
    Usar heurística: el hablante con más tiempo hablado = PROFESOR.
    Reemplazar HABLANTE_0/HABLANTE_1 con PROFESOR/ALUMNO según esa regla.
    """

async def transcribe_fallback_whisper(file_path: str) -> dict:
    """
    Fallback con Whisper local si Deepgram falla.
    Usar modelo 'small' (cabe en 2GB RAM del VPS).
    Sin diarización — solo transcripción plana.
    """

Siempre borrar el archivo temporal después de transcribir:
    os.remove(file_path)
    
Manejar errores de Deepgram con logging detallado.
```

---

### Prompt 2.4 — Extracción de Señales con Claude

```
Implementa el servicio de extracción de señales pedagógicas con Claude.

Crea backend/services/claude_service.py con:

SYSTEM_PROMPT_EXTRACTION = """
Eres un asistente especializado en extraer información pedagógica clave
de transcripciones de clases universitarias o chats académicos.
Prioriza siempre lo que dice el PROFESOR sobre lo que dicen los alumnos.
Responde SOLO con JSON válido, sin texto adicional ni markdown.
"""

USER_PROMPT_EXTRACTION = """
Analiza la siguiente transcripción y extrae toda la información pedagógica.
Responde con este JSON exacto:
{
  "resumen_ejecutivo": "3-5 oraciones del tema central",
  "conceptos_clave": ["concepto1", "concepto2"],
  "exam_tips": [
    {
      "contenido": "qué dijo (parafrasear, no copiar literal)",
      "contexto": "por qué es importante para el examen",
      "speaker": "professor|student|unknown",
      "timestamp_aprox": "MM:SS o null",
      "importancia": "high|medium"
    }
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
      "pregunta": "lo que preguntó el alumno",
      "respuesta_profesor": "cómo lo aclaró",
      "concepto_aclarado": "qué queda más claro",
      "importante": true
    }
  ],
  "pendientes": [
    {
      "descripcion": "qué hay que hacer",
      "fecha_mencionada": "YYYY-MM-DD o null",
      "tipo": "tarea|lectura|evaluacion|buscar_recurso"
    }
  ]
}

TRANSCRIPCIÓN:
{transcript}
"""

async def extract_signals(transcript: str, material_id: str, course_id: str, module_id: str) -> dict:
    """
    Llama a Claude (modelo desde settings.CLAUDE_MODEL, default 'claude-sonnet-4-6')
    con el prompt de extracción.

    IMPORTANTE — prompt caching:
    El SYSTEM_PROMPT_EXTRACTION es idéntico en cada llamada, así que debe enviarse
    con cache_control para reducir ~75% del costo de input tokens. Ejemplo con el SDK:

        client = anthropic.Anthropic()
        msg = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=4096,
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT_EXTRACTION,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": USER_PROMPT_EXTRACTION.format(transcript=transcript)}],
        )

    Parsea el JSON de respuesta.
    Guarda cada señal en la tabla signals de la DB.
    Retorna el dict con todas las señales encontradas.

    Manejar transcripciones largas (>100k tokens):
    Si el transcript es muy largo, procesarlo en chunks de 50k tokens
    y consolidar los resultados (el cache hit del system prompt se mantiene
    entre los chunks porque es la misma session ephemeral).

    Para reprocesamientos masivos (ej: re-extraer todo un semestre),
    usar settings.CLAUDE_MODEL_BULK ('claude-haiku-4-5') si está definido.
    """

async def generate_summary(transcript: str, course_name: str, module_name: str) -> str:
    """
    Genera un resumen de 500-800 palabras de la clase.
    Optimizado para ser narrado en audio (frases cortas, sin bullets).
    Incluir los exam tips más importantes al final.
    """

async def chat_rag(query: str, context_chunks: list, mode: str = "explain") -> str:
    """
    Genera respuesta para el chat RAG.
    Modos:
    - explain: respuesta explicativa con contexto
    - quiz: 5 preguntas de opción múltiple basadas en los chunks
    - flashcards: 10 pares pregunta-respuesta
    - exam_prep: consolidado de exam_tips + conceptos clave
    """
```

---

### Prompt 2.5 — Embeddings y almacenamiento en pgvector

```
Implementa el servicio de embeddings y búsqueda vectorial para Maestro Claudio.

Crea backend/services/embeddings_service.py con:

CHUNK_SIZE = 500       # tokens por chunk
CHUNK_OVERLAP = 50     # overlap entre chunks

def split_into_chunks(text: str) -> list[str]:
    """
    Divide el texto en chunks de ~500 tokens con overlap de 50.
    Respetar límites de párrafos — no cortar a la mitad de una oración.
    Retorna lista de strings.
    """

async def get_embedding(text: str) -> list[float]:
    """
    Genera embedding con OpenAI text-embedding-3-small.
    Retorna vector de 1536 dimensiones.
    Cachear embeddings idénticos para evitar llamadas duplicadas.
    """

async def store_chunks(
    text: str,
    material_id: str,
    module_id: str,
    course_id: str,
    chunk_type: str = "transcript"
) -> int:
    """
    1. Divide el texto en chunks
    2. Genera embeddings para cada chunk (en batches de 20 para no sobrecargar)
    3. Guarda en tabla chunks con INSERT ... ON CONFLICT DO NOTHING
    4. Retorna cantidad de chunks almacenados
    """

async def search_similar(
    query: str,
    course_id: str = None,
    module_id: str = None,
    chunk_types: list = None,
    top_k: int = 8
) -> list[dict]:
    """
    Búsqueda vectorial en pgvector.
    Filtros opcionales por course_id y module_id.
    Usa <=> (cosine distance).
    Retorna chunks con similarity score, module_name, course_name.
    
    SQL base:
    SELECT content, chunk_type, module_id, course_id,
           1 - (embedding <=> $1::vector) AS similarity
    FROM chunks
    WHERE [filtros dinámicos]
    ORDER BY similarity DESC
    LIMIT $N
    """

async def delete_chunks_for_material(material_id: str):
    """
    Elimina todos los chunks de un material (para reprocesar).
    """
```

---

### Prompt 2.6 — Router de Materials + SSE

```
Implementa los endpoints de materiales y el stream de estado para Maestro Claudio.

Crea backend/routers/materials.py:

POST /modules/{module_id}/materials/drive
- Body: { drive_file_id: str } o { drive_url: str }
- Si se da drive_url, extraer el file_id de la URL
- Obtener metadata del archivo via drive_service
- Crear registro en materials con status='pending'
- Disparar Celery task: process_material.delay(material_id)
- Retornar inmediatamente: { material_id, status: 'pending', message: 'Procesamiento iniciado' }

POST /modules/{module_id}/materials/upload
- Para WhatsApp export (.txt) subido directamente
- Leer el contenido del archivo subido
- Crear registro en materials con type='whatsapp_export'
- El transcript se llena directamente con el contenido del .txt
- Disparar Celery task
- Retornar material_id

GET /materials/{material_id}/status
- Server-Sent Events (SSE) para status en tiempo real
- Hacer polling cada 3 segundos a la DB
- Enviar el status actual y el porcentaje estimado:
  pending: 0%, downloading: 15%, transcribing: 40%, 
  extracting: 70%, ready: 100%, error: -1
- Cerrar la conexión cuando status = 'ready' o 'error'
- Usar StreamingResponse de FastAPI con media_type="text/event-stream"

GET /materials/{material_id}/transcript
- Retorna el transcript completo en texto plano

GET /materials/{material_id}/summary  
- Retorna el summary_text

GET /materials/{material_id}/audio
- Retorna el archivo de audio (streaming del mp3)
- Usar FileResponse de FastAPI

DELETE /materials/{material_id}
- Elimina el material, sus signals y sus chunks
- Si hay audio guardado, borrar el archivo también
```

---

## FASE 3 — RAG + Resúmenes

### Prompt 3.1 — ElevenLabs Audio

```
Implementa el servicio de text-to-speech con ElevenLabs para Maestro Claudio.

Crea backend/services/elevenlabs_service.py con:

async def generate_audio_summary(
    text: str,
    material_id: str
) -> str:
    """
    Genera audio del resumen de una clase con ElevenLabs.
    
    Configuración:
    - Voice ID: desde env ELEVENLABS_VOICE_ID (voz Mateo en español)
    - Model: eleven_multilingual_v2
    - Voice settings: stability=0.5, similarity_boost=0.75
    
    Proceso:
    1. Verificar que el texto no supere 5000 caracteres
       Si supera, truncar inteligentemente en el último punto antes del límite
    2. Llamar a ElevenLabs API
    3. Guardar el audio en /app/audio/{material_id}.mp3
    4. Actualizar materials.audio_path en la DB
    5. Retornar el path relativo del archivo
    
    Manejar errores de rate limit (429) con retry después de 60 segundos.
    """

def get_audio_duration(file_path: str) -> int:
    """
    Retorna la duración en segundos del archivo mp3.
    Usar mutagen o pymediainfo.
    """
```

---

### Prompt 3.2 — Chat RAG endpoint

```
Implementa el endpoint de chat RAG para Maestro Claudio.

Crea backend/routers/chat.py:

POST /chat
Request body:
{
  "query": "string",
  "conversation_id": "uuid | null",  // null = crea conversación nueva
  "course_id": "uuid | null",        // null = buscar en todos los cursos
  "module_id": "uuid | null",        // null = buscar en toda la materia
  "mode": "explain|quiz|flashcards|exam_prep"  // default: explain
}

Response:
{
  "conversation_id": "uuid",         // útil cuando vino null en el request
  "answer": "string",
  "sources": [
    {
      "module_name": "Semana 3 — Criptografía",
      "course_name": "Hacking Ético",
      "similarity": 0.87,
      "excerpt": "primeros 100 chars del chunk..."
    }
  ],
  "mode": "explain",
  "quiz_questions": null  // solo si mode=quiz
}

Implementación:
1. Si conversation_id es null:
   - Crear nueva conversación en la tabla conversations (channel='web' o 'mobile' según header).
   - El title se genera asíncrono después del primer turn (Claude resume el query en 4-6 palabras).
2. Insertar el mensaje del usuario en messages (role='user').
3. Cargar últimos 6 mensajes de la conversación (en orden cronológico) → contexto multi-turn.
4. Buscar chunks similares via embeddings_service.search_similar().
   - Si mode=exam_prep: traer también todos los exam_tips del curso.
5. Llamar a claude_service.chat_rag(query, context_chunks, history=ultimos_6_mensajes, mode).
6. Insertar el mensaje de respuesta en messages (role='assistant', sources=chunks_usados).
7. Actualizar conversations.updated_at = NOW().
8. Retornar { conversation_id, answer, sources, mode, quiz_questions? }.

Endpoints adicionales:
GET    /conversations              → lista conversaciones del usuario, ordenadas por updated_at DESC
GET    /conversations/{id}         → mensajes de una conversación, ordenados por created_at ASC
DELETE /conversations/{id}         → borrar una conversación y sus mensajes (cascade)

Para WhatsApp:
- El handler busca la última conversación abierta del usuario (channel='whatsapp', updated_at > NOW() - 2h).
- Si existe, continúa esa conversación. Si no, crea una nueva.

Para mode=quiz, el formato de quiz_questions:
[
  {
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": "A",
    "explanation": "..."
  }
]

Crea también backend/routers/signals.py:

GET /courses/{course_id}/exam-tips
- Lista todos los exam_tips del curso ordenados por importance DESC, created_at DESC
- Filtro opcional: ?module_id=X&importance=high

GET /courses/{course_id}/references
- Lista todas las referencias externas

GET /courses/{course_id}/qa
- Lista todas las Q&A aclaraciones

GET /courses/{course_id}/pending-tasks
- Lista pendientes no completados
- Filtro: ?type=tarea|lectura|evaluacion

GET /modules/{module_id}/signals
- Todas las señales de un módulo específico agrupadas por tipo
```

---

## FASE 4 — Web App

### Prompt 4.1 — Design System CSS

```
Crea el design system CSS completo de Maestro Claudio (V3 "Abstract Intelligence").

Crea web/src/styles/tokens.css:
:root {
  --bg: #111111; --bg2: #181818; --bg3: #202020; --bg4: #282828;
  --orange: #FF4D1C; --orange2: #FF7A4D;
  --tip: #F59E0B; --ref: #FF4D1C; --qa: #22C55E; --pending: #EF4444;
  --c-hacking: #FF4D1C; --c-normativa: #8B5CF6;
  --c-monitoring: #06B6D4; --c-gobierno: #22C55E;
  --text: #EFEFEF; --muted: #777777; --muted2: #444444;
  --border: #252525; --border2: #303030;
}

Crea web/src/styles/typography.css:
- Import de Google Fonts: Bebas Neue, DM Sans (300/400/500/600), Space Mono (400/700)
- Clases utilitarias:
  .font-display { font-family: 'Bebas Neue', sans-serif; }
  .font-body    { font-family: 'DM Sans', sans-serif; }
  .font-mono    { font-family: 'Space Mono', monospace; }

Crea web/src/styles/components.css con estilos para:
- .btn, .btn-primary (naranja), .btn-ghost (transparente con borde)
- .card (bg2, borde, border-radius 16px)
- .badge y variantes: .badge-tip, .badge-ref, .badge-qa, .badge-pending
- .tag (pequeño, redondeado, semántico por tipo)
- .nav-item y .nav-item.active
- .signal-card con border-left semántico por tipo
- .course-chip con punto de color
- .pill y .pill.processing (con animación pulse)
- Ambient glow en body::before (radial-gradient naranja sutil)
- Custom scrollbar (4px, color border2)

Crear web/src/components/AbstractArt.jsx:
Componente React que recibe { courseCode, width, height } y retorna
un SVG único por materia usando el courseCode para determinar el patrón:
- HE-01 (Hacking): gradiente naranja + círculos difusos + líneas
- CNR-02 (Normativa): gradiente púrpura + barras de documento
- MDM-03 (Monitorización): gradiente cyan + círculos concéntricos
- GS-04 (Gobierno): gradiente verde + grid/malla
```

---

### Prompt 4.2 — Login y Auth en React

```
Implementa el flujo de autenticación en el frontend de Maestro Claudio.

Crea web/src/hooks/useAuth.js:
- Hook que verifica si hay sesión (GET /auth/me)
- Estado: { user, loading, error }
- Función login() que redirige a /auth/google
- Función logout() que llama a POST /auth/logout y limpia el estado

Crea web/src/pages/Login.jsx:
- Pantalla de login con diseño V3 (fondo oscuro)
- Logo "Maestro Claudio" con Bebas Neue
- Subtítulo: "Tu agente de estudio personal"
- Botón "Continuar con Google" (blanco, con ícono de Google SVG)
- Descripción breve de qué hace la app
- Ambient glow de fondo
- Si el usuario ya está autenticado, redirigir a /dashboard

Crea web/src/App.jsx con React Router:
- Ruta /login → Login.jsx
- Ruta /dashboard → Dashboard.jsx (protegida)
- Ruta /course/:id → CourseDetail.jsx (protegida)
- Ruta /class/:id → ClassDetail.jsx (protegida)
- Ruta /settings → Settings.jsx (protegida)
- Componente ProtectedRoute que redirige a /login si no hay sesión
- Loading state mientras verifica la sesión

Crea web/src/api/client.js:
- Instancia de fetch con base URL desde import.meta.env.VITE_API_URL
- Wrapper que incluye credentials: 'include' (para las cookies de sesión)
- Manejo de errores 401 (redirigir a login)
- Funciones: get(path), post(path, body), patch(path, body), del(path)
```

---

### Prompt 4.3 — Dashboard principal

```
Implementa el Dashboard de Maestro Claudio con diseño V3.

Crea web/src/pages/Dashboard.jsx con:

LAYOUT:
- Sidebar fijo a la izquierda (230px)
- Topbar con nombre de la materia activa
- Grid 2 columnas: contenido principal + panel derecho

SIDEBAR:
- Logo "Maestro Claudio" (Bebas Neue, ícono cuadrado naranja)
- Avatar del usuario con iniciales (conic-gradient naranja-ámbar)
- Navegación: Dashboard, Exam Tips, Calendario, Chat Global, Referencias
- Lista de materias activas con AbstractArt mini-thumb, nombre y semana actual
- Botón "+ Agregar materia" con borde dashed
- Indicador de status de procesamiento si hay algún material procesándose

STRIP DE STATS (todo el ancho):
- Stat hero card (naranja, mesh gradient): "Clases procesadas" con número grande
- 3 stat mini cards: Exam Tips total, Referencias total, Q&A total
- Cada stat mini card tiene el número decorativo grande de fondo (opacity 0.15)

WEEKLY CHECKLIST:
- Título "Esta Semana" con línea decorativa
- Grid 3 columnas con las clases detectadas en el calendario
- Cada week card tiene: art header SVG abstracto, día/hora, nombre de la clase, badge de status
- Status: "Sin grabación" (naranja) / "Procesando" (ámbar con animación) / "Lista" (verde)

LISTA DE CLASES PROCESADAS:
- Cada class card tiene: art strip lateral, número grande, tema, metadata (fecha/duración/profesor), tags de señales

PANEL DERECHO:
- Eval banner (mesh gradient oscuro con naranja) con countdown en días (Bebas Neue 64px)
- Progress ring SVG mostrando clases revisadas vs total
- Botón "Estudiar para este parcial"

Usar datos reales de la API:
- GET /courses para el sidebar
- GET /calendar/weekly-status para el checklist semanal
- GET /evaluations/upcoming para el eval banner
```

---

### Prompt 4.4 — Course Detail y Class Detail

```
Implementa las páginas de detalle de materia y de clase.

Crea web/src/pages/CourseDetail.jsx:
- Misma estructura de sidebar que Dashboard
- Topbar con nombre de la materia y botones: "+ Semana" y "↑ Subir Material"
- Tabs: Clases | Chat | Evaluaciones
- En tab Clases:
  - Weekly checklist de la materia
  - Lista de clases procesadas de esa materia
  - Click en una clase → navegar a /class/:material_id
- En tab Chat:
  - ChatInterface filtrado a esa materia
- En tab Evaluaciones:
  - Lista de evaluaciones de la materia con CRUD completo

Crea web/src/pages/ClassDetail.jsx:
- Breadcrumb: Materia > Semana > Clase
- Header abstracto SVG (70px altura) con texto decorativo del tema de la clase
- Información: materia, semana, fecha, profesor, duración
- Audio player con waveform:
  - Botón play/pause circular naranja
  - Waveform de barras (generado dinámicamente)
  - Tiempo actual / duración total
- Tabs de señales: Tips (N) | Refs (N) | Q&A (N) | Pendientes (N)
- Lista de signal cards con border-left semántico por tipo
- Chat input al fondo para preguntar sobre esa clase específica

Crea web/src/components/MaterialUploader.jsx:
- Drag & drop zone
- Input de URL de Drive o file_id
- Upload de archivo .txt (WhatsApp export)
- Barra de progreso conectada via SSE al endpoint /materials/{id}/status
- Estados visuales: esperando → descargando → transcribiendo → extrayendo → listo
```

---

### Prompt 4.5 — Gestión de materias desde la app

```
Implementa la gestión dinámica de materias en Maestro Claudio.

Crea web/src/components/CourseModal.jsx:
Modal para crear/editar materias con:
- Campo: Nombre de la materia (requerido)
- Campo: Código (opcional, ej: HE-01)
- Campo: Nombre del profesor
- Selector de color: 8 opciones predefinidas con preview del dot
- Botón "Conectar carpeta de Drive": abre Google Drive file picker
  (usar https://developers.google.com/drive/picker)
- En modo edición: mostrar opción de cambiar estado (activa/pausada/completada)
- Botón cancelar y botón guardar

Crea web/src/components/CourseMenu.jsx:
Menú contextual (3 puntos) en cada materia del sidebar:
- Editar materia → abre CourseModal
- Pausar materia → confirm dialog → PATCH status: paused
- Marcar como completada → confirm dialog → PATCH status: completed
- Restaurar (si está pausada/completada) → PATCH status: active
- Eliminar materia → confirm dialog con texto de advertencia
  "Esta acción eliminará todo el contenido de la materia (X clases, Y señales)."
  → DELETE /courses/{id} con body { confirm: true }

Actualizar el sidebar del Dashboard para incluir el CourseMenu en cada materia.

Crear web/src/pages/Settings.jsx con:
- Sección: Cuenta (nombre, email, foto)
- Sección: Google Drive (carpeta raíz del Master, botón para cambiar)
- Sección: Notificaciones (WhatsApp número, activar/desactivar tipos)
- Sección: Preferencias (voz de audio, tema —solo dark por ahora)
- Sección: MCP Token (mostrar/regenerar el token para conectar Claude.ai)
```

---

## FASE 5 — Calendar + WhatsApp

### Prompt 5.1 — Google Calendar Integration

```
Implementa la integración con Google Calendar para Maestro Claudio.

Crea backend/services/calendar_service.py con:

async def sync_user_calendar(user_id: str) -> dict:
    """
    Sincroniza el Google Calendar del usuario con Maestro Claudio.
    
    1. Obtener eventos de las últimas 2 semanas y las próximas 4 semanas
    2. Filtrar eventos que coincidan con nombres de materias del usuario
       (búsqueda case-insensitive del nombre de la materia en el título del evento)
    3. Para cada evento encontrado:
       - Buscar si ya existe en calendar_events (por google_event_id)
       - Si no existe: crear registro en calendar_events
       - Si existe: actualizar si cambió algo
    4. Para cada calendar_event: verificar si tiene material procesado asociado
       (buscar materials en el mismo module que coincida con la fecha del evento)
    5. Actualizar material_status: missing|partial|complete
    6. Retornar resumen: { synced: N, new: N, updated: N }
    """

async def get_weekly_status(user_id: str) -> list:
    """
    Retorna el estado de la semana actual para todos los cursos.
    [{
      course_id, course_name, course_color,
      events: [{
        event_date, start_time, title,
        material_status: missing|partial|complete,
        material_id: null|uuid
      }]
    }]
    """

En backend/scheduler.py agregar:
- Job que corre cada lunes a las 08:00 hora Chile (11:00 UTC)
- Llama a sync_user_calendar() para cada usuario activo
- Si hay clases sin material de la semana anterior: enviar WhatsApp

Crea backend/routers/calendar.py:
POST /calendar/sync → fuerza sync manual
GET /calendar/weekly-status → retorna el weekly status
```

---

### Prompt 5.2 — WhatsApp Webhook y Notificaciones

```
Implementa la integración con WhatsApp Meta Cloud API para Maestro Claudio.

Crea backend/services/whatsapp_service.py con:

async def send_message(to: str, text: str):
    """
    Envía un mensaje de texto a través de Meta Cloud API.
    Usa WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID y META_API_VERSION del env.
    URL: f"https://graph.facebook.com/{settings.META_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    Reintentar hasta 3 veces si hay error de red.
    """

async def send_notification(user_id: str, event_type: str, data: dict):
    """
    Notificaciones predefinidas por tipo:
    
    'material_ready':
    "✅ *Clase lista* — {course_name} Semana {week}\n"
    "{n} exam tips detectados · {n} referencias · {n} Q&A\n"
    "Abrir en la app: {FRONTEND_URL}/class/{material_id}"
    
    'material_error':
    "⚠️ Error procesando {filename}.\n"
    "Revisar en: {FRONTEND_URL}/course/{course_id}"
    
    'weekly_checklist':
    "📅 *Semana {n} — Maestro Claudio*\n\n"
    "Clases sin procesar:\n"
    "{lista de clases con fecha y materia}\n\n"
    "¿Tienes las grabaciones disponibles?"
    
    'eval_reminder_7d':
    "⏰ *{title}* en 7 días\n"
    "{course_name} · {weight_pct}% de la nota\n"
    "Exam tips acumulados: {n}"
    
    'eval_reminder_1d':
    "🔴 *{title}* es MAÑANA\n"
    "{course_name}\n"
    "Ver resumen de exam tips: {FRONTEND_URL}/course/{course_id}?view=exam-tips"
    
    'deploy_success':
    "✅ Maestro Claudio actualizado correctamente"
    
    'deploy_error':
    "❌ Error en el deploy. Revisar GitHub Actions."
    """

async def handle_incoming_message(body: dict):
    """
    Procesa mensajes entrantes de WhatsApp.
    IMPORTANTE: WhatsApp es solo lectura y consultas.
    
    Detectar intención del mensaje:
    - "exam tips" / "tips" → responder con los últimas 5 exam tips
    - "pendientes" / "qué tengo" → responder con evaluaciones próximas
    - cualquier otra cosa → RAG básico (GET /chat con la query)
    
    NUNCA ejecutar acciones de gestión (agregar materias, borrar, etc.)
    Si el usuario pide gestionar algo: responder con link a la app.
    """

Crea backend/routers/whatsapp.py:
GET /webhook/whatsapp → verificación del webhook (hub.challenge)
POST /webhook/whatsapp → procesar mensajes entrantes
```

---

## FASE 6 — Mobile App

### Prompt 6.1 — Setup Expo y navegación

```
Configura la app mobile de Maestro Claudio con Expo.

En el directorio mobile/, inicializar con:
- Expo SDK 51
- Expo Router (file-based routing)
- TypeScript

Instalar dependencias:
expo-router, expo-notifications, expo-auth-session, expo-av,
expo-document-picker, @react-native-async-storage/async-storage,
@expo-google-fonts/bebas-neue, @expo-google-fonts/dm-sans, @expo-google-fonts/space-mono

Crea mobile/app.json con:
- name: "Maestro Claudio"
- slug: "maestro-claudio"
- splash screen: fondo #111111
- ios.bundleIdentifier: com.lenintoledo.maestroclaudio
- android.package: com.lenintoledo.maestroclaudio
- plugins: expo-notifications, expo-router

Crea mobile/constants/Colors.ts con todos los tokens del design system V3.

Crea mobile/constants/Typography.ts con la carga de fuentes:
import { useFonts, BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { DMSans_400Regular, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';

Crea mobile/app/_layout.tsx:
- Cargar fuentes con useFonts
- Stack navigator principal
- Verificar sesión (AsyncStorage token) → redirigir a login si no hay sesión

Crea mobile/app/(tabs)/_layout.tsx:
- Tab bar inferior con: Dashboard, Cursos, Chat, Calendario
- Íconos simples (usar @expo/vector-icons)
- Tab bar con fondo var(--bg2), tinte naranja
```

---

### Prompt 6.2 — Screens principales mobile

```
Implementa las screens principales de la app mobile de Maestro Claudio.

Crea mobile/app/(tabs)/index.tsx (Dashboard):
- Header: "Maestro Claudio" en Bebas Neue + avatar del usuario
- ScrollView vertical
- Stats row: Clases procesadas (naranja), Exam Tips, Refs, Q&A
- Weekly checklist: lista vertical de clases de la semana con status
- Próxima evaluación: card con countdown en días (Bebas Neue grande)
- Últimas clases procesadas: lista con art abstracto lateral

Crea mobile/app/(tabs)/courses.tsx:
- Lista de materias activas con AbstractArt nativo (usando LinearGradient de expo)
- Cada materia muestra: nombre, semana actual, conteo de exam tips
- Long press → menú contextual (pausar, editar, completar)
- FAB (+) para agregar nueva materia → modal de creación

Crea mobile/app/(tabs)/chat.tsx:
- Selector de materia (dropdown) o "Todos los cursos"
- Chat interface con bubbles
- Input con selector de modo: explicar / quiz / flashcards
- Respuestas del agente en bubbles con fuentes colapsables
- Keyboard avoiding view

Crea mobile/app/course/[id].tsx:
- Detalle de una materia
- Lista de semanas con status visual
- Botón "Subir grabación" → llama a expo-document-picker o pega URL de Drive
- Lista de señales por semana (exam tips, refs, Q&A)
- Player de audio del resumen de cada clase

Crea mobile/app/login.tsx:
- Logo + tagline
- Botón "Continuar con Google" usando expo-auth-session
- Fondo oscuro con ambient glow
```

---

### Prompt 6.3 — Notificaciones Push mobile

```
Implementa las notificaciones push nativas para Maestro Claudio en Expo.

Crea mobile/services/notifications.ts:

async function registerForPushNotifications(): Promise<string | null>
"""
1. Verificar permisos con Notifications.requestPermissionsAsync()
2. Si concedido: obtener el Expo Push Token
3. Enviar el token al backend: POST /users/push-token { token }
4. Guardar el token en AsyncStorage
5. Retornar el token o null si no se concedió permiso
"""

function setupNotificationListeners()
"""
Configurar listeners:
- Notificación recibida mientras la app está abierta: mostrar alert nativo
- Notificación tocada: navegar a la pantalla relevante según data.type:
  'material_ready' → /course/{course_id}
  'eval_reminder' → /(tabs)/calendario
  'weekly_checklist' → /(tabs)/index
"""

El campo users.push_token ya existe en el schema inicial (Prompt 0.2).

Agregar endpoint:
POST /users/push-token
- Body: { token: string }
- Guarda el token en users.push_token

Actualizar whatsapp_service.py → agregar push_notification_service.py:
- Enviar notificaciones push via Expo Push API (https://exp.host/--/api/v2/push/send)
- Para todos los eventos que ahora van por WhatsApp, enviar también push notification
```

---

## FASE 7 — MCP Server

### Prompt 7.1 — FastMCP Server completo

```
Implementa el MCP Server completo de Maestro Claudio.

Crea mcp/server.py con FastMCP:

from fastmcp import FastMCP
mcp = FastMCP(
    name="maestro-claudio",
    description="Acceso al conocimiento académico de la Maestría en Ciberseguridad de Lenin Toledo"
)

Implementar estos 8 tools:

@mcp.tool()
async def study_search(query: str, course_id: str = None, subject_name: str = None, week: int = None) -> dict:
    """Busca en el material académico indexado. Usar para preguntas sobre conceptos, teorías o temas."""

@mcp.tool()
async def get_exam_tips(course_id: str = None, subject_name: str = None) -> dict:
    """Obtiene exam tips detectados en grabaciones y WhatsApp. Usar antes de estudiar para un examen."""

@mcp.tool()
async def get_pending_tasks() -> dict:
    """Lista evaluaciones próximas y tareas pendientes. Usar para planificación."""

@mcp.tool()
async def get_class_summary(course_id: str, week: int) -> dict:
    """Resumen de una clase específica por curso y número de semana."""

@mcp.tool()
async def get_references(subject_name: str = None, topic: str = None) -> dict:
    """Referencias bibliográficas mencionadas por el profesor en clases."""

@mcp.tool()
async def get_qa_pairs(subject_name: str = None, topic: str = None) -> dict:
    """Preguntas de compañeros + aclaraciones del profesor."""

@mcp.tool()
async def list_courses() -> dict:
    """Lista materias activas con estado de procesamiento y stats."""

@mcp.tool()
async def get_weekly_status() -> dict:
    """Estado de la semana actual: clases detectadas en Calendar vs material subido."""

Cada tool debe:
- Conectarse directamente a la DB de Maestro Claudio (misma DATABASE_URL)
- Autenticarse con Bearer token (MCP_AUTH_TOKEN del env)
- Retornar datos estructurados listos para consumir por otros agentes

Exponer vía HTTP:
mcp.run(transport="streamable-http", port=8002, host="0.0.0.0")

En mcp/requirements.txt:
fastmcp, asyncpg, openai (para embeddings en study_search)
```

---

## FASE FINAL — Deploy y Verificación

### Prompt F.1 — Setup VPS completo

```
Genera el script completo de setup del VPS Hetzner para Maestro Claudio.

Crea infrastructure/scripts/setup_vps.sh:

#!/bin/bash
# Script de setup inicial del VPS Hetzner para Maestro Claudio
# Ejecutar como root: bash setup_vps.sh

set -e

echo "=== Setup Maestro Claudio VPS ==="

# 1. Actualizar sistema
apt-get update && apt-get upgrade -y

# 2. Instalar Docker si no está instalado
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker $USER
fi

# 3. Instalar Docker Compose plugin
apt-get install -y docker-compose-plugin

# 4. Clonar el repo
cd /opt
if [ ! -d "maestro-claudio" ]; then
    git clone https://github.com/lenintoledo07/maestro-claudio
fi
cd maestro-claudio

# 5. Crear base de datos en el PostgreSQL existente
# (asume que PostgreSQL ya está instalado y corriendo)
echo "Creando base de datos maestro_claudio..."
sudo -u postgres psql -c "CREATE DATABASE maestro_claudio;" 2>/dev/null || echo "DB ya existe"
sudo -u postgres psql maestro_claudio -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 6. Crear archivo .env.production si no existe
if [ ! -f ".env.production" ]; then
    cp .env.example .env.production
    echo "⚠️  IMPORTANTE: Edita /opt/maestro-claudio/.env.production con tus API keys"
    echo "Luego ejecuta: docker compose -f infrastructure/docker-compose.prod.yml up -d"
    exit 0
fi

# 7. Configurar nginx
cat > /etc/nginx/sites-available/maestro-claudio << 'EOF'
server {
    listen 80;
    server_name study.denario.cloud;

    # API Backend
    location /api {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;  # importante para SSE
    }

    # MCP Server
    location /mcp {
        proxy_pass http://localhost:8002;
        proxy_set_header Host $host;
    }

    # WhatsApp Webhook
    location /webhook {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
    }

    # Frontend (servido por Vercel, redirigir si acceden por IP)
    location / {
        return 301 https://study.denario.cloud$request_uri;
    }
}
EOF

ln -sf /etc/nginx/sites-available/maestro-claudio /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 8. SSL con Certbot
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d study.denario.cloud --non-interactive --agree-tos -m tu@email.com

# 9. Primer arranque
docker compose -f infrastructure/docker-compose.prod.yml up -d

# 10. Correr migraciones
docker compose -f infrastructure/docker-compose.prod.yml exec maestro-api \
    python -c "from database import init_db; import asyncio; asyncio.run(init_db())"

echo "=== Setup completado ==="
echo "API: https://study.denario.cloud/api/health"
echo "MCP: https://study.denario.cloud/mcp"
```

---

### Prompt F.2 — Verificación end-to-end

```
Crea un script de verificación completo para Maestro Claudio.

Crea infrastructure/scripts/verify.sh:

Script que verifica que todos los componentes están funcionando:

1. Backend API:
   curl -s https://study.denario.cloud/api/health
   Esperado: {"status": "ok", "service": "maestro-claudio"}

2. Base de datos:
   curl -s https://study.denario.cloud/api/health/db
   Verificar que pgvector está instalado y la DB tiene las tablas

3. Celery workers:
   docker exec maestro-worker celery -A workers.celery_app inspect active

4. Redis:
   docker exec redis redis-cli ping
   Esperado: PONG

5. MCP Server:
   curl -s https://study.denario.cloud/mcp
   Verificar que lista los tools disponibles

6. Web App:
   curl -s -o /dev/null -w "%{http_code}" https://study.denario.cloud
   Esperado: 200

También crear backend/routers/health.py con:
GET /health → {"status": "ok", "service": "maestro-claudio", "version": "1.0.0"}
GET /health/db → verificar conexión a DB y que pgvector está activo
GET /health/workers → verificar que Celery workers están activos
GET /health/all → resumen de todos los componentes
```

---

## Referencia rápida de comandos

```bash
# ── DESARROLLO LOCAL ──────────────────────────────
# Levantar todo
docker-compose -f infrastructure/docker-compose.dev.yml up

# Solo el backend (si ya tienes Redis y DB corriendo)
cd backend && uvicorn main:app --reload --port 8001

# Web app
cd web && npm run dev                    # http://localhost:5173

# Mobile
cd mobile && npx expo start             # QR para Expo Go

# ── GIT WORKFLOW ──────────────────────────────────
# Guardar en develop (no afecta prod)
git add . && git commit -m "feat: X" && git push origin develop

# Publicar a producción
git checkout main && git merge develop && git push origin main
git checkout develop  # volver a develop

# ── PRODUCCIÓN (VPS) ──────────────────────────────
# Ver logs del backend
ssh root@TU_IP "docker logs maestro-api --tail 50 -f"

# Ver logs del worker
ssh root@TU_IP "docker logs maestro-worker --tail 50 -f"

# Reiniciar un servicio
ssh root@TU_IP "cd /opt/maestro-claudio && docker-compose -f infrastructure/docker-compose.prod.yml restart maestro-api"

# ── MOBILE BUILD ──────────────────────────────────
# Build para TestFlight (iOS personal)
cd mobile && eas build --platform ios --profile preview

# Build APK para Android
cd mobile && eas build --platform android --profile preview
```

---

*Maestro Claudio — Prompts SDD v1.0*
*Usar con Claude Code (`claude` en terminal) en el directorio del proyecto.*
*Mayo 2026 — Lenin Toledo*

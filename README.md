# Maestro Claudio

Agente de estudio personal para Maestría en Ciberseguridad.

## Stack

- **Backend**: Python 3.11 · FastAPI · Celery · Redis
- **Base de datos**: PostgreSQL + pgvector
- **Web**: React 18 · Vite (CSS custom, sin frameworks)
- **Mobile**: React Native · Expo SDK 51
- **MCP**: FastMCP server para herramientas del agente
- **IA**: Claude (Anthropic) · Deepgram (STT) · ElevenLabs (TTS) · OpenAI (embeddings)
- **Integraciones**: Google Calendar / Drive / Gmail · WhatsApp Cloud API

## Setup local

1. Copiar variables de entorno y completarlas:

   ```bash
   cp .env.example .env.local
   ```

   `docker-compose.dev.yml` lee `.env.local` (no `.env`).
   En producción, el VPS usa `.env.production`.

2. Levantar servicios de desarrollo (Postgres, Redis, backend, worker, MCP):

   ```bash
   cd infrastructure
   docker compose -f docker-compose.dev.yml up --build
   ```

3. En otra terminal, correr la web:

   ```bash
   cd web
   npm install
   npm run dev
   ```

4. En otra terminal, correr la app móvil:

   ```bash
   cd mobile
   npm install
   npm start
   ```

## Estructura

| Carpeta            | Propósito                                              |
| ------------------ | ------------------------------------------------------ |
| `backend/`         | API FastAPI + Celery workers                           |
| `backend/routers/` | Endpoints HTTP                                         |
| `backend/services/`| Lógica de negocio e integraciones (Claude, Deepgram…)  |
| `backend/workers/` | Tareas Celery (transcripciones, embeddings, scheduler) |
| `backend/models/`  | Modelos SQLAlchemy / Pydantic                          |
| `mcp/`             | Servidor MCP (Model Context Protocol)                  |
| `web/`             | Aplicación React (Vite)                                |
| `mobile/`          | App React Native (Expo)                                |
| `infrastructure/`  | Docker compose y migraciones SQL                       |

## Migraciones

Las migraciones SQL viven en `infrastructure/migrations/` y se aplican
automáticamente al volumen de Postgres en el primer arranque del contenedor.

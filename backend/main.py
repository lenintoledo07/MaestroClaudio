"""Maestro Claudio — FastAPI entrypoint."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import close_pool, init_pool
from routers import (
    auth, calendar, chat, courses, evaluations, health, materials,
    modules, signals, whatsapp,
)
from scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("maestro-claudio")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Arrancando Maestro Claudio API (env=%s)", settings.ENVIRONMENT)
    await init_pool()
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()
        await close_pool()
        logger.info("Maestro Claudio API detenida")


app = FastAPI(
    title="Maestro Claudio",
    description="Agente de estudio personal para Maestría en Ciberseguridad.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s -> %d (%.1f ms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


# ── Health endpoints ────────────────────────────────────────────────────────


@app.get("/")
async def root():
    return {"service": "maestro-claudio", "status": "ok"}


# ── Routers ─────────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(auth.router, prefix="/auth")
app.include_router(courses.router)
app.include_router(modules.router)
app.include_router(evaluations.router)
app.include_router(materials.router)
app.include_router(signals.router)
app.include_router(chat.router)
app.include_router(calendar.router)
app.include_router(whatsapp.router)

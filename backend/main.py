"""Maestro Claudio — FastAPI entrypoint."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup hooks (DB pool, schedulers, etc.) go here.
    yield
    # Shutdown hooks go here.


app = FastAPI(
    title="Maestro Claudio",
    description="Agente de estudio personal para Maestría en Ciberseguridad.",
    version="0.1.0",
    lifespan=lifespan,
)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"service": "maestro-claudio", "status": "ok"}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "environment": os.getenv("ENVIRONMENT", "development"),
    }


# Routers se montan aquí a medida que se vayan creando, p.ej.:
# from routers import auth, courses, materials, chat, tasks
# app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
# app.include_router(courses.router, prefix="/api/courses", tags=["courses"])

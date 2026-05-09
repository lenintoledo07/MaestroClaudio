"""Pydantic schemas (request/response). Sin SQLAlchemy: el persistence layer
usa asyncpg directo y los servicios mapean filas a estos modelos.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Tipos compartidos ────────────────────────────────────────────────────────

CourseStatus = Literal["active", "paused", "completed", "deleted"]
ModuleStatus = Literal["pending", "processing", "ready"]
MaterialType = Literal["video", "pdf", "pptx", "whatsapp_export"]
MaterialStatus = Literal[
    "pending", "downloading", "transcribing", "extracting", "ready", "error"
]
SignalType = Literal[
    "exam_tip", "important_content", "reference", "qa", "pending_task"
]
Speaker = Literal["professor", "student", "unknown"]
Importance = Literal["high", "medium", "low"]
SignalSource = Literal["recording", "whatsapp", "document"]
EvaluationType = Literal["exam", "assignment", "project", "quiz"]
EvaluationStatus = Literal["pending", "submitted", "graded"]
ChatMode = Literal["explain", "quiz", "flashcards", "exam_prep"]

HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"


class _ORMBase(BaseModel):
    """Permite construir desde filas asyncpg.Record (acceso por atributo)."""

    model_config = ConfigDict(from_attributes=True)


# ── Users ────────────────────────────────────────────────────────────────────

class UserResponse(_ORMBase):
    id: UUID
    email: str
    name: str | None = None
    drive_folder_id: str | None = None
    timezone: str = "America/Santiago"
    whatsapp_number: str | None = None


# ── Courses ──────────────────────────────────────────────────────────────────

class CourseBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str | None = None
    professor: str | None = None
    professor_whatsapp_name: str | None = None
    drive_folder_id: str | None = None
    color: str = Field(default="#FF4D1C", pattern=HEX_COLOR)


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = None
    professor: str | None = None
    professor_whatsapp_name: str | None = None
    drive_folder_id: str | None = None
    color: str | None = Field(default=None, pattern=HEX_COLOR)
    status: Literal["active", "paused", "completed"] | None = None


class CourseResponse(CourseBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    status: CourseStatus
    start_date: date | None = None
    end_date: date | None = None
    created_at: datetime
    modules_count: int = 0
    materials_count: int = 0


class CourseDeleteRequest(BaseModel):
    confirm: bool = False


# ── Modules ──────────────────────────────────────────────────────────────────

class ModuleBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    week_number: int | None = Field(default=None, ge=1, le=52)
    topic: str | None = None
    class_date: date | None = None
    calendar_event_id: str | None = None


class ModuleCreate(ModuleBase):
    pass


class ModuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    week_number: int | None = Field(default=None, ge=1, le=52)
    topic: str | None = None
    class_date: date | None = None
    calendar_event_id: str | None = None
    status: ModuleStatus | None = None


class ModuleResponse(ModuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    status: ModuleStatus
    created_at: datetime
    materials_count: int = 0
    signals_count: int = 0


class ModuleDeleteResponse(BaseModel):
    deleted: bool
    materials_deleted: int
    signals_deleted: int


# ── Materials ────────────────────────────────────────────────────────────────

class MaterialFromDrive(BaseModel):
    drive_file_id: str | None = None
    drive_url: str | None = None

    @field_validator("drive_url")
    @classmethod
    def _at_least_one(cls, v, info):
        if not v and not info.data.get("drive_file_id"):
            raise ValueError("Debes pasar drive_file_id o drive_url")
        return v


class MaterialResponse(_ORMBase):
    id: UUID
    module_id: UUID
    course_id: UUID | None = None
    type: MaterialType
    filename: str | None = None
    drive_url: str | None = None
    duration_seconds: int | None = None
    status: MaterialStatus
    error_message: str | None = None
    processed_at: datetime | None = None
    created_at: datetime


# ── Signals ──────────────────────────────────────────────────────────────────

class SignalResponse(_ORMBase):
    id: UUID
    material_id: UUID
    module_id: UUID | None = None
    course_id: UUID | None = None
    type: SignalType
    content: str
    speaker: Speaker | None = None
    context: str | None = None
    timestamp_seconds: int | None = None
    importance: Importance
    source: SignalSource | None = None
    created_at: datetime


# ── Evaluations ──────────────────────────────────────────────────────────────

class EvaluationBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    type: EvaluationType = "exam"
    due_date: date
    description: str | None = None
    weight_pct: float | None = Field(default=None, ge=0, le=100)


class EvaluationCreate(EvaluationBase):
    course_id: UUID

    @field_validator("due_date")
    @classmethod
    def _future(cls, v: date) -> date:
        if v < date.today():
            raise ValueError("due_date debe ser hoy o futuro")
        return v


class EvaluationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    type: EvaluationType | None = None
    due_date: date | None = None
    description: str | None = None
    weight_pct: float | None = Field(default=None, ge=0, le=100)
    status: EvaluationStatus | None = None
    grade: float | None = Field(default=None, ge=0, le=100)

    @field_validator("grade")
    @classmethod
    def _grade_only_when_graded(cls, v, info):
        # Si el cliente manda grade pero no cambia status, lo dejamos pasar
        # (para corregir notas). Lo que validamos en el service es: si cambia
        # status a 'graded', grade debe estar presente.
        return v


class EvaluationResponse(EvaluationBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    course_name: str | None = None
    status: EvaluationStatus
    grade: float | None = None
    calendar_event_id: str | None = None
    reminder_sent_7d: bool = False
    reminder_sent_1d: bool = False
    created_at: datetime


class EvaluationUpcomingResponse(EvaluationResponse):
    days_remaining: int


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatSource(BaseModel):
    module_name: str | None = None
    course_name: str | None = None
    similarity: float
    excerpt: str


class ChatRequest(BaseModel):
    query: str = Field(min_length=1)
    conversation_id: UUID | None = None
    course_id: UUID | None = None
    module_id: UUID | None = None
    mode: ChatMode = "explain"


class ChatResponse(BaseModel):
    conversation_id: UUID
    answer: str
    sources: list[ChatSource] = []
    mode: ChatMode
    quiz_questions: list[dict] | None = None

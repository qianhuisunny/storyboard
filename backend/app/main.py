from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Request, UploadFile, File as FastAPIFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.services.orchestrator import orchestrator
from app.services.analytics import analytics_tracker
from app.services.state import StateManager
from app.services.workflow import (
    DuplicateJobError,
    InvalidWorkflowEvent,
    VersionConflictError,
    WorkflowGenerationError,
    workflow_service,
)
from app.infra.quality_log import qlog
from app.services.image_generator import ImageGenerator
from app.services.prompt_context import (
    render_prompt_value,
    serialized_size,
    truncate_prompt_text,
)
from app.services.session_auth import (
    SESSION_COOKIE,
    SESSION_MAX_AGE_SECONDS,
    SessionIdentity,
    find_session,
    issue_session,
    require_session,
)

from app.utils.json_extractor import extract_json_from_text, convert_to_story_format
from app.db import get_db, init_db, ProjectRepository
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Any, List, Literal, Optional
import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from dotenv import load_dotenv
import sentry_sdk
from app.services.source_ingestion import (
    MAX_EXTRACTED_CHARS,
    MAX_UPLOAD_BYTES,
    SourceIngestionError,
    ensure_contained,
    extract_source_in_subprocess,
    fetch_public_text,
    truncate_utf8,
    validate_upload_signature,
)

load_dotenv()

def _frontend_stage_view(phase: Optional[str], state_data: dict) -> tuple[int, list[dict]]:
    """Map backend pipeline phase to the four-stage frontend status model."""
    saved_current_stage = int(state_data.get("currentStageId") or 1)
    saved_statuses = state_data.get("stageStatuses") or []
    statuses = [
        {"id": 1, "status": "not_started"},
        {"id": 2, "status": "not_started"},
        {"id": 3, "status": "not_started"},
        {"id": 4, "status": "not_started"},
    ]

    canonical_stages = {"intake", "outline", "storyboard", "complete"}
    workflow_stage = state_data.get("workflow_stage")
    canonical_stage = (
        workflow_stage
        if workflow_stage in canonical_stages
        else phase if phase in canonical_stages else None
    )
    if canonical_stage:
        current_stage = {
            "intake": 1,
            "outline": 2,
            "storyboard": 3,
            "complete": 4,
        }[canonical_stage]
        for status in statuses[: current_stage - 1]:
            status["status"] = "approved"

        if canonical_stage == "complete":
            statuses[3]["status"] = "approved"
        else:
            artifacts = state_data.get("artifacts") or {}
            artifact = artifacts.get(canonical_stage) or {}
            job = state_data.get("job") or {}
            if canonical_stage in {"outline", "storyboard"}:
                if job.get("status") == "running" and job.get("kind") == canonical_stage:
                    statuses[current_stage - 1]["status"] = "generating"
                elif artifact.get("current_version_id"):
                    statuses[current_stage - 1]["status"] = "needs_review"
                else:
                    statuses[current_stage - 1]["status"] = "in_progress"
            elif artifact.get("current_version_id"):
                statuses[0]["status"] = "in_progress"
        return current_stage, statuses

    if phase in {
        "brief_chat",
        "brief_round1",
        "brief_round2",
        "brief_round3",
        "angle_selection",
    }:
        statuses[0]["status"] = "in_progress"
        return 1, statuses
    if phase in {"brief_review", "gate1"}:
        statuses[0]["status"] = "needs_review"
        return 1, statuses
    if phase in {"gate2", "outline_research"}:
        statuses[0]["status"] = "approved"
        statuses[1]["status"] = "generating" if phase == "outline_research" else "needs_review"
        return 2, statuses
    if phase == "review":
        statuses[0]["status"] = "approved"
        statuses[1]["status"] = "approved"
        statuses[2]["status"] = "needs_review"
        return 3, statuses
    if phase == "done":
        for status in statuses:
            status["status"] = "approved"
        return 4, statuses
    return saved_current_stage, saved_statuses or statuses


def _frontend_stage_summary(phase: Optional[str], state_data: dict) -> tuple[int, int]:
    """Map backend pipeline phase to the four-stage frontend progress model."""
    current_stage, statuses = _frontend_stage_view(phase, state_data)
    approved_count = sum(1 for status in statuses if status.get("status") == "approved")
    return current_stage, int((approved_count / 4) * 100)

if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        traces_sample_rate=0.1,
        environment=os.getenv("FLY_APP_NAME", "local"),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB tables on startup."""
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Hello from FastAPI backend!"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "backend"}


class SessionRequest(BaseModel):
    legacy_user_id: Optional[str] = Field(
        default=None,
        pattern=r"^anon_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
        max_length=41,
    )


@app.post("/api/session")
async def establish_session(
    body: SessionRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create an opaque browser session, or validate the existing cookie."""
    existing = await find_session(db, http_request.cookies.get(SESSION_COOKIE))
    response = JSONResponse({"success": True})
    if existing is not None:
        return response
    try:
        _, raw_token = await issue_session(db, legacy_user_id=body.legacy_user_id)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Legacy identity was already claimed")
    response.set_cookie(
        SESSION_COOKIE,
        raw_token,
        httponly=True,
        samesite="lax",
        secure=http_request.url.scheme == "https",
        max_age=SESSION_MAX_AGE_SECONDS,
        path="/",
    )
    return response


@app.get("/api/llm-stats")
async def llm_stats():
    from app.infra.llm_gateway import llm
    return {"summary": llm.summary(), "stats": llm._stats}


@app.get("/api/test")
async def test_endpoint():
    return {
        "success": True,
        "data": "This is a test endpoint",
        "timestamp": "2025-01-20",
    }


def _project_root_dir(project_id: str) -> Path:
    """Filesystem directory for project-owned raw files such as uploads and links."""
    data_root = Path(__file__).parent.parent.parent / "data"
    return ensure_contained(data_root / f"project_{project_id}", data_root)


async def _require_project(db: AsyncSession, project_id: str):
    """Ensure a project exists in SQLite before running project-scoped operations."""
    repo = ProjectRepository(db)
    project = await repo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _require_owned_project(
    db: AsyncSession, project_id: str, identity: SessionIdentity
):
    project = await _require_project(db, project_id)
    if not identity.owns(project.user_id):
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project


async def _owned_project_access(
    project_id: str,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """FastAPI dependency for legacy project-scoped endpoints."""
    identity = await require_session(http_request, db)
    return await _require_owned_project(db, project_id, identity)


async def _normalize_pipeline_event(project_id: str, event: str, payload: Optional[dict] = None) -> tuple[str, dict]:
    """Normalize legacy convenience events to the current orchestrator contract."""
    payload = payload or {}
    if event not in {"reject", "refine"}:
        return event, payload

    manager = StateManager(project_id)
    state = await manager.load()
    feedback = payload.get("feedback") or payload.get("instruction")

    if not feedback:
        raise HTTPException(status_code=400, detail="feedback is required")

    if state.phase == "gate2":
        return "refine_outline", {
            **payload,
            "instruction": feedback,
        }

    if state.phase in {"gate1", "brief_review", "review"}:
        return "edit", {
            **payload,
            "target": payload.get("target", "current"),
            "feedback": feedback,
        }

    raise HTTPException(
        status_code=400,
        detail=f"Legacy event '{event}' is not valid for phase '{state.phase}'",
    )


class ProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    projectId: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    typeId: int
    typeName: str = Field(max_length=255)
    userInput: str = Field(max_length=6000)


@app.post("/api/create-project")
async def create_project(
    request: ProjectRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new project in SQLite."""
    try:
        repo = ProjectRepository(db)
        identity = await require_session(http_request, db)
        requested_owner = identity.owner_id
        existing = await repo.get_project(request.projectId)
        if existing:
            if not identity.owns(existing.user_id):
                raise HTTPException(
                    status_code=409,
                    detail="Project ID is already owned by another user",
                )
            return {
                "success": True,
                "projectId": request.projectId,
                "projectDir": str(_project_root_dir(request.projectId)),
                "idempotent": True,
            }
        try:
            await repo.create_project(
                project_id=request.projectId,
                user_id=requested_owner,
                title=request.userInput[:100] if request.userInput else "",
                type_id=request.typeId,
                type_name=request.typeName,
                user_input=request.userInput,
            )
        except IntegrityError:
            await db.rollback()
            existing = await repo.get_project(request.projectId)
            if existing is None:
                raise
            if not identity.owns(existing.user_id):
                raise HTTPException(status_code=409, detail="Project ID is already in use")
            return {
                "success": True,
                "projectId": request.projectId,
                "projectDir": str(_project_root_dir(request.projectId)),
                "idempotent": True,
            }

        # Also create project directory for uploads/links (still on filesystem)
        project_dir = _project_root_dir(request.projectId)
        project_dir.mkdir(parents=True, exist_ok=True)

        return {
            "success": True,
            "projectId": request.projectId,
            "projectDir": str(project_dir),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating project: {str(e)}")


@app.get("/api/project/{project_id}")
async def get_project(
    project_id: str,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get project data by ID from SQLite, plus any raw story export files on disk."""
    try:
        repo = ProjectRepository(db)
        identity = await require_session(http_request, db)
        project = await _require_owned_project(db, project_id, identity)

        stories = []
        project_dir = _project_root_dir(project_id)
        if project_dir.exists():
            for story_file in sorted(project_dir.glob("story_*.json")):
                with open(story_file, "r") as f:
                    stories.append(json.load(f))

        project_data = {
            "id": project.id,
            "title": project.title,
            "type": project.type_id,
            "typeName": project.type_name,
            "userInput": project.user_input,
            "createdAt": project.created_at.isoformat() if project.created_at else None,
            "lastUpdated": project.updated_at.isoformat() if project.updated_at else None,
            "storyboard": None,
        }

        return {"success": True, "project": project_data, "stories": stories}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading project: {str(e)}")






class JSONExtractionRequest(BaseModel):
    text: str
    validate: Optional[bool] = True
    convert_to_stories: Optional[bool] = True


@app.post("/api/extract-json")
async def extract_json_from_ai_output(request: JSONExtractionRequest):
    """Extract JSON data from AI output text"""
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")

        # Extract JSON from the text
        result = extract_json_from_text(request.text, validate=request.validate)

        if not result.success:
            return {
                "success": False,
                "error": result.error,
                "raw_json_strings": result.raw_json_strings,
            }

        response_data = {
            "success": True,
            "data": result.data,
            "validated_data": (
                [screen.model_dump() for screen in result.validated_data]
                if result.validated_data
                else None
            ),
            "raw_json_strings": result.raw_json_strings,
        }

        # Convert to story format if requested
        if request.convert_to_stories and result.validated_data:
            stories = convert_to_story_format(result.validated_data)
            response_data["stories"] = stories

        return response_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting JSON: {str(e)}")


class SaveStoriesRequest(BaseModel):
    project_id: str
    stories: List[dict]


@app.post("/api/project/{project_id}/save-stories")
async def save_stories_to_project(
    project_id: str,
    request: SaveStoriesRequest,
    db: AsyncSession = Depends(get_db),
    _project=Depends(_owned_project_access),
):
    """Save extracted stories as raw files for an existing DB-backed project."""
    try:
        repo = ProjectRepository(db)
        project = await repo.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_dir = _project_root_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        # Save stories to individual files
        story_files = []
        for i, story in enumerate(request.stories):
            story_filename = f"story_{i+1}"
            story_file = project_dir / f"{story_filename}.json"

            with open(story_file, "w") as f:
                json.dump(story, f, indent=2)

            story_files.append(story_filename)

        return {
            "success": True,
            "message": f"Saved {len(request.stories)} stories to project",
            "story_files": story_files,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving stories: {str(e)}")


# ============================================================
# NEW EVENT-BASED ENDPOINTS (State Machine Pipeline)
# ============================================================


class CanonicalIntakeSource(BaseModel):
    """Bounded source metadata stored in a canonical intake version."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=128)
    kind: Literal["upload", "link", "text"]
    name: str = Field(min_length=1, max_length=255)
    status: Literal["pending", "processing", "ready", "failed"]
    url: Optional[str] = Field(default=None, max_length=2048)
    title: Optional[str] = Field(default=None, max_length=512)
    path: Optional[str] = Field(default=None, max_length=512)
    error: Optional[str] = Field(default=None, max_length=2000)
    metadata: Optional[dict[str, str | int | float | bool]] = Field(
        default=None, max_length=20
    )

    @model_validator(mode="after")
    def validate_metadata_consistency_and_budget(self):
        if self.kind == "link" and not self.url:
            raise ValueError("Link sources require a URL")
        if self.kind != "link" and self.url is not None:
            raise ValueError("Only link sources may include a URL")
        if self.status == "ready":
            if self.error is not None:
                raise ValueError("Ready sources cannot include an error")
            if self.kind in {"upload", "link"} and not self.path:
                raise ValueError("Ready upload and link sources require a path")
        elif self.status == "failed":
            if not self.error:
                raise ValueError("Failed sources require an error")
            if self.path is not None:
                raise ValueError("Failed sources cannot include a path")
        elif self.path is not None or self.error is not None:
            raise ValueError("Pending sources cannot include a path or error")
        if serialized_size(self.model_dump()) > 15_000:
            raise ValueError("Source metadata exceeds 15000 characters")
        return self


class CanonicalIntakeContent(BaseModel):
    """Typed canonical Create and documented Smart Intake fields."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    prompt: str = Field(default="", max_length=6000)
    duration_seconds: Optional[
        Literal[60, 90, 120, 180, 240, 300, 600, 900, 1200]
    ] = None
    platform: Optional[Literal["youtube", "short_form", "internal_lms", "general"]] = None
    aspect_ratio: Optional[Literal["16:9", "4:3", "1:1", "3:4", "9:16"]] = None
    note: Optional[str] = Field(default=None, max_length=20_000)
    notes: Optional[str] = Field(default=None, max_length=20_000)
    source_snapshot: Optional[str] = Field(default=None, max_length=100_000)
    source_contents: Optional[dict[str, str]] = Field(default=None, max_length=20)
    sources: list[CanonicalIntakeSource] = Field(default_factory=list, max_length=20)
    viewer_outcome: Optional[str] = Field(default=None, max_length=6000)
    target_audience: Optional[str] = Field(default=None, max_length=6000)
    audience_level: Optional[str] = Field(default=None, max_length=255)
    delivery_tone: Optional[str] = Field(default=None, max_length=255)
    production_formats: Optional[
        list[Literal["talking_head", "slides", "stock_footage", "real_world"]]
    ] = Field(default=None, max_length=8)
    format_or_platform: Optional[str] = Field(default=None, max_length=255)
    company_or_brand_name: Optional[str] = Field(default=None, max_length=512)
    call_to_action: Optional[str] = Field(default=None, max_length=6000)
    constraints: Optional[list[str]] = Field(default=None, max_length=50)
    smart_intake_extra: Optional[
        dict[str, str | int | float | bool | list[str]]
    ] = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def validate_total_budget(self):
        source_ids = [source.id for source in self.sources]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("Canonical source IDs must be unique")
        if self.source_contents is not None:
            ready_source_ids = {
                source.id for source in self.sources if source.status == "ready"
            }
            total_source_chars = 0
            for source_id, extracted in self.source_contents.items():
                if not source_id or len(source_id) > 128:
                    raise ValueError("Source content IDs must be 1 to 128 characters")
                if source_id not in ready_source_ids:
                    raise ValueError("Source content must belong to a retained ready source")
                if len(extracted) > 50_000:
                    raise ValueError("Source content exceeds 50000 characters")
                total_source_chars += len(extracted)
            if total_source_chars > 100_000:
                raise ValueError("Structured source content exceeds 100000 characters")
            blocks = []
            for source in self.sources:
                if source.status != "ready":
                    continue
                extracted = self.source_contents.get(source.id)
                if not extracted:
                    continue
                label = (
                    "Link"
                    if source.kind == "link"
                    else "File"
                    if source.kind == "upload"
                    else "Note"
                )
                blocks.append(f"[{label}: {source.name}]\n{extracted}")
            derived_snapshot = "\n\n---\n\n".join(blocks)
            if len(derived_snapshot) > 100_000:
                marker = "\n…[source snapshot truncated]"
                derived_snapshot = derived_snapshot[: 100_000 - len(marker)] + marker
            self.source_snapshot = derived_snapshot
        if serialized_size(self.model_dump()) > 250_000:
            raise ValueError("Canonical intake payload exceeds 250000 characters")
        return self


class EventRequest(BaseModel):
    """Request body for event-based pipeline."""
    event: str  # submit, submit_guided_brief, submit_knowledge_share, chat_brief_approve, approve/brief_approve, edit/edit_brief, refine_outline, regenerate_section, restart
    payload: Optional[dict] = None

    @model_validator(mode="after")
    def validate_canonical_intake(self):
        if self.event not in {"save_intake", "approve_intake"}:
            return self
        payload = self.payload or {}
        content = payload.get("content")
        if not isinstance(content, dict):
            raise ValueError("Canonical intake content must be an object")
        validated = CanonicalIntakeContent.model_validate(content)
        normalized_content = validated.model_dump(
            mode="json", exclude_none=True, exclude_unset=True
        )
        self.payload = {**payload, "content": normalized_content}
        if serialized_size(payload) > 251_000:
            raise ValueError("Canonical intake request exceeds 251000 characters")
        return self


class IntakeFormRequest(BaseModel):
    """Request body for starting the pipeline."""
    intake_form: dict


class ChatBriefMessage(BaseModel):
    role: Literal["user", "ai", "assistant"]
    content: str = Field(max_length=6000)


class ChatBriefRequest(BaseModel):
    """Request body for chat-assisted Smart Intake completion."""
    messages: list[ChatBriefMessage] = Field(default_factory=list, max_length=20)
    fields_so_far: dict[str, Any] = Field(default_factory=dict, max_length=100)
    onboarding: dict[str, Any] = Field(default_factory=dict, max_length=100)

    @model_validator(mode="after")
    def validate_total_size(self):
        if serialized_size(self.model_dump()) > 50_000:
            raise ValueError("Chat brief payload exceeds 50000 characters")
        return self


class PersistedChatMessage(BaseModel):
    id: str
    role: str
    content: str
    phase: int
    fieldKey: Optional[str] = None
    selectedChip: Optional[str] = None


class SaveChatMessagesRequest(BaseModel):
    messages: List[PersistedChatMessage]


@app.post("/api/project/{project_id}/event")
async def process_pipeline_event(
    project_id: str,
    request: EventRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Process a state machine event for the storyboard pipeline.

    Preferred events:
    - submit / submit_guided_brief / submit_knowledge_share: Start the pipeline
    - chat_brief_approve: Finalize the chat-built brief and enter Gate 1
    - approve: Approve the current gate
    - edit: Unlock the current stage or go back
    - refine_outline / regenerate_section: Regenerate outline content at Gate 2

    Example payloads:
    - submit: {"intake_form": {...}}
    - edit: {"target": "current"}
    - refine_outline: {"instruction": "Make section 3 shorter", "current_outline": "..."}

    Legacy compatibility:
    - reject/refine are normalized to the current contract based on the project's phase
    """
    import logging
    import traceback
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)

    logger.info(f"Processing event: project_id={project_id}, event={request.event}")

    try:
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)
        if request.event in workflow_service.NEW_EVENTS:
            result = await workflow_service.process_event(
                project_id,
                request.event,
                request.payload,
            )
            return result
        normalized_event, normalized_payload = await _normalize_pipeline_event(
            project_id=project_id,
            event=request.event,
            payload=request.payload,
        )
        result = await orchestrator.process_event(
            project_id=project_id,
            event=normalized_event,
            payload=normalized_payload,
        )

        if not result.get("success", True):
            logger.error(f"Event failed: {result.get('error')}")
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except VersionConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "version_conflict",
                "current_version_id": e.current_version_id,
            },
        )
    except DuplicateJobError as e:
        raise HTTPException(
            status_code=409,
            detail={"code": "duplicate_job", "job": e.job},
        )
    except InvalidWorkflowEvent as e:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_workflow_event",
                "event": e.event,
                "workflow_stage": e.workflow_stage,
                "allowed_events": e.allowed_events,
                "message": str(e),
            },
        )
    except WorkflowGenerationError as e:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "workflow_generation_failed",
                "message": str(e),
                "job": e.job,
            },
        )
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Exception in process_pipeline_event: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing event: {str(e)}")


# Researcher endpoints are intentionally absent in the MVP.
# Reintroduce them only after the research I/O contract is finalized.


@app.post("/api/project/{project_id}/chat-brief")
async def chat_brief(
    project_id: str,
    request: ChatBriefRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Ask only for missing canonical Smart Intake values."""
    try:
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)

        # Load system prompt
        prompt_path = Path(__file__).parent.parent.parent / "prompts" / "chat_brief_prompt_v0712.md"
        if not prompt_path.exists():
            raise HTTPException(status_code=500, detail="Chat brief prompt not found")
        system_prompt = prompt_path.read_text(encoding="utf-8")

        # Build user prompt with context
        allowed_fields = {
            "viewer_outcome",
            "target_audience",
            "audience_level",
            "delivery_tone",
            "production_formats",
        }
        fields_summary = render_prompt_value("\n".join(
            f"- {k}: {render_prompt_value(v.get('value', v) if isinstance(v, dict) else v, 3000)}"
            for k, v in request.fields_so_far.items()
            if k in allowed_fields
            if (v.get("value") if isinstance(v, dict) else v)
        ), 10000)

        conversation = render_prompt_value("\n".join(
            f"{'AI' if m.role in {'ai', 'assistant'} else 'User'}: "
            f"{render_prompt_value(m.content, 3000)}"
            for m in request.messages
        ), 16000)

        def first_value(*names):
            for name in names:
                value = request.onboarding.get(name)
                if value not in (None, "", []):
                    return value
            return ""

        onboarding_values = (
            ("Video goal", first_value("prompt", "topic", "description")),
            ("Duration (seconds)", first_value("duration_seconds", "duration")),
            ("Audience", first_value("target_audience", "audience")),
            ("Platform", first_value("platform")),
            ("Aspect ratio", first_value("aspect_ratio")),
            ("Production formats", first_value("production_formats", "broll_type")),
            ("Source context", first_value("source_snapshot", "source_context")),
        )
        onboarding_summary = render_prompt_value("\n".join(
            f"- {label}: {render_prompt_value(value, 4000)}"
            for label, value in onboarding_values
            if value not in (None, "", [])
        ), 14000)

        # Onboarding, collected fields, and conversation are independently
        # capped so this prompt stays below roughly 40k contextual characters.
        user_prompt = f"""## ONBOARDING CONTEXT
{onboarding_summary or '(none provided)'}

## COLLECTED BRIEF FIELDS
{fields_summary or '(none yet)'}

## CONVERSATION SO FAR
{conversation}

Respond with the next JSON message."""

        from app.infra.llm_gateway import llm
        response_text = await asyncio.to_thread(
            llm.chat,
            category="storyboard",
            label="chat_brief",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model="gpt-4o",
            temperature=0.7,
            max_tokens=1000,
        )

        extraction = extract_json_from_text(response_text, validate=False)
        parsed = next(
            (
                item
                for item in (extraction.data or [])
                if isinstance(item, dict)
            ),
            None,
        )
        if not extraction.success or not isinstance(parsed, dict):
            return {"reply": "I'm having trouble processing that. Could you try again?", "done": False, "extracted_fields": None}

        extracted_fields = parsed.get("extracted_fields")
        if isinstance(extracted_fields, dict):
            extracted_fields = {
                key: value
                for key, value in extracted_fields.items()
                if key in allowed_fields
            }
        return {
            "reply": truncate_prompt_text(parsed.get("reply", ""), 6000),
            "done": bool(parsed.get("done", False)),
            "extracted_fields": extracted_fields,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat brief error: {str(e)}")


@app.get("/api/project/{project_id}/chat-messages")
async def get_chat_messages(
    project_id: str,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Load persisted Stage 1 chat history for a project."""
    try:
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)
        repo = ProjectRepository(db)
        messages = await repo.list_chat_messages(project_id=project_id, stage_id=1)
        return {
            "success": True,
            "messages": [
                {
                    "id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "phase": message.phase,
                    "fieldKey": message.field_key,
                    "selectedChip": message.selected_chip,
                }
                for message in messages
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading chat messages: {str(e)}")


@app.post("/api/project/{project_id}/chat-messages")
async def save_chat_messages(
    project_id: str,
    request: SaveChatMessagesRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Append or update Stage 1 chat messages for a project."""
    try:
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)
        repo = ProjectRepository(db)
        await repo.upsert_chat_messages(
            project_id=project_id,
            stage_id=1,
            messages=[message.model_dump() for message in request.messages],
        )
        await repo.update_project_timestamp(project_id)
        return {"success": True, "messageCount": len(request.messages)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving chat messages: {str(e)}")


@app.post("/api/project/{project_id}/start")
async def start_pipeline(
    project_id: str,
    request: IntakeFormRequest,
    db: AsyncSession = Depends(get_db),
    _project=Depends(_owned_project_access),
):
    """
    Start the storyboard pipeline with an intake form.

    This is a convenience endpoint that wraps the submit event.
    After calling this, the project will be at gate1 ready for review.
    """
    try:
        await _require_project(db, project_id)
        result = await orchestrator.process_event(
            project_id=project_id,
            event="submit",
            payload={"intake_form": request.intake_form}
        )

        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error starting pipeline: {str(e)}")


@app.post("/api/project/{project_id}/approve")
async def approve_current_stage(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _project=Depends(_owned_project_access),
):
    """
    Approve the current stage (Gate 1, Gate 2, or Review).

    This is a convenience endpoint that sends an approve event.
    """
    try:
        await _require_project(db, project_id)
        result = await orchestrator.process_event(
            project_id=project_id,
            event="approve",
            payload={}
        )

        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error approving stage: {str(e)}")


class FeedbackRequest(BaseModel):
    """Request body for rejection/refinement."""
    feedback: str


@app.post("/api/project/{project_id}/reject")
async def reject_current_stage(
    project_id: str,
    request: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
    _project=Depends(_owned_project_access),
):
    """
    Legacy compatibility endpoint.
    Normalizes old reject semantics to the current edit/refine contract.
    """
    try:
        await _require_project(db, project_id)
        normalized_event, normalized_payload = await _normalize_pipeline_event(
            project_id=project_id,
            event="reject",
            payload={"feedback": request.feedback},
        )
        result = await orchestrator.process_event(
            project_id=project_id,
            event=normalized_event,
            payload=normalized_payload,
        )

        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rejecting stage: {str(e)}")


@app.post("/api/project/{project_id}/refine")
async def refine_storyboard(
    project_id: str,
    request: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
    _project=Depends(_owned_project_access),
):
    """
    Legacy compatibility endpoint.
    Normalizes old refine semantics to the current edit/refine contract.
    """
    try:
        await _require_project(db, project_id)
        normalized_event, normalized_payload = await _normalize_pipeline_event(
            project_id=project_id,
            event="refine",
            payload={"feedback": request.feedback},
        )
        result = await orchestrator.process_event(
            project_id=project_id,
            event=normalized_event,
            payload=normalized_payload,
        )

        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refining storyboard: {str(e)}")


@app.post("/api/project/{project_id}/go-back/{target}")
async def go_back_to_stage(
    project_id: str,
    target: str,
    db: AsyncSession = Depends(get_db),
    _project=Depends(_owned_project_access),
):
    """
    Go back to an earlier stage in the pipeline.

    Target options:
    - "gate1": Go back to Gate 1 (Story Brief review)
    - "gate2": Go back to Gate 2 (Screen Outline review)
    - "intake": Restart the entire project from the beginning

    This will unlock the relevant stages and clear downstream data:
    - Going to gate1: Clears screen_outline and storyboard
    - Going to gate2: Clears storyboard
    - Going to intake: Clears all data
    """
    try:
        await _require_project(db, project_id)
        event_map = {
            "gate1": "go_back_gate1",
            "gate2": "go_back_gate2",
            "intake": "restart"
        }

        if target not in event_map:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid target. Must be one of: {list(event_map.keys())}"
            )

        result = await orchestrator.process_event(
            project_id=project_id,
            event=event_map[target],
            payload={}
        )

        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error going back: {str(e)}")


@app.get("/api/project/{project_id}/pipeline-state")
async def get_pipeline_state(
    project_id: str,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Get the current pipeline state for a project.

    Returns:
    - phase: Current phase (intake, gate1, gate2, review, done, etc.)
    - state: Full state object with all data
    - available_events: What events can be sent next
    """
    try:
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)
        return await workflow_service.get_project(project_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting pipeline state: {str(e)}")


# ============================================================
# STAGE PERSISTENCE ENDPOINTS (Auto-save support)
# ============================================================


class StageStatus(BaseModel):
    id: int
    status: str


class StageData(BaseModel):
    aiVersion: Optional[str] = None
    humanVersion: Optional[str] = None


class SaveStagesRequest(BaseModel):
    stages: dict  # { "1": StageData, "2": StageData, ... }
    currentStageId: int
    stageStatuses: List[StageStatus]


@app.post("/api/project/{project_id}/stages")
async def save_stages(
    project_id: str,
    request: SaveStagesRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Save all stage data for a project (auto-save endpoint)."""
    try:
        # Acquire SQLite's writer lock before reading mutable pipeline state so
        # autosave cannot overwrite a concurrent workflow transition.
        await db.execute(text("BEGIN IMMEDIATE"))
        repo = ProjectRepository(db)
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)

        for stage_id_str, stage_data in request.stages.items():
            stage_id = int(stage_id_str)
            ai_ver = stage_data.get("aiVersion") if isinstance(stage_data, dict) else None
            human_ver = stage_data.get("humanVersion") if isinstance(stage_data, dict) else None
            if ai_ver or human_ver:
                await repo.save_stage_snapshot(
                    project_id=project_id,
                    stage_id=stage_id,
                    ai_version=ai_ver,
                    human_version=human_ver,
                    commit=False,
                )

        ps = await repo.get_pipeline_state(project_id)
        if ps:
            state_data = repo.parse_state_data(ps)
            expected_revision = state_data.get("state_revision")
            state_data["currentStageId"] = request.currentStageId
            state_data["stageStatuses"] = [s.model_dump() for s in request.stageStatuses]
            state_data["state_revision"] = str(uuid4())
            await repo.update_pipeline_state(
                project_id,
                ps.phase,
                ps.status,
                state_data,
                commit=False,
                expected_revision=expected_revision,
            )

        await repo.update_project_timestamp(project_id, commit=False)
        await db.commit()
        now = datetime.now().isoformat()
        return {"success": True, "message": "Stages saved successfully", "lastSaved": now}

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error saving stages: {str(e)}")


@app.get("/api/project/{project_id}/stages")
async def load_stages(
    project_id: str,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Load all stage data for a project."""
    try:
        repo = ProjectRepository(db)
        identity = await require_session(http_request, db)
        project = await _require_owned_project(db, project_id, identity)

        snapshots = await repo.get_all_snapshots(project_id)
        ps = await repo.get_pipeline_state(project_id)
        state_data = repo.parse_state_data(ps) if ps else {}
        current_stage_id, stage_statuses = _frontend_stage_view(ps.phase if ps else None, state_data)

        stages = {}
        for snap in snapshots:
            stages[str(snap.stage_id)] = {
                "aiVersion": snap.ai_version,
                "humanVersion": snap.human_version,
            }

        return {
            "success": True,
            "stages": stages if stages else None,
            "currentStageId": current_stage_id,
            "stageStatuses": stage_statuses,
            "lastSaved": project.updated_at.isoformat() if project.updated_at else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading stages: {str(e)}")


@app.post("/api/project/{project_id}/screen/{screen_index}/generate-visual")
async def generate_visual(
    project_id: str,
    screen_index: int,
    db: AsyncSession = Depends(get_db),
    _project=Depends(_owned_project_access),
):
    repo = ProjectRepository(db)
    project = await repo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Draft stage = stage_id 3
    snapshot = await repo.get_stage_snapshot(project_id, 3)
    raw_data = snapshot.human_version or snapshot.ai_version if snapshot else None
    if not raw_data:
        raise HTTPException(status_code=404, detail="No storyboard draft found")

    # human_version / ai_version are stored as JSON strings in the DB
    screens_data = json.loads(raw_data)
    screens = screens_data if isinstance(screens_data, list) else screens_data.get("screens", [])
    if screen_index < 0 or screen_index >= len(screens):
        raise HTTPException(status_code=400, detail=f"Screen index {screen_index} out of range (0-{len(screens)-1})")

    screen = screens[screen_index]
    visual_direction = screen.get("visual_direction", [])
    if isinstance(visual_direction, str):
        visual_direction = [d.strip() for d in visual_direction.split(",") if d.strip()]
    screen_type = screen.get("screen_type", "slides")

    generator = ImageGenerator()
    try:
        image_bytes = await generator.generate(visual_direction, screen_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image generation failed: {str(e)}")

    # Save to frontend/public/generated/
    output_dir = Path(__file__).parent.parent.parent / "frontend" / "public" / "generated" / project_id
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"screen_{screen_index}.png"
    output_path.write_bytes(image_bytes)

    # Update screen's on_screen_visual in the snapshot
    on_screen_visual = f"/generated/{project_id}/screen_{screen_index}.png"
    screens[screen_index]["on_screen_visual"] = on_screen_visual
    updated_data = json.dumps(screens if isinstance(screens_data, list) else {**screens_data, "screens": screens})
    await repo.save_stage_snapshot(project_id, 3, human_version=updated_data)

    return {"success": True, "on_screen_visual": on_screen_visual}

@app.get("/api/projects")
async def list_user_projects(
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List all projects for a specific user, including anonymous sessions."""
    try:
        repo = ProjectRepository(db)
        identity = await require_session(http_request, db)
        db_projects = await repo.list_projects(identity.owner_id)
        if identity.legacy_user_id:
            legacy = await repo.list_projects(identity.legacy_user_id)
            known_ids = {project.id for project in db_projects}
            db_projects.extend(project for project in legacy if project.id not in known_ids)

        projects = []

        # DB projects
        for p in db_projects:
            ps = await repo.get_pipeline_state(p.id)
            state_data = repo.parse_state_data(ps) if ps else {}
            current_stage, progress = _frontend_stage_summary(ps.phase if ps else None, state_data)

            projects.append({
                "id": p.id,
                "typeName": p.type_name,
                "userInput": (p.user_input or "")[:100],
                "createdAt": p.created_at.isoformat() if p.created_at else None,
                "lastUpdated": p.updated_at.isoformat() if p.updated_at else None,
                "currentStage": current_stage,
                "progress": progress,
            })

        projects.sort(key=lambda p: p.get("lastUpdated") or "", reverse=True)
        return {"success": True, "projects": projects}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing projects: {str(e)}")


@app.delete("/api/project/{project_id}")
async def delete_project(
    project_id: str,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete a project owned by the current signed-in or anonymous user."""
    try:
        import shutil
        repo = ProjectRepository(db)
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)
        await repo.delete_project(project_id)

        # Also delete filesystem directory (uploads, links)
        project_dir = _project_root_dir(project_id)
        if project_dir.exists():
            shutil.rmtree(project_dir)

        return {"success": True, "message": "Project deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting project: {str(e)}")


# ============================================================
# FILE UPLOAD AND LINK FETCHING ENDPOINTS
# ============================================================


@app.post("/api/project/{project_id}/upload")
async def upload_file_to_project(
    project_id: str,
    http_request: Request,
    file: UploadFile = FastAPIFile(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a file to a project and extract its text content.

    Supported formats: PDF, TXT, MD, DOCX
    Files are saved to data/project_{id}/uploads/
    """
    try:
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)
        repo = ProjectRepository(db)

        # Find or create project directory
        project_dir = _project_root_dir(project_id)
        if not project_dir.exists():
            project_dir.mkdir(parents=True, exist_ok=True)

        # Create uploads subdirectory
        uploads_dir = project_dir / "uploads"
        uploads_dir.mkdir(exist_ok=True)

        # Validate file type
        allowed_extensions = [".pdf", ".txt", ".md", ".docx"]
        file_ext = Path(file.filename or "").suffix.lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
            )
        declared_type = (file.content_type or "").lower()
        expected_types = {
            ".pdf": {"application/pdf"},
            ".docx": {
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            },
            ".txt": {"text/plain"},
            ".md": {"text/plain", "text/markdown"},
        }
        if (
            declared_type not in {"", "application/octet-stream"}
            and declared_type not in expected_types[file_ext]
        ):
            raise HTTPException(
                status_code=400,
                detail="File type does not match its extension",
            )

        # Client filenames are display metadata only. The on-disk name is
        # unguessable, collision-safe, and asserted inside the project root.
        file_path = ensure_contained(
            uploads_dir / f"{uuid4().hex}{file_ext}", uploads_dir
        )
        size_bytes = 0
        with file_path.open("wb") as destination:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Upload is too large")
                destination.write(chunk)
        validate_upload_signature(file_path, file_ext)

        # Extract text based on file type
        extraction_kind = {
            ".pdf": "pdf",
            ".docx": "docx",
            ".txt": "text",
            ".md": "text",
        }[file_ext]
        extracted_text = await extract_source_in_subprocess(
            extraction_kind, file_path
        )
        if extracted_text.startswith("[Error extracting"):
            raise SourceIngestionError("Source file could not be parsed safely")
        extracted_text = truncate_utf8(extracted_text[:MAX_EXTRACTED_CHARS])

        # Save extracted text to a companion file
        text_file = file_path.with_suffix(".extracted.txt")
        await asyncio.to_thread(
            text_file.write_text,
            extracted_text[:MAX_EXTRACTED_CHARS],
            "utf-8",
        )
        display_name = Path(file.filename or "").name[:255] or file_path.name
        await repo.create_upload(
            project_id=project_id,
            filename=display_name,
            file_path=str(file_path.relative_to(project_dir)),
            content_type=file.content_type,
            size_bytes=size_bytes,
            commit=False,
        )
        await repo.update_project_timestamp(project_id, commit=False)
        await db.commit()

        return {
            "success": True,
            "filename": display_name,
            "content": extracted_text[:MAX_EXTRACTED_CHARS],
            "path": str(file_path.relative_to(project_dir)),
        }

    except (HTTPException, SourceIngestionError) as error:
        await db.rollback()
        if "file_path" in locals():
            file_path.unlink(missing_ok=True)
            file_path.with_suffix(".extracted.txt").unlink(missing_ok=True)
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as e:
        await db.rollback()
        if "file_path" in locals():
            file_path.unlink(missing_ok=True)
            file_path.with_suffix(".extracted.txt").unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")


class FetchLinkRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


@app.post("/api/project/{project_id}/fetch-link")
async def fetch_link_content(
    project_id: str,
    request: FetchLinkRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch content from a URL and save it to the project.

    Extracts text content from web pages and saves metadata.
    """
    try:
        identity = await require_session(http_request, db)
        await _require_owned_project(db, project_id, identity)
        repo = ProjectRepository(db)

        # Find or create project directory
        project_dir = _project_root_dir(project_id)
        if not project_dir.exists():
            project_dir.mkdir(parents=True, exist_ok=True)

        # Create links subdirectory
        links_dir = project_dir / "links"
        links_dir.mkdir(exist_ok=True)

        fetched = await fetch_public_text(request.url)
        if fetched.content_type in {"text/html", "application/xhtml+xml"}:
            title, text_content = await extract_source_in_subprocess(
                "html", fetched.text
            )
        else:
            title, text_content = "", fetched.text.strip()
        text_content = truncate_utf8(text_content[:MAX_EXTRACTED_CHARS])
        if not title:
            title = fetched.final_url
        title = truncate_utf8(title.strip(), 512)

        # Save the extracted content
        content_file = ensure_contained(
            links_dir / f"{uuid4().hex}.txt", links_dir
        )

        companion = truncate_utf8(
            f"URL: {fetched.final_url}\n"
            f"Title: {title}\n"
            f"Fetched: {datetime.now().isoformat()}\n"
            f"\n---\n\n{text_content}"
        )
        await asyncio.to_thread(content_file.write_text, companion, "utf-8")
        await repo.create_upload(
            project_id=project_id,
            filename=title[:255],
            file_path=str(content_file.relative_to(project_dir)),
            content_type="text/link",
            size_bytes=len(text_content.encode("utf-8")),
            commit=False,
        )
        await repo.update_project_timestamp(project_id, commit=False)
        await db.commit()

        return {
            "success": True,
            "url": fetched.final_url,
            "title": title,
            "content": text_content,
            "path": str(content_file.relative_to(project_dir)),
        }

    except SourceIngestionError as error:
        await db.rollback()
        if "content_file" in locals():
            content_file.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(error))
    except HTTPException:
        await db.rollback()
        if "content_file" in locals():
            content_file.unlink(missing_ok=True)
        raise
    except Exception as e:
        await db.rollback()
        if "content_file" in locals():
            content_file.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Error fetching link: {str(e)}")


# ============================================================
# ANALYTICS ENDPOINTS (Monitoring Dashboard)
# ============================================================


class StageEnterRequest(BaseModel):
    stage_id: int
    stage_name: Optional[str] = None
    user_id: Optional[str] = None


class StageExitRequest(BaseModel):
    stage_id: int
    time_spent_seconds: Optional[float] = None


class FieldEditRequest(BaseModel):
    stage_id: int
    field_name: str
    ai_value: str
    human_value: str


class RegenerationRequest(BaseModel):
    stage_id: int


class GoBackRequest(BaseModel):
    from_stage: int
    to_stage: int


class RatingRequest(BaseModel):
    rating: int  # 1-5
    feedback: Optional[str] = None
    user_id: Optional[str] = None


@app.post("/api/analytics/{project_id}/stage-enter")
async def track_stage_enter(project_id: str, request: StageEnterRequest):
    """Track when a user enters a stage."""
    try:
        stage_name = request.stage_name or f"stage_{request.stage_id}"
        analytics_tracker.record_stage_enter(
            project_id=project_id,
            stage_id=request.stage_id,
            stage_name=stage_name,
            user_id=request.user_id,
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error tracking stage enter: {str(e)}")


@app.post("/api/analytics/{project_id}/stage-exit")
async def track_stage_exit(project_id: str, request: StageExitRequest):
    """Track when a user exits a stage."""
    try:
        analytics_tracker.record_stage_exit(
            project_id=project_id,
            stage_id=request.stage_id,
            time_spent_seconds=request.time_spent_seconds,
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error tracking stage exit: {str(e)}")


@app.post("/api/analytics/{project_id}/field-edit")
async def track_field_edit(project_id: str, request: FieldEditRequest):
    """Track a field-level edit for prompt refinement analysis."""
    try:
        analytics_tracker.record_field_edit(
            project_id=project_id,
            stage_id=request.stage_id,
            field_name=request.field_name,
            ai_value=request.ai_value,
            human_value=request.human_value,
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error tracking field edit: {str(e)}")


@app.post("/api/analytics/{project_id}/regeneration")
async def track_regeneration(project_id: str, request: RegenerationRequest):
    """Track a regeneration event."""
    try:
        analytics_tracker.record_regeneration(
            project_id=project_id,
            stage_id=request.stage_id,
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error tracking regeneration: {str(e)}")


@app.post("/api/analytics/{project_id}/go-back")
async def track_go_back(project_id: str, request: GoBackRequest):
    """Track when user navigates back to a previous stage."""
    try:
        analytics_tracker.record_go_back(
            project_id=project_id,
            from_stage=request.from_stage,
            to_stage=request.to_stage,
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error tracking go-back: {str(e)}")


@app.post("/api/analytics/{project_id}/rating")
async def submit_satisfaction_rating(project_id: str, request: RatingRequest):
    """Submit user satisfaction rating after Stage 4."""
    try:
        if not 1 <= request.rating <= 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

        analytics_tracker.submit_rating(
            project_id=project_id,
            rating=request.rating,
            feedback=request.feedback,
            user_id=request.user_id,
        )
        return {"success": True, "message": "Rating submitted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error submitting rating: {str(e)}")


@app.get("/api/analytics/{project_id}")
async def get_project_analytics_data(project_id: str):
    """Get analytics data for a specific project."""
    try:
        analytics = analytics_tracker.get_project_analytics(project_id)
        return {"success": True, "analytics": analytics.model_dump()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting analytics: {str(e)}")


# ============================================================
# CLERK WEBHOOK FOR USER REGISTRATIONS
# ============================================================


@app.post("/api/webhooks/clerk")
async def clerk_webhook(request: Request):
    """
    Handle Clerk webhook events for user registration tracking.

    Supported events:
    - user.created: Track new user registration
    """
    try:
        # Get the raw body
        body = await request.body()
        body_str = body.decode("utf-8")

        # Verify webhook signature (optional but recommended)
        webhook_secret = os.getenv("CLERK_WEBHOOK_SECRET")
        if webhook_secret:
            svix_id = request.headers.get("svix-id")
            svix_timestamp = request.headers.get("svix-timestamp")
            svix_signature = request.headers.get("svix-signature")

            if not all([svix_id, svix_timestamp, svix_signature]):
                raise HTTPException(status_code=400, detail="Missing webhook signature headers")

            # Verify signature using svix
            try:
                from svix.webhooks import Webhook
                wh = Webhook(webhook_secret)
                payload = wh.verify(body_str, {
                    "svix-id": svix_id,
                    "svix-timestamp": svix_timestamp,
                    "svix-signature": svix_signature,
                })
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid webhook signature")
        else:
            payload = json.loads(body_str)

        # Process the event
        event_type = payload.get("type")

        if event_type == "user.created":
            user_data = payload.get("data", {})
            user_id = user_data.get("id")
            email = None

            # Get primary email
            email_addresses = user_data.get("email_addresses", [])
            if email_addresses:
                primary = next(
                    (e for e in email_addresses if e.get("id") == user_data.get("primary_email_address_id")),
                    email_addresses[0]
                )
                email = primary.get("email_address")

            # Record the registration
            analytics_tracker.record_user_registration(
                user_id=user_id,
                email=email,
                created_at=datetime.fromtimestamp(user_data.get("created_at", 0) / 1000).isoformat()
                if user_data.get("created_at") else None,
            )

        return {"success": True, "event": event_type}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing webhook: {str(e)}")


# ============================================================
# ADMIN DASHBOARD ENDPOINTS (Protected)
# ============================================================


def verify_admin(user_id: Optional[str]) -> bool:
    """
    Verify if a user has admin privileges.

    In production, this would check Clerk user metadata.
    For now, we check against an environment variable or allow all in dev mode.
    """
    if os.getenv("ALLOW_ANONYMOUS_ACCESS", "true").lower() != "false":
        return True

    admin_ids = os.getenv("ADMIN_USER_IDS", "").split(",")
    admin_ids = [id.strip() for id in admin_ids if id.strip()]

    # In development, allow if no admin IDs configured
    if not admin_ids:
        return True

    return user_id in admin_ids


@app.get("/api/admin/analytics/dashboard")
async def get_admin_dashboard(
    range: str = "30d",
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Get aggregated analytics data for the admin dashboard.

    Query params:
    - range: Time range (7d, 30d, 90d, all)

    Requires admin privileges.
    """
    try:
        if not verify_admin(user_id):
            raise HTTPException(status_code=403, detail="Admin access required")

        dashboard_data = analytics_tracker.get_dashboard_data(time_range=range)
        return {"success": True, **dashboard_data}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting dashboard: {str(e)}")


@app.get("/api/admin/analytics/projects")
async def get_admin_projects(
    range: str = "30d",
    skip: int = 0,
    limit: int = 50,
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Get analytics for all projects (paginated).

    Query params:
    - range: Time range (7d, 30d, 90d, all)
    - skip: Number of projects to skip
    - limit: Maximum projects to return

    Requires admin privileges.
    """
    try:
        if not verify_admin(user_id):
            raise HTTPException(status_code=403, detail="Admin access required")

        projects = analytics_tracker.get_all_projects_analytics(time_range=range)

        # Sort by created_at descending
        projects.sort(key=lambda p: p.created_at, reverse=True)

        # Paginate
        total = len(projects)
        projects = projects[skip:skip + limit]

        return {
            "success": True,
            "total": total,
            "skip": skip,
            "limit": limit,
            "projects": [p.model_dump() for p in projects],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting projects: {str(e)}")


@app.get("/api/admin/analytics/registrations")
async def get_admin_registrations(
    range: str = "30d",
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Get user registration data for the dashboard.

    Query params:
    - range: Time range (7d, 30d, 90d, all)

    Requires admin privileges.
    """
    try:
        if not verify_admin(user_id):
            raise HTTPException(status_code=403, detail="Admin access required")

        registrations = analytics_tracker.get_registrations(time_range=range)
        return {"success": True, **registrations}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting registrations: {str(e)}")


@app.get("/api/admin/analytics/field-edits")
async def get_admin_field_edits(
    range: str = "30d",
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Get aggregated field edit patterns for prompt refinement.

    Query params:
    - range: Time range (7d, 30d, 90d, all)

    Requires admin privileges.
    """
    try:
        if not verify_admin(user_id):
            raise HTTPException(status_code=403, detail="Admin access required")

        # Get dashboard data and extract field edit patterns
        dashboard_data = analytics_tracker.get_dashboard_data(time_range=range)
        field_edit_patterns = dashboard_data.get("field_edit_patterns", {})

        return {"success": True, "field_edit_patterns": field_edit_patterns}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting field edits: {str(e)}")


@app.get("/api/admin/stages/all")
async def get_admin_all_stages(
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    """Get all stage snapshots across all projects for drift analysis."""
    try:
        if not verify_admin(user_id):
            raise HTTPException(status_code=403, detail="Admin access required")

        repo = ProjectRepository(db)
        snapshots = await repo.get_all_stage_snapshots()

        # Group by project (Project is eager-loaded via selectinload)
        projects_map: dict = {}
        for snap in snapshots:
            pid = snap.project_id
            if pid not in projects_map:
                project = snap.project
                projects_map[pid] = {
                    "project_id": pid,
                    "project_name": project.title if project else pid,
                    "created_at": project.created_at.isoformat() if project else None,
                    "stages": {},
                }
            projects_map[pid]["stages"][str(snap.stage_id)] = {
                "ai_version": snap.ai_version,
                "human_version": snap.human_version,
            }

        return {"projects": list(projects_map.values())}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting stage snapshots: {str(e)}")


# ============================================================================
# Quality Log API
# ============================================================================

@app.get("/api/quality-log/projects/list")
async def get_quality_log_projects():
    import sqlite3

    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT project_id, COUNT(*) as event_count "
        "FROM quality_log GROUP BY project_id ORDER BY MAX(id) DESC",
    ).fetchall()
    conn.close()

    return {"projects": [dict(r) for r in rows]}


@app.get("/api/quality-log/stats/summary")
async def get_quality_log_summary():
    import sqlite3

    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row

    # Total eval events and pass/fail counts
    eval_rows = conn.execute(
        "SELECT scores FROM quality_log WHERE event = 'eval'"
    ).fetchall()

    total_evals = len(eval_rows)
    passed = 0
    total_score = 0.0
    scored_count = 0
    for r in eval_rows:
        if r["scores"]:
            try:
                scores = json.loads(r["scores"])
                if scores.get("passed"):
                    passed += 1
                if scores.get("composite_score") is not None:
                    total_score += scores["composite_score"]
                    scored_count += 1
            except (json.JSONDecodeError, TypeError):
                pass

    # Retry rate: projects where outline or storyboard had attempt > 1
    retry_rows = conn.execute(
        "SELECT DISTINCT project_id FROM quality_log "
        "WHERE event = 'generate' AND attempt > 1"
    ).fetchall()
    total_projects = conn.execute(
        "SELECT COUNT(DISTINCT project_id) as cnt FROM quality_log"
    ).fetchone()["cnt"]

    conn.close()

    pass_rate = (passed / total_evals) if total_evals > 0 else 0
    avg_score = (total_score / scored_count) if scored_count > 0 else 0
    retry_rate = (len(retry_rows) / total_projects) if total_projects > 0 else 0

    return {
        "pass_rate": round(pass_rate, 2),
        "retry_rate": round(retry_rate, 2),
        "avg_score": round(avg_score, 1),
        "total_evals": total_evals,
        "total_projects": total_projects,
    }


@app.get("/api/quality-log/{project_id}")
async def get_quality_log(project_id: str):
    import sqlite3

    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM quality_log WHERE project_id = ? ORDER BY id",
        (project_id,),
    ).fetchall()
    conn.close()

    entries = []
    for r in rows:
        entry = dict(r)
        for json_field in ("parsed_output", "scores"):
            if entry.get(json_field):
                try:
                    entry[json_field] = json.loads(entry[json_field])
                except (json.JSONDecodeError, TypeError):
                    pass
        entries.append(entry)

    return {"project_id": project_id, "entries": entries}


@app.get("/api/quality-log/{project_id}/chains")
async def get_quality_log_chains(project_id: str):
    import sqlite3

    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM quality_log WHERE project_id = ? ORDER BY id",
        (project_id,),
    ).fetchall()
    conn.close()

    entries_by_id: dict[int, dict] = {}
    for r in rows:
        entry = dict(r)
        for json_field in ("parsed_output", "scores"):
            if entry.get(json_field):
                try:
                    entry[json_field] = json.loads(entry[json_field])
                except (json.JSONDecodeError, TypeError):
                    pass
        entries_by_id[entry["id"]] = entry

    children_map: dict[int, list[int]] = {}
    roots: list[int] = []
    for eid, entry in entries_by_id.items():
        pid = entry["parent_id"]
        if pid is None:
            roots.append(eid)
        else:
            children_map.setdefault(pid, []).append(eid)

    def walk_chain(root_id: int) -> list[dict]:
        result = [entries_by_id[root_id]]
        for child_id in children_map.get(root_id, []):
            result.extend(walk_chain(child_id))
        return result

    stage_chains: dict[str, list[list[dict]]] = {}
    for root_id in roots:
        chain = walk_chain(root_id)
        stage = chain[0]["stage"]
        stage_chains.setdefault(stage, []).append(chain)

    stage_order = ["outline", "storyboard"]
    ordered_stages = sorted(
        stage_chains.keys(),
        key=lambda s: stage_order.index(s) if s in stage_order else 999,
    )

    stages = []
    for stage_name in ordered_stages:
        chains = stage_chains[stage_name]
        stages.append({
            "stage": stage_name,
            "chains": [{"root_id": c[0]["id"], "events": c} for c in chains],
        })

    return {"project_id": project_id, "stages": stages}


@app.get("/api/quality-log/stats/overrides")
async def get_override_stats():
    import sqlite3

    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT stage, scope, COUNT(*) as count "
        "FROM quality_log WHERE event = 'override' "
        "GROUP BY stage, scope ORDER BY count DESC",
    ).fetchall()
    conn.close()

    return {"overrides": [dict(r) for r in rows]}


# ============================================================================
# Gold Set Evaluation Endpoints (dev tool)
# ============================================================================

# In-memory eval job status: {name: {"status": "running"|"done"|"error", "error": str|None}}
_eval_jobs: dict = {}


@app.get("/api/offline-prompt-bench/gold-sets")
async def list_gold_sets():
    """List available gold sets."""
    from app.services.offline_prompt_bench_gold import list_gold_sets as _list
    return {"gold_sets": _list()}


@app.get("/api/offline-prompt-bench/models")
async def list_eval_models():
    """List available models for eval. Only shows models with configured API keys."""
    import os
    models = [{"id": "gpt-4o", "label": "GPT-4o"}]
    if os.getenv("ANTHROPIC_API_KEY"):
        models.append({"id": "claude-sonnet-4-20250514", "label": "Claude Sonnet 4"})
    return {"models": models}


@app.get("/api/offline-prompt-bench/gold-set/{name}")
async def get_gold_set_eval(name: str, model: str = None):
    """Get cached gold set evaluation result."""
    from app.services.offline_prompt_bench_gold import get_cached_eval, load_gold_set, list_cached_models

    available = list_cached_models(name)

    if model:
        cached = get_cached_eval(name, model)
    elif available:
        cached = get_cached_eval(name, available[0]["model"])
    else:
        cached = None

    if cached:
        return {"success": True, "cached": True, "data": cached, "available_models": available}

    try:
        gold = load_gold_set(name)
        return {"success": True, "cached": False, "data": {"gold": gold, "gold_set_name": name}, "available_models": available}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Gold set '{name}' not found")


@app.get("/api/offline-prompt-bench/gold-set/{name}/status")
async def get_eval_status(name: str, model: str = None):
    """Poll eval job status. Returns completed stages for progressive loading."""
    job_key = f"{name}:{model or 'gpt-4o'}"
    job = _eval_jobs.get(job_key)
    if not job:
        return {"status": "idle"}
    return job


@app.post("/api/offline-prompt-bench/gold-set/{name}")
async def run_gold_set_eval(name: str, request: Request):
    """Start gold set evaluation in background thread. Poll /status for progress."""
    import asyncio
    from app.services.offline_prompt_bench_gold import run_eval, load_gold_set
    try:
        load_gold_set(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Gold set '{name}' not found")

    # Parse optional model from request body
    model = None
    try:
        body = await request.json()
        model = body.get("model")
    except Exception:
        pass

    # Key by name:model so different models can run concurrently
    job_key = f"{name}:{model or 'gpt-4o'}"
    if _eval_jobs.get(job_key, {}).get("status") == "running":
        return {"success": True, "message": "Already running"}

    _eval_jobs[job_key] = {"status": "running", "error": None,
                           "completed_stages": [], "current_stage": "director_and_path_b"}

    def _on_stage_done(stage_name, _partial_result):
        """Callback from run_eval — updates job status with completed stage."""
        job = _eval_jobs.get(job_key)
        if job:
            stages = job.get("completed_stages", [])
            stages.append(stage_name)
            next_stages = {
                "director_and_path_b": "research",
                "research": "path_a",
                "path_a": None,
            }
            job["completed_stages"] = stages
            job["current_stage"] = next_stages.get(stage_name)

    def _run():
        try:
            run_eval(name, force=True, model=model, on_stage_done=_on_stage_done)
            _eval_jobs[job_key] = {"status": "done", "error": None,
                                   "completed_stages": ["director_and_path_b", "research", "path_a"],
                                   "current_stage": None}
        except Exception as e:
            _eval_jobs[job_key] = {"status": "error", "error": str(e),
                                   "completed_stages": _eval_jobs.get(job_key, {}).get("completed_stages", []),
                                   "current_stage": None}

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _run)

    return {"success": True, "message": "Eval started"}


@app.post("/api/offline-prompt-bench/gold-set/ingest")
async def ingest_gold_set_endpoint(request: Request):
    """Ingest raw Gemini JSON as a new gold set."""
    try:
        raw_json = await request.json()
    except Exception:
        return JSONResponse({"success": False, "detail": "Invalid JSON"}, status_code=400)

    required = ["brief", "outline", "storyboard"]
    for field in required:
        if field not in raw_json:
            return JSONResponse(
                {"success": False, "detail": f"Missing required field: {field}"},
                status_code=400,
            )

    try:
        from app.services.offline_prompt_bench_gold import ingest_gold_set
        result = ingest_gold_set(raw_json)
        return {"success": True, "slug": result["slug"], "gold_set": result["gold_set"]}
    except Exception as e:
        return JSONResponse({"success": False, "detail": str(e)}, status_code=500)


# --- Batch eval endpoints ---

@app.post("/api/offline-prompt-bench/batch")
async def start_batch_eval(request: Request):
    """Kick off batch evaluation in background."""
    from app.services.offline_prompt_bench import get_batch_status, run_batch_eval
    import asyncio

    status = get_batch_status()
    if status["status"] == "running":
        return {"success": True, "message": "Batch already running", "status": status}

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass  # empty body = run all

    names = body.get("names", None)  # None = all gold sets
    force = body.get("force", False)

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, lambda: run_batch_eval(names=names, force=force))

    return {"success": True, "message": "Batch eval started"}


@app.get("/api/offline-prompt-bench/batch/status")
async def batch_eval_status():
    """Poll batch eval progress."""
    from app.services.offline_prompt_bench import get_batch_status
    return get_batch_status()


@app.get("/api/offline-prompt-bench/batch/report")
async def batch_eval_report():
    """Return latest batch report."""
    from app.services.offline_prompt_bench import get_batch_report
    report = get_batch_report()
    if report is None:
        return {"success": False, "detail": "No batch report available"}
    return {"success": True, "report": report}


# ---------------------------------------------------------------------------
# RAG — Document Upload & Management
# ---------------------------------------------------------------------------

@app.post("/api/project/{project_id}/documents/upload")
async def upload_document(
    project_id: str,
    file: UploadFile = FastAPIFile(...),
    _project=Depends(_owned_project_access),
):
    """Upload a PDF document for RAG retrieval."""
    from app.services.rag.store import RAGStore
    import tempfile

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Save to temp file, then process
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        store = RAGStore(project_id)
        result = store.add_pdf(tmp_path)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.post("/api/project/{project_id}/documents/url")
async def add_document_url(
    project_id: str,
    request: Request,
    _project=Depends(_owned_project_access),
):
    """Fetch and ingest a web URL for RAG retrieval."""
    from app.services.rag.store import RAGStore

    body = await request.json()
    url = body.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    try:
        store = RAGStore(project_id)
        result = store.add_url(url)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/project/{project_id}/documents")
async def list_documents(project_id: str, _project=Depends(_owned_project_access)):
    """List all ingested documents for a project."""
    from app.services.rag.store import RAGStore

    store = RAGStore(project_id)
    return {"success": True, "documents": store.list_documents(),
            "total_chunks": store.chunk_count}


@app.delete("/api/project/{project_id}/documents")
async def clear_documents(project_id: str, _project=Depends(_owned_project_access)):
    """Clear all documents and embeddings for a project."""
    from app.services.rag.store import RAGStore

    store = RAGStore(project_id)
    store.clear()
    return {"success": True, "message": "All documents cleared"}


@app.post("/api/project/{project_id}/documents/query")
async def query_documents(
    project_id: str,
    request: Request,
    _project=Depends(_owned_project_access),
):
    """Query documents using RAG retrieval (for testing/debugging)."""
    from app.services.rag.store import RAGStore

    body = await request.json()
    question = body.get("question")
    top_k = body.get("top_k", 5)
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    store = RAGStore(project_id)
    results = store.query(question, top_k=top_k)
    return {"success": True, "results": results}

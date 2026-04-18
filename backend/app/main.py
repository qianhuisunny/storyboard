from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Request, UploadFile, File as FastAPIFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.services.orchestrator import orchestrator
from app.services.edit_tracker import edit_tracker
from app.services.analytics import analytics_tracker
from app.services.processing_log import get_store as get_processing_log_store

from app.utils.json_extractor import extract_json_from_text, convert_to_story_format
from app.utils.file_extraction import extract_text_from_pdf, extract_text_from_docx, extract_text_from_html
from app.db import get_db, init_db, ProjectRepository
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
import json
import os
import httpx
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


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


@app.get("/api/test")
async def test_endpoint():
    return {
        "success": True,
        "data": "This is a test endpoint",
        "timestamp": "2025-01-20",
    }


class ProjectRequest(BaseModel):
    projectId: str
    typeId: int
    typeName: str
    userInput: str
    userId: Optional[str] = None  # Clerk user ID for ownership


@app.post("/api/create-project")
async def create_project(request: ProjectRequest, db: AsyncSession = Depends(get_db)):
    """Create a new project in SQLite."""
    try:
        repo = ProjectRepository(db)
        project = await repo.create_project(
            project_id=request.projectId,
            user_id=request.userId or "",
            title=request.userInput[:100] if request.userInput else "",
            type_id=request.typeId,
            type_name=request.typeName,
            user_input=request.userInput,
        )

        # Also create project directory for uploads/links (still on filesystem)
        project_dir = (
            Path(__file__).parent.parent.parent
            / "data"
            / f"project_{request.projectId}"
        )
        project_dir.mkdir(parents=True, exist_ok=True)

        return {
            "success": True,
            "projectId": request.projectId,
            "projectDir": str(project_dir),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating project: {str(e)}")


@app.get("/api/project/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Get project data by ID — tries DB first, falls back to JSON for legacy projects."""
    try:
        repo = ProjectRepository(db)
        project = await repo.get_project(project_id)

        if project:
            # DB project
            project_data = {
                "id": project.id,
                "userId": project.user_id,
                "type": project.type_id,
                "typeName": project.type_name,
                "userInput": project.user_input,
                "createdAt": project.created_at.isoformat() if project.created_at else None,
                "lastUpdated": project.updated_at.isoformat() if project.updated_at else None,
                "storyboard": None,
            }
            return {"success": True, "project": project_data, "stories": []}

        # Fallback: legacy JSON project
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project not found")

        project_files = list(project_dir.glob("project_type*.json"))
        if not project_files:
            raise HTTPException(status_code=404, detail="Project file not found")

        with open(project_files[0], "r") as f:
            project_data = json.load(f)

        stories = []
        if "stories" in project_data and project_data["stories"]:
            for story_name in project_data["stories"]:
                story_file = project_dir / f"{story_name}.json"
                if story_file.exists():
                    with open(story_file, "r") as f:
                        stories.append(json.load(f))

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
async def save_stories_to_project(project_id: str, request: SaveStoriesRequest):
    """Save extracted stories to a project"""
    try:
        # Find project directory
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project not found")

        # Save stories to individual files
        story_files = []
        for i, story in enumerate(request.stories):
            story_filename = f"story_{i+1}"
            story_file = project_dir / f"{story_filename}.json"

            with open(story_file, "w") as f:
                json.dump(story, f, indent=2)

            story_files.append(story_filename)

        # Update project file with story references
        project_files = list(project_dir.glob("project_type*.json"))
        if project_files:
            with open(project_files[0], "r") as f:
                project_data = json.load(f)

            project_data["stories"] = story_files
            project_data["lastUpdated"] = datetime.now().isoformat()

            with open(project_files[0], "w") as f:
                json.dump(project_data, f, indent=2)

        return {
            "success": True,
            "message": f"Saved {len(request.stories)} stories to project",
            "story_files": story_files,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving stories: {str(e)}")


# ============================================================
# NEW STAGE-BASED ENDPOINTS (Human-in-the-Loop Workflow)
# ============================================================


class RunStageRequest(BaseModel):
    user_input: str
    previous_stages: Optional[dict] = {}
    feedback: Optional[str] = None
    user_id: Optional[str] = None
    video_type: Optional[str] = "Product Release"


class ApproveStageRequest(BaseModel):
    stage: str
    content: str
    user_id: Optional[str] = None


class RecordEditRequest(BaseModel):
    stage: str
    content: str
    edit_time_seconds: Optional[float] = None


@app.post("/api/project/{project_id}/stage/{stage}/run")
async def run_stage(project_id: str, stage: str, request: RunStageRequest):
    """
    Run a specific stage of the storyboard pipeline.

    Stages: brief, outline, panels, draft, polish
    """
    try:
        valid_stages = ["brief", "outline", "panels", "draft", "polish"]
        if stage not in valid_stages:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid stage. Must be one of: {valid_stages}"
            )

        # Run the stage through the orchestrator
        result = await orchestrator.run_stage(
            stage=stage,
            user_input=request.user_input,
            previous_stages=request.previous_stages or {},
            feedback=request.feedback,
            video_type=request.video_type,
            project_id=project_id,
        )

        # Record the AI generation in edit tracker
        # Convert ai_content to string if it's a dict
        ai_content = result["ai_content"]
        if isinstance(ai_content, dict) or isinstance(ai_content, list):
            ai_content = json.dumps(ai_content, indent=2)

        edit_tracker.record_ai_generation(
            project_id=project_id,
            stage=stage,
            ai_content=ai_content,
            sources=result.get("sources", []),
            user_id=request.user_id,
        )

        return {
            "success": True,
            "stage": stage,
            "ai_content": ai_content,  # Use the stringified version
            "sources": result.get("sources", []),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running stage: {str(e)}")


@app.post("/api/project/{project_id}/stage/{stage}/approve")
async def approve_stage(project_id: str, stage: str, request: ApproveStageRequest):
    """Approve a stage and record the final content."""
    try:
        # Record the approval
        edit_tracker.record_approval(
            project_id=project_id,
            stage=stage,
            approved_content=request.content,
        )

        return {
            "success": True,
            "stage": stage,
            "message": f"Stage '{stage}' approved successfully",
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error approving stage: {str(e)}")


@app.post("/api/project/{project_id}/stage/{stage}/edit")
async def record_edit(project_id: str, stage: str, request: RecordEditRequest):
    """Record a human edit to a stage."""
    try:
        edit_summary = edit_tracker.record_human_edit(
            project_id=project_id,
            stage=stage,
            human_content=request.content,
            edit_time_seconds=request.edit_time_seconds,
        )

        return {
            "success": True,
            "stage": stage,
            "edit_summary": edit_summary.model_dump(),
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recording edit: {str(e)}")


@app.post("/api/project/{project_id}/stage/{stage}/regenerate")
async def regenerate_stage(project_id: str, stage: str, request: RunStageRequest):
    """Regenerate a stage with user feedback."""
    try:
        if not request.feedback:
            raise HTTPException(status_code=400, detail="Feedback is required for regeneration")

        # Run the stage with feedback
        result = await orchestrator.run_stage(
            stage=stage,
            user_input=request.user_input,
            previous_stages=request.previous_stages or {},
            feedback=request.feedback,
        )

        # Convert ai_content to string if it's a dict
        ai_content = result["ai_content"]
        if isinstance(ai_content, dict) or isinstance(ai_content, list):
            ai_content = json.dumps(ai_content, indent=2)

        # Record the regeneration
        edit_tracker.record_regeneration(
            project_id=project_id,
            stage=stage,
            feedback=request.feedback,
            new_ai_content=ai_content,
            sources=result.get("sources", []),
        )

        return {
            "success": True,
            "stage": stage,
            "ai_content": ai_content,
            "sources": result.get("sources", []),
            "regenerated": True,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error regenerating stage: {str(e)}")


@app.get("/api/project/{project_id}/stage/{stage}")
async def get_stage_data(project_id: str, stage: str):
    """Get the current data for a specific stage."""
    try:
        edit_log = edit_tracker.load_edit_log(project_id)

        if not edit_log or stage not in edit_log.stages:
            return {
                "success": True,
                "stage": stage,
                "data": None,
                "message": "No data for this stage yet",
            }

        stage_data = edit_log.stages[stage]

        return {
            "success": True,
            "stage": stage,
            "data": stage_data,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting stage data: {str(e)}")


@app.get("/api/project/{project_id}/edit-log")
async def get_edit_log(project_id: str):
    """Get the complete edit log for analytics."""
    try:
        edit_log = edit_tracker.load_edit_log(project_id)

        if not edit_log:
            return {
                "success": True,
                "data": None,
                "message": "No edit log found for this project",
            }

        return {
            "success": True,
            "data": edit_log.model_dump(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting edit log: {str(e)}")


@app.get("/api/project/{project_id}/analytics")
async def get_project_analytics(project_id: str):
    """Get analytics summary for prompt improvement."""
    try:
        summary = edit_tracker.get_analytics_summary(project_id)

        return {
            "success": True,
            "analytics": summary,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting analytics: {str(e)}")


# ============================================================
# PROCESSING LOG ENDPOINT
# ============================================================


@app.get("/api/project/{project_id}/processing-logs")
async def get_processing_logs(project_id: str, since_id: Optional[str] = None):
    """
    Get processing logs (LLM requests/responses) for a project.

    Args:
        project_id: The project ID
        since_id: Optional entry ID to get logs since (for polling)

    Returns:
        List of processing log entries
    """
    try:
        store = get_processing_log_store()
        entries = store.get_entries(project_id, since_id)
        return {
            "success": True,
            "data": entries,
            "count": len(entries),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error getting processing logs: {str(e)}"
        )


@app.delete("/api/project/{project_id}/processing-logs")
async def clear_processing_logs(project_id: str):
    """
    Clear all processing logs for a project.
    Called when starting a fresh session to avoid accumulation from old attempts.
    """
    try:
        store = get_processing_log_store()
        store.clear(project_id)
        return {"success": True, "message": "Processing logs cleared"}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error clearing processing logs: {str(e)}"
        )


# ============================================================
# NEW EVENT-BASED ENDPOINTS (State Machine Pipeline)
# ============================================================


class EventRequest(BaseModel):
    """Request body for event-based pipeline."""
    event: str  # submit, approve, reject, refine
    payload: Optional[dict] = None


class IntakeFormRequest(BaseModel):
    """Request body for starting the pipeline."""
    intake_form: dict


class ChatBriefRequest(BaseModel):
    """Request body for chat-based content spine extraction."""
    messages: list
    fields_so_far: dict
    onboarding: dict


@app.post("/api/project/{project_id}/event")
async def process_pipeline_event(project_id: str, request: EventRequest):
    """
    Process a state machine event for the storyboard pipeline.

    Events:
    - submit: Start pipeline with intake_form in payload
    - approve: Approve current stage (Gate 1 or Gate 2)
    - reject: Reject with feedback in payload
    - refine: Request refinement with feedback in payload

    Example payloads:
    - submit: {"intake_form": {...}}
    - reject: {"feedback": "Please add more detail about..."}
    - refine: {"feedback": "Can we make screen 3 shorter?"}
    """
    import logging
    import traceback
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)

    logger.info(f"Processing event: project_id={project_id}, event={request.event}")

    try:
        result = await orchestrator.process_event(
            project_id=project_id,
            event=request.event,
            payload=request.payload
        )

        if not result.get("success", True):
            logger.error(f"Event failed: {result.get('error')}")
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Exception in process_pipeline_event: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing event: {str(e)}")


# [HACKATHON Apr18] Removed /rerun-research and /research-section endpoints —
# research agent deleted. Frontend calls to these will 404.


@app.post("/api/project/{project_id}/chat-brief")
async def chat_brief(project_id: str, request: ChatBriefRequest):
    """Phase 2 chat-based content spine extraction. Direct LLM call, no agent class."""
    try:
        # Load system prompt
        prompt_path = Path(__file__).parent.parent.parent / "prompts" / "chat_brief_prompt.md"
        if not prompt_path.exists():
            raise HTTPException(status_code=500, detail="Chat brief prompt not found")
        system_prompt = prompt_path.read_text(encoding="utf-8")

        # Build user prompt with context
        fields_summary = "\n".join(
            f"- {k}: {v.get('value', v) if isinstance(v, dict) else v}"
            for k, v in request.fields_so_far.items()
            if (v.get("value") if isinstance(v, dict) else v)
        )

        conversation = "\n".join(
            f"{'AI' if m.get('role') == 'ai' else 'User'}: {m.get('content', '')}"
            for m in request.messages
        )

        user_prompt = f"""## ONBOARDING CONTEXT
- Topic: {request.onboarding.get('topic', '')}
- Duration: {request.onboarding.get('duration', 300)} seconds
- Audience: {request.onboarding.get('audience', '')}

## COLLECTED BRIEF FIELDS
{fields_summary or '(none yet)'}

## CONVERSATION SO FAR
{conversation}

Respond with the next JSON message."""

        # Direct Anthropic API call
        import anthropic
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.7,
            max_tokens=1000,
        )

        response_text = response.content[0].text

        # Parse JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if not json_match:
            return {"reply": "I'm having trouble processing that. Could you try again?", "done": False, "extracted_fields": None}

        parsed = json.loads(json_match.group())
        return {
            "reply": parsed.get("reply", ""),
            "done": parsed.get("done", False),
            "extracted_fields": parsed.get("extracted_fields"),
        }

    except json.JSONDecodeError:
        return {"reply": "I had trouble understanding that. Could you rephrase?", "done": False, "extracted_fields": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat brief error: {str(e)}")


@app.post("/api/project/{project_id}/start")
async def start_pipeline(project_id: str, request: IntakeFormRequest):
    """
    Start the storyboard pipeline with an intake form.

    This is a convenience endpoint that wraps the submit event.
    After calling this, the project will be at gate1 ready for review.
    """
    try:
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
async def approve_current_stage(project_id: str):
    """
    Approve the current stage (Gate 1, Gate 2, or Review).

    This is a convenience endpoint that sends an approve event.
    """
    try:
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
async def reject_current_stage(project_id: str, request: FeedbackRequest):
    """
    Reject the current stage with feedback.

    This triggers a revision loop. The agent will regenerate
    based on the feedback and return to the same gate.
    """
    try:
        result = await orchestrator.process_event(
            project_id=project_id,
            event="reject",
            payload={"feedback": request.feedback}
        )

        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rejecting stage: {str(e)}")


@app.post("/api/project/{project_id}/refine")
async def refine_storyboard(project_id: str, request: FeedbackRequest):
    """
    Request optional refinement of the storyboard.

    Only valid in the review phase (after storyboard generation).
    """
    try:
        result = await orchestrator.process_event(
            project_id=project_id,
            event="refine",
            payload={"feedback": request.feedback}
        )

        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refining storyboard: {str(e)}")


@app.post("/api/project/{project_id}/go-back/{target}")
async def go_back_to_stage(project_id: str, target: str):
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
async def get_pipeline_state(project_id: str):
    """
    Get the current pipeline state for a project.

    Returns:
    - phase: Current phase (intake, gate1, gate2, review, done, etc.)
    - state: Full state object with all data
    - available_events: What events can be sent next
    """
    try:
        from app.services.state import StateManager

        manager = StateManager(project_id)
        state = manager.load()

        # Determine available events based on current phase
        available_events = {
            "intake": ["submit", "submit_knowledge_share"],
            "brief_round1": ["round1_confirm"],
            "brief_round2": ["round2_confirm"],
            "brief_round3": ["generate_content_spine", "round3_confirm"],
            "brief_review": ["brief_approve", "edit_brief"],
            "gate1": ["approve", "reject"],
            "gate2": ["approve", "run_research", "reject", "go_back_gate1"],
            "outline_research": ["approve"],
            "review": ["approve", "refine", "go_back_gate1", "go_back_gate2"],
            "done": ["restart"],
        }.get(state.phase, [])

        return {
            "success": True,
            "project_id": project_id,
            "phase": state.phase,
            "available_events": available_events,
            "state": {
                "brief_locked": state.brief_locked,
                "outline_locked": state.outline_locked,
                "revision_count_gate1": state.revision_count_gate1,
                "revision_count_gate2": state.revision_count_gate2,
                "max_revisions": state.max_revisions,
                "has_intake_form": state.intake_form is not None,
                "has_story_brief": state.story_brief is not None,
                "has_screen_outline": state.screen_outline is not None,
                "has_storyboard": state.storyboard is not None,
            },
            "data": {
                "intake_form": state.intake_form,
                "story_brief": state.story_brief,
                "screen_outline": state.screen_outline,
                "storyboard": state.storyboard,
                "evidence_research": state.evidence_research,
                # RESEARCH DISABLED: "research_details": state.research_details,
                "outline_grade": state.outline_grade,
                "storyboard_grade": state.storyboard_grade,
                "cross_stage_grade": state.cross_stage_grade,
            },
            "revision_history": [r.model_dump() for r in state.revision_history],
        }

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
async def save_stages(project_id: str, request: SaveStagesRequest, db: AsyncSession = Depends(get_db)):
    """Save all stage data for a project (auto-save endpoint)."""
    try:
        repo = ProjectRepository(db)
        project = await repo.get_project(project_id)

        if project:
            # DB path: save each stage as a snapshot
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
                    )

            # Save currentStageId and stageStatuses in pipeline_state's state_data
            ps = await repo.get_pipeline_state(project_id)
            if ps:
                state_data = repo.parse_state_data(ps)
                state_data["currentStageId"] = request.currentStageId
                state_data["stageStatuses"] = [s.model_dump() for s in request.stageStatuses]
                await repo.update_pipeline_state(project_id, ps.phase, ps.status, state_data)

            await repo.update_project_timestamp(project_id)
            now = datetime.now().isoformat()
            return {"success": True, "message": "Stages saved successfully", "lastSaved": now}

        # Fallback: legacy JSON
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        if not project_dir.exists():
            project_dir.mkdir(parents=True, exist_ok=True)

        stages_data = {
            "stages": request.stages,
            "currentStageId": request.currentStageId,
            "stageStatuses": [s.model_dump() for s in request.stageStatuses],
            "lastSaved": datetime.now().isoformat(),
        }

        stages_file = project_dir / "stages.json"
        with open(stages_file, "w") as f:
            json.dump(stages_data, f, indent=2)

        return {
            "success": True,
            "message": "Stages saved successfully",
            "lastSaved": stages_data["lastSaved"],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving stages: {str(e)}")


@app.get("/api/project/{project_id}/stages")
async def load_stages(project_id: str, db: AsyncSession = Depends(get_db)):
    """Load all stage data for a project."""
    try:
        repo = ProjectRepository(db)
        project = await repo.get_project(project_id)

        if project:
            # DB path
            snapshots = await repo.get_all_snapshots(project_id)
            ps = await repo.get_pipeline_state(project_id)
            state_data = repo.parse_state_data(ps) if ps else {}

            stages = {}
            for snap in snapshots:
                stages[str(snap.stage_id)] = {
                    "aiVersion": snap.ai_version,
                    "humanVersion": snap.human_version,
                }

            return {
                "success": True,
                "stages": stages if stages else None,
                "currentStageId": state_data.get("currentStageId", 1),
                "stageStatuses": state_data.get("stageStatuses"),
                "lastSaved": project.updated_at.isoformat() if project.updated_at else None,
            }

        # Fallback: legacy JSON
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        stages_file = project_dir / "stages.json"

        if not stages_file.exists():
            return {
                "success": True,
                "stages": None,
                "currentStageId": 1,
                "stageStatuses": None,
                "lastSaved": None,
            }

        with open(stages_file, "r") as f:
            stages_data = json.load(f)

        return {
            "success": True,
            "stages": stages_data.get("stages"),
            "currentStageId": stages_data.get("currentStageId", 1),
            "stageStatuses": stages_data.get("stageStatuses"),
            "lastSaved": stages_data.get("lastSaved"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading stages: {str(e)}")


def _scan_legacy_projects(data_dir: Path, user_id: str, exclude_ids: set) -> list:
    """Scan filesystem for legacy JSON projects not yet in the DB."""
    projects = []
    if not data_dir.exists():
        return projects

    for project_dir in data_dir.iterdir():
        if not project_dir.is_dir() or not project_dir.name.startswith("project_"):
            continue

        project_id = project_dir.name.replace("project_", "")
        if project_id in exclude_ids:
            continue

        project_files = list(project_dir.glob("project_type*.json"))
        if not project_files:
            continue

        try:
            with open(project_files[0], "r") as f:
                project_data = json.load(f)

            if project_data.get("userId") != user_id:
                continue

            stages_file = project_dir / "stages.json"
            current_stage = 1
            progress = 0
            last_updated = project_data.get("lastUpdated") or project_data.get("createdAt")

            if stages_file.exists():
                with open(stages_file, "r") as f:
                    stages_data = json.load(f)
                    current_stage = stages_data.get("currentStageId", 1)
                    last_updated = stages_data.get("lastSaved") or last_updated
                    stage_statuses = stages_data.get("stageStatuses", [])
                    approved_count = sum(
                        1 for s in stage_statuses if s.get("status") == "approved"
                    )
                    progress = int((approved_count / 4) * 100)

            projects.append({
                "id": project_data.get("id"),
                "typeName": project_data.get("typeName"),
                "userInput": project_data.get("userInput", "")[:100],
                "createdAt": project_data.get("createdAt"),
                "lastUpdated": last_updated,
                "currentStage": current_stage,
                "progress": progress,
            })
        except (json.JSONDecodeError, KeyError):
            continue

    return projects


@app.get("/api/projects")
async def list_user_projects(user_id: str, db: AsyncSession = Depends(get_db)):
    """List all projects for a specific user."""
    try:
        repo = ProjectRepository(db)
        db_projects = await repo.list_projects(user_id)

        projects = []

        # DB projects
        for p in db_projects:
            ps = await repo.get_pipeline_state(p.id)
            state_data = repo.parse_state_data(ps) if ps else {}
            stage_statuses = state_data.get("stageStatuses", [])
            approved_count = sum(1 for s in stage_statuses if s.get("status") == "approved")
            progress = int((approved_count / 4) * 100) if stage_statuses else 0

            projects.append({
                "id": p.id,
                "typeName": p.type_name,
                "userInput": (p.user_input or "")[:100],
                "createdAt": p.created_at.isoformat() if p.created_at else None,
                "lastUpdated": p.updated_at.isoformat() if p.updated_at else None,
                "currentStage": state_data.get("currentStageId", 1),
                "progress": progress,
            })

        # Also scan legacy JSON projects on filesystem
        data_dir = Path(__file__).parent.parent.parent / "data"
        db_project_ids = {p.id for p in db_projects}
        projects.extend(_scan_legacy_projects(data_dir, user_id, db_project_ids))

        projects.sort(key=lambda p: p.get("lastUpdated") or "", reverse=True)
        return {"success": True, "projects": projects}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing projects: {str(e)}")


@app.delete("/api/project/{project_id}")
async def delete_project(project_id: str, user_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a project (only if owned by user)."""
    try:
        import shutil
        repo = ProjectRepository(db)
        project = await repo.get_project(project_id)

        if project:
            if project.user_id != user_id:
                raise HTTPException(status_code=403, detail="Not authorized to delete this project")
            await repo.delete_project(project_id)
        else:
            # Fallback: legacy JSON
            project_dir = (
                Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
            )
            if not project_dir.exists():
                raise HTTPException(status_code=404, detail="Project not found")
            project_files = list(project_dir.glob("project_type*.json"))
            if project_files:
                with open(project_files[0], "r") as f:
                    project_data = json.load(f)
                    if project_data.get("userId") != user_id:
                        raise HTTPException(status_code=403, detail="Not authorized to delete this project")

        # Also delete filesystem directory (uploads, links)
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
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
async def upload_file_to_project(project_id: str, file: UploadFile = FastAPIFile(...)):
    """
    Upload a file to a project and extract its text content.

    Supported formats: PDF, TXT, MD, DOC, DOCX
    Files are saved to data/project_{id}/uploads/
    """
    try:
        # Find or create project directory
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        if not project_dir.exists():
            project_dir.mkdir(parents=True, exist_ok=True)

        # Create uploads subdirectory
        uploads_dir = project_dir / "uploads"
        uploads_dir.mkdir(exist_ok=True)

        # Validate file type
        allowed_extensions = [".pdf", ".txt", ".md", ".doc", ".docx"]
        file_ext = Path(file.filename or "").suffix.lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
            )

        # Save file
        file_path = uploads_dir / (file.filename or f"upload_{datetime.now().timestamp()}")
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Extract text based on file type
        extracted_text = ""
        if file_ext == ".pdf":
            extracted_text = extract_text_from_pdf(file_path)
        elif file_ext in [".txt", ".md"]:
            extracted_text = content.decode("utf-8", errors="ignore")
        elif file_ext in [".doc", ".docx"]:
            extracted_text = extract_text_from_docx(file_path)

        # Save extracted text to a companion file
        text_file = file_path.with_suffix(".extracted.txt")
        with open(text_file, "w", encoding="utf-8") as f:
            f.write(extracted_text)

        # Update project metadata with uploaded files
        project_files = list(project_dir.glob("project_type*.json"))
        if project_files:
            with open(project_files[0], "r") as f:
                project_data = json.load(f)

            if "uploadedFiles" not in project_data:
                project_data["uploadedFiles"] = []

            project_data["uploadedFiles"].append({
                "filename": file.filename,
                "path": str(file_path.relative_to(project_dir)),
                "uploadedAt": datetime.now().isoformat(),
                "size": len(content),
            })
            project_data["lastUpdated"] = datetime.now().isoformat()

            with open(project_files[0], "w") as f:
                json.dump(project_data, f, indent=2)

        return {
            "success": True,
            "filename": file.filename,
            "content": extracted_text[:50000],  # Limit to 50k chars
            "path": str(file_path.relative_to(project_dir)),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")


class FetchLinkRequest(BaseModel):
    url: str


@app.post("/api/project/{project_id}/fetch-link")
async def fetch_link_content(project_id: str, request: FetchLinkRequest):
    """
    Fetch content from a URL and save it to the project.

    Extracts text content from web pages and saves metadata.
    """
    try:
        # Find or create project directory
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        if not project_dir.exists():
            project_dir.mkdir(parents=True, exist_ok=True)

        # Create links subdirectory
        links_dir = project_dir / "links"
        links_dir.mkdir(exist_ok=True)

        # Fetch the URL content
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(
                request.url,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; Storyboard/1.0)"
                }
            )
            response.raise_for_status()

        title, text_content = extract_text_from_html(response.text)
        if not title:
            title = request.url

        # Save the extracted content
        from urllib.parse import urlparse
        parsed_url = urlparse(request.url)
        safe_filename = f"{parsed_url.netloc}_{datetime.now().timestamp()}.txt"
        content_file = links_dir / safe_filename

        with open(content_file, "w", encoding="utf-8") as f:
            f.write(f"URL: {request.url}\n")
            f.write(f"Title: {title}\n")
            f.write(f"Fetched: {datetime.now().isoformat()}\n")
            f.write(f"\n---\n\n{text_content}")

        # Update project metadata
        project_files = list(project_dir.glob("project_type*.json"))
        if project_files:
            with open(project_files[0], "r") as f:
                project_data = json.load(f)

            if "fetchedLinks" not in project_data:
                project_data["fetchedLinks"] = []

            project_data["fetchedLinks"].append({
                "url": request.url,
                "title": title,
                "path": str(content_file.relative_to(project_dir)),
                "fetchedAt": datetime.now().isoformat(),
            })
            project_data["lastUpdated"] = datetime.now().isoformat()

            with open(project_files[0], "w") as f:
                json.dump(project_data, f, indent=2)

        return {
            "success": True,
            "url": request.url,
            "title": title,
            "content": text_content[:50000],  # Limit to 50k chars
            "path": str(content_file.relative_to(project_dir)),
        }

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=400, detail=f"Request failed: {str(e)}")
    except Exception as e:
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


# ============================================================
# OBSERVABILITY ENDPOINTS (Harness Engineering Inspired)
# ============================================================

from app.services.observability import get_observability_service


class EditEventRequest(BaseModel):
    """Request body for logging an edit event."""
    stage: str  # brief, outline, draft
    edit_type: str  # field_edit, screen_add, screen_delete, regenerate, approve
    field_name: str
    screen_number: Optional[int] = None
    before_value: Optional[str] = None
    after_value: Optional[str] = None
    stage_round: int = 1
    time_since_generation_sec: Optional[float] = None


class SnapshotRequest(BaseModel):
    """Request body for creating a snapshot."""
    stage: str
    trigger: str  # ai_generation, human_save, stage_approval
    content: dict


@app.post("/api/project/{project_id}/edit-event")
async def log_edit_event(project_id: str, request: EditEventRequest):
    """
    Log a granular edit event for observability.

    Used by frontend to track every field-level change.
    """
    try:
        obs_service = get_observability_service()

        if request.edit_type == "field_edit":
            event = obs_service.log_field_edit(
                project_id=project_id,
                stage=request.stage,
                field_name=request.field_name,
                before_value=request.before_value,
                after_value=request.after_value,
                screen_number=request.screen_number,
                stage_round=request.stage_round,
                time_since_generation_sec=request.time_since_generation_sec,
            )
        elif request.edit_type == "screen_delete":
            event = obs_service.log_screen_delete(
                project_id=project_id,
                stage=request.stage,
                screen_number=request.screen_number or 0,
                screen_content={"deleted": True},
            )
        elif request.edit_type == "screen_add":
            event = obs_service.log_screen_add(
                project_id=project_id,
                stage=request.stage,
                screen_number=request.screen_number or 0,
                screen_content={"added": True},
            )
        elif request.edit_type == "regenerate":
            event = obs_service.log_regenerate(
                project_id=project_id,
                stage=request.stage,
                feedback=request.after_value,
            )
        elif request.edit_type == "approve":
            event = obs_service.log_approval(
                project_id=project_id,
                stage=request.stage,
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown edit_type: {request.edit_type}")

        return {
            "success": True,
            "event_id": event.event_id,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error logging edit event: {str(e)}")


@app.post("/api/project/{project_id}/snapshot")
async def create_snapshot(project_id: str, request: SnapshotRequest):
    """
    Create a snapshot of stage content.

    Called on AI generation and stage approval to enable diffing.
    """
    try:
        obs_service = get_observability_service()

        snapshot = obs_service.create_snapshot(
            project_id=project_id,
            stage=request.stage,
            trigger=request.trigger,
            content=request.content,
        )

        return {
            "success": True,
            "snapshot_id": snapshot.snapshot_id,
            "version": snapshot.version,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating snapshot: {str(e)}")


@app.get("/api/project/{project_id}/edit-history")
async def get_edit_history(project_id: str, stage: Optional[str] = None):
    """
    Get all edit events for a project.

    Query params:
    - stage: Filter by stage (brief, outline, draft)
    """
    try:
        obs_service = get_observability_service()
        events = obs_service.get_edit_events(project_id, stage=stage)

        return {
            "success": True,
            "events": events,
            "count": len(events),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting edit history: {str(e)}")


@app.get("/api/project/{project_id}/diff/{stage}")
async def get_stage_diff(project_id: str, stage: str):
    """
    Get diff between AI-generated and human-edited version.

    Returns first (AI) snapshot, last (human) snapshot, and all edit events.
    """
    try:
        obs_service = get_observability_service()
        diff = obs_service.get_stage_diff(project_id, stage)

        if not diff:
            return {
                "success": True,
                "diff": None,
                "message": "Not enough snapshots for diff (need at least 2)",
            }

        return {
            "success": True,
            "diff": diff,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting diff: {str(e)}")


@app.get("/api/project/{project_id}/snapshots")
async def get_snapshots(project_id: str, stage: Optional[str] = None):
    """Get all snapshots for a project."""
    try:
        obs_service = get_observability_service()
        snapshots = obs_service.get_snapshots(project_id, stage=stage)

        return {
            "success": True,
            "snapshots": snapshots,
            "count": len(snapshots),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting snapshots: {str(e)}")


@app.get("/api/analytics/field-patterns")
async def get_field_patterns(
    range: str = "7d",
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Get aggregated field edit patterns across all projects.

    For populating the "Field Edit Patterns" dashboard card.
    """
    try:
        obs_service = get_observability_service()
        analytics = obs_service.compute_cross_project_analytics(time_range=range)

        return {
            "success": True,
            "time_range": range,
            "total_projects": analytics.total_projects,
            "stage_edit_rates": analytics.stage_edit_rates,
            "field_edit_frequency": analytics.field_edit_frequency,
            "semantic_patterns": analytics.semantic_patterns,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting field patterns: {str(e)}")


@app.get("/api/analytics/prompt-signals")
async def get_prompt_signals(
    range: str = "7d",
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Get prompt improvement recommendations based on edit patterns.

    Returns actionable signals for improving agent prompts.
    """
    try:
        obs_service = get_observability_service()
        analytics = obs_service.compute_cross_project_analytics(time_range=range)

        return {
            "success": True,
            "time_range": range,
            "signals": [s.to_dict() for s in analytics.prompt_improvement_signals],
            "revision_metrics": analytics.revision_metrics,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting prompt signals: {str(e)}")


# ============================================================================
# Gold Set Evaluation Endpoints (dev tool)
# ============================================================================

# In-memory eval job status: {name: {"status": "running"|"done"|"error", "error": str|None}}
_eval_jobs: dict = {}


@app.get("/api/eval/gold-sets")
async def list_gold_sets():
    """List available gold sets."""
    from app.services.eval_gold_set import list_gold_sets as _list
    return {"gold_sets": _list()}


@app.get("/api/eval/models")
async def list_eval_models():
    """List available models for eval. Only shows models with configured API keys."""
    import os
    models = [{"id": "gpt-4o", "label": "GPT-4o"}]
    if os.getenv("ANTHROPIC_API_KEY"):
        models.append({"id": "claude-sonnet-4-20250514", "label": "Claude Sonnet 4"})
    return {"models": models}


@app.get("/api/eval/gold-set/{name}")
async def get_gold_set_eval(name: str, model: str = None):
    """Get cached gold set evaluation result."""
    from app.services.eval_gold_set import get_cached_eval, load_gold_set, list_cached_models

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


@app.get("/api/eval/gold-set/{name}/status")
async def get_eval_status(name: str, model: str = None):
    """Poll eval job status. Returns completed stages for progressive loading."""
    job_key = f"{name}:{model or 'gpt-4o'}"
    job = _eval_jobs.get(job_key)
    if not job:
        return {"status": "idle"}
    return job


@app.post("/api/eval/gold-set/{name}")
async def run_gold_set_eval(name: str, request: Request):
    """Start gold set evaluation in background thread. Poll /status for progress."""
    import asyncio
    from app.services.eval_gold_set import run_eval, load_gold_set
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


@app.post("/api/eval/gold-set/ingest")
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
        from app.services.eval_gold_set import ingest_gold_set
        result = ingest_gold_set(raw_json)
        return {"success": True, "slug": result["slug"], "gold_set": result["gold_set"]}
    except Exception as e:
        return JSONResponse({"success": False, "detail": str(e)}, status_code=500)


# --- Batch eval endpoints ---

@app.post("/api/eval/batch")
async def start_batch_eval(request: Request):
    """Kick off batch evaluation in background."""
    from app.services.eval_batch import get_batch_status, run_batch_eval
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


@app.get("/api/eval/batch/status")
async def batch_eval_status():
    """Poll batch eval progress."""
    from app.services.eval_batch import get_batch_status
    return get_batch_status()


@app.get("/api/eval/batch/report")
async def batch_eval_report():
    """Return latest batch report."""
    from app.services.eval_batch import get_batch_report
    report = get_batch_report()
    if report is None:
        return {"success": False, "detail": "No batch report available"}
    return {"success": True, "report": report}


# ---------------------------------------------------------------------------
# RAG — Document Upload & Management
# ---------------------------------------------------------------------------

@app.post("/api/project/{project_id}/documents/upload")
async def upload_document(project_id: str, file: UploadFile = FastAPIFile(...)):
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
async def add_document_url(project_id: str, request: Request):
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
async def list_documents(project_id: str):
    """List all ingested documents for a project."""
    from app.services.rag.store import RAGStore

    store = RAGStore(project_id)
    return {"success": True, "documents": store.list_documents(),
            "total_chunks": store.chunk_count}


@app.delete("/api/project/{project_id}/documents")
async def clear_documents(project_id: str):
    """Clear all documents and embeddings for a project."""
    from app.services.rag.store import RAGStore

    store = RAGStore(project_id)
    store.clear()
    return {"success": True, "message": "All documents cleared"}


@app.post("/api/project/{project_id}/documents/query")
async def query_documents(project_id: str, request: Request):
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

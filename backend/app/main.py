from fastapi import FastAPI, HTTPException, Header, Request, UploadFile, File as FastAPIFile
from fastapi.middleware.cors import CORSMiddleware
from app.services.chatbot import StoryboardChatbot, ChatRequest, ChatResponse
from app.services.orchestrator import orchestrator
from app.services.edit_tracker import edit_tracker
from app.services.analytics import analytics_tracker
from app.utils.image_search import GoogleImageSearch
from app.utils.json_extractor import extract_json_from_text, convert_to_story_format
from pydantic import BaseModel
from typing import List, Optional
import json
import os
import hmac
import hashlib
import httpx
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Initialize chatbot service
chatbot_service = StoryboardChatbot()

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
async def create_project(request: ProjectRequest):
    """Create a new project folder and JSON file"""
    try:
        # Create project directory
        project_dir = (
            Path(__file__).parent.parent.parent
            / "data"
            / f"project_{request.projectId}"
        )
        project_dir.mkdir(parents=True, exist_ok=True)

        # Create project metadata
        project_data = {
            "id": request.projectId,
            "userId": request.userId,  # Clerk user ID for ownership
            "type": request.typeId,
            "typeName": request.typeName,
            "userInput": request.userInput,
            "createdAt": datetime.now().isoformat(),
            "lastUpdated": datetime.now().isoformat(),
            "storyboard": None,
        }

        # Save project file
        project_file = project_dir / f"project_type{request.typeId}.json"
        with open(project_file, "w") as f:
            json.dump(project_data, f, indent=2)

        return {
            "success": True,
            "projectId": request.projectId,
            "projectDir": str(project_dir),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating project: {str(e)}")


@app.get("/api/project/{project_id}")
async def get_project(project_id: str):
    """Get project data by ID"""
    try:
        # Find project directory
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project not found")

        # Find project file
        project_files = list(project_dir.glob("project_type*.json"))
        if not project_files:
            raise HTTPException(status_code=404, detail="Project file not found")

        # Read project data
        with open(project_files[0], "r") as f:
            project_data = json.load(f)

        # Read story files if they exist
        stories = []
        if "stories" in project_data and project_data["stories"]:
            for story_name in project_data["stories"]:
                story_file = project_dir / f"{story_name}.json"
                if story_file.exists():
                    with open(story_file, "r") as f:
                        story_data = json.load(f)
                        stories.append(story_data)

        # Return project data with stories
        return {"success": True, "project": project_data, "stories": stories}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading project: {str(e)}")


class ChatMessage(BaseModel):
    id: str
    role: str
    content: str
    createdAt: str
    projectId: Optional[str] = None


class SaveChatRequest(BaseModel):
    projectId: str
    messages: List[ChatMessage]


class ChatRequestWithProject(BaseModel):
    message: str
    conversation_history: Optional[List[dict]] = []
    project_id: Optional[str] = None


@app.post("/api/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequestWithProject):
    """Send a message to the AI chatbot for storyboard assistance"""
    try:
        if not request.message.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        # Convert dict conversation history to ChatMessage objects for chatbot service
        from app.services.chatbot import ChatMessage as ServiceChatMessage

        chat_history = []
        if request.conversation_history:
            for msg in request.conversation_history:
                chat_history.append(
                    ServiceChatMessage(
                        role=msg.get("role", "user"), content=msg.get("content", "")
                    )
                )

        ai_response = chatbot_service.generate_response(
            user_message=request.message,
            conversation_history=chat_history,
            project_id=request.project_id,
        )

        return ChatResponse(message=ai_response, success=True)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error generating response: {str(e)}"
        )


@app.post("/api/chat/save")
async def save_chat_messages(request: SaveChatRequest):
    """Save chat messages for a project"""
    try:
        # Find project directory
        project_dir = (
            Path(__file__).parent.parent.parent
            / "data"
            / f"project_{request.projectId}"
        )
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project not found")

        # Save chat history to file
        chat_file = project_dir / "chat_history.json"

        # Convert messages to dict format
        messages_data = []
        for msg in request.messages:
            messages_data.append(
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "createdAt": msg.createdAt,
                }
            )

        # Save to file
        with open(chat_file, "w") as f:
            json.dump(
                {
                    "projectId": request.projectId,
                    "messages": messages_data,
                    "lastUpdated": datetime.now().isoformat(),
                },
                f,
                indent=2,
            )

        return {"success": True, "message": "Chat history saved"}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error saving chat history: {str(e)}"
        )


@app.get("/api/chat/history/{project_id}")
async def get_chat_history(project_id: str):
    """Get chat history for a project"""
    try:
        # Find project directory
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project not found")

        # Read chat history file
        chat_file = project_dir / "chat_history.json"

        if chat_file.exists():
            with open(chat_file, "r") as f:
                data = json.load(f)
                return {
                    "success": True,
                    "messages": data.get("messages", []),
                    "lastUpdated": data.get("lastUpdated"),
                }
        else:
            # Return empty history if file doesn't exist
            return {"success": True, "messages": [], "lastUpdated": None}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading chat history: {str(e)}"
        )


class ImageSearchRequest(BaseModel):
    query: str
    num_results: Optional[int] = 5
    image_size: Optional[str] = None
    image_type: Optional[str] = None
    safe_search: Optional[str] = "medium"


@app.post("/api/search/images")
async def search_images(request: ImageSearchRequest):
    """Search for images using Google Custom Search API"""
    try:
        if not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        searcher = GoogleImageSearch()
        results = searcher.search_images(
            query=request.query,
            num_results=request.num_results,
            image_size=request.image_size,
            image_type=request.image_type,
            safe_search=request.safe_search,
        )

        return {
            "success": True,
            "query": request.query,
            "count": len(results),
            "images": results,
        }

    except ValueError as e:
        # Missing API keys
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching images: {str(e)}")


@app.get("/api/search/image")
async def get_first_image(query: str, image_type: Optional[str] = None):
    """Get the first image result for a query"""
    try:
        if not query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        searcher = GoogleImageSearch()
        result = searcher.get_first_image(query, image_type=image_type)

        if result:
            return {"success": True, "query": query, "image": result}
        else:
            return {"success": False, "query": query, "message": "No images found"}

    except ValueError as e:
        # Missing API keys
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching image: {str(e)}")


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
# NEW EVENT-BASED ENDPOINTS (State Machine Pipeline)
# ============================================================


class EventRequest(BaseModel):
    """Request body for event-based pipeline."""
    event: str  # submit, approve, reject, refine
    payload: Optional[dict] = None


class IntakeFormRequest(BaseModel):
    """Request body for starting the pipeline."""
    intake_form: dict


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
    try:
        result = await orchestrator.process_event(
            project_id=project_id,
            event=request.event,
            payload=request.payload
        )

        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing event: {str(e)}")


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
            "intake": ["submit"],
            "gate1": ["approve", "reject"],
            "gate2": ["approve", "reject", "go_back_gate1"],
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
async def save_stages(project_id: str, request: SaveStagesRequest):
    """Save all stage data for a project (auto-save endpoint)."""
    try:
        # Find or create project directory
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )
        if not project_dir.exists():
            project_dir.mkdir(parents=True, exist_ok=True)

        # Prepare stages data
        stages_data = {
            "stages": request.stages,
            "currentStageId": request.currentStageId,
            "stageStatuses": [s.model_dump() for s in request.stageStatuses],
            "lastSaved": datetime.now().isoformat(),
        }

        # Save to stages.json
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
async def load_stages(project_id: str):
    """Load all stage data for a project."""
    try:
        # Find project directory
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )

        stages_file = project_dir / "stages.json"

        if not stages_file.exists():
            # Return empty data if no stages saved yet
            return {
                "success": True,
                "stages": None,
                "currentStageId": 1,
                "stageStatuses": None,
                "lastSaved": None,
            }

        # Load stages data
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


@app.get("/api/projects")
async def list_user_projects(user_id: str):
    """List all projects for a specific user."""
    try:
        data_dir = Path(__file__).parent.parent.parent / "data"

        if not data_dir.exists():
            return {"success": True, "projects": []}

        projects = []

        # Scan all project directories
        for project_dir in data_dir.iterdir():
            if not project_dir.is_dir() or not project_dir.name.startswith("project_"):
                continue

            # Find project metadata file
            project_files = list(project_dir.glob("project_type*.json"))
            if not project_files:
                continue

            try:
                with open(project_files[0], "r") as f:
                    project_data = json.load(f)

                # Filter by userId
                if project_data.get("userId") != user_id:
                    continue

                # Get stage progress from stages.json
                stages_file = project_dir / "stages.json"
                current_stage = 1
                progress = 0
                last_updated = project_data.get("lastUpdated") or project_data.get("createdAt")

                if stages_file.exists():
                    with open(stages_file, "r") as f:
                        stages_data = json.load(f)
                        current_stage = stages_data.get("currentStageId", 1)
                        last_updated = stages_data.get("lastSaved") or last_updated

                        # Calculate progress (4 stages total)
                        stage_statuses = stages_data.get("stageStatuses", [])
                        approved_count = sum(
                            1 for s in stage_statuses if s.get("status") == "approved"
                        )
                        progress = int((approved_count / 4) * 100)

                projects.append({
                    "id": project_data.get("id"),
                    "typeName": project_data.get("typeName"),
                    "userInput": project_data.get("userInput", "")[:100],  # Truncate
                    "createdAt": project_data.get("createdAt"),
                    "lastUpdated": last_updated,
                    "currentStage": current_stage,
                    "progress": progress,
                })

            except (json.JSONDecodeError, KeyError):
                continue

        # Sort by lastUpdated, most recent first
        projects.sort(key=lambda p: p.get("lastUpdated") or "", reverse=True)

        return {"success": True, "projects": projects}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing projects: {str(e)}")


@app.delete("/api/project/{project_id}")
async def delete_project(project_id: str, user_id: str):
    """Delete a project (only if owned by user)."""
    try:
        project_dir = (
            Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        )

        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project not found")

        # Verify ownership
        project_files = list(project_dir.glob("project_type*.json"))
        if project_files:
            with open(project_files[0], "r") as f:
                project_data = json.load(f)
                if project_data.get("userId") != user_id:
                    raise HTTPException(status_code=403, detail="Not authorized to delete this project")

        # Delete all files in project directory
        import shutil
        shutil.rmtree(project_dir)

        return {"success": True, "message": "Project deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting project: {str(e)}")


# ============================================================
# FILE UPLOAD AND LINK FETCHING ENDPOINTS
# ============================================================


def extract_text_from_pdf(file_path: Path) -> str:
    """Extract text content from a PDF file."""
    try:
        import PyPDF2
        text = ""
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text += page.extract_text() or ""
        return text.strip()
    except ImportError:
        # Fallback if PyPDF2 not installed
        return f"[PDF file: {file_path.name} - install PyPDF2 for text extraction]"
    except Exception as e:
        return f"[Error extracting PDF: {str(e)}]"


def extract_text_from_docx(file_path: Path) -> str:
    """Extract text content from a DOCX file."""
    try:
        from docx import Document
        doc = Document(file_path)
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text.strip()
    except ImportError:
        return f"[DOCX file: {file_path.name} - install python-docx for text extraction]"
    except Exception as e:
        return f"[Error extracting DOCX: {str(e)}]"


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

        html_content = response.text

        # Simple HTML to text extraction
        # Remove script and style elements
        import re
        html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        html_content = re.sub(r'<nav[^>]*>.*?</nav>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        html_content = re.sub(r'<footer[^>]*>.*?</footer>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        html_content = re.sub(r'<header[^>]*>.*?</header>', '', html_content, flags=re.DOTALL | re.IGNORECASE)

        # Extract title
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html_content, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else request.url

        # Remove HTML tags
        text_content = re.sub(r'<[^>]+>', ' ', html_content)
        # Normalize whitespace
        text_content = re.sub(r'\s+', ' ', text_content).strip()
        # Decode HTML entities
        import html
        text_content = html.unescape(text_content)

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


# ============================================================
# SPLIT BRIEF BUILDER ENDPOINTS (SSE Research Streaming)
# ============================================================

from fastapi.responses import StreamingResponse
import asyncio


class ResearchRequest(BaseModel):
    video_type: str
    company_name: Optional[str] = None
    description: Optional[str] = None
    links: Optional[List[str]] = None


class BriefGenerateRequest(BaseModel):
    onboarding_data: dict
    research_findings: Optional[dict] = None
    gap_answers: Optional[dict] = None
    corrections: Optional[dict] = None


async def research_event_generator(project_id: str, request_data: dict):
    """
    Generator function for SSE research events.
    Yields Server-Sent Events as the Topic Researcher runs.
    """
    try:
        from app.services.agents.topic_researcher import TopicResearcher

        researcher = TopicResearcher()

        # Send initial event
        yield f"data: {json.dumps({'type': 'research_started', 'timestamp': datetime.now().isoformat()})}\n\n"

        # Define search queries based on video type and inputs
        video_type = request_data.get("video_type", "Product Release")
        company_name = request_data.get("company_name", "")
        description = request_data.get("description", "")

        search_queries = []
        if company_name:
            search_queries.append({
                "query": f"{company_name} company overview",
                "purpose": "Find company background information"
            })
            search_queries.append({
                "query": f"{company_name} products services",
                "purpose": "Find product and service information"
            })
        if description:
            # Extract key terms from description
            search_queries.append({
                "query": f"{description[:100]} industry trends",
                "purpose": "Find industry context"
            })

        # Send search events
        search_results = []
        for i, sq in enumerate(search_queries):
            search_id = f"search_{i}"

            # Send search started event
            yield f"data: {json.dumps({'type': 'search_started', 'id': search_id, 'query': sq['query'], 'purpose': sq['purpose'], 'timestamp': datetime.now().isoformat()})}\n\n"

            await asyncio.sleep(0.5)  # Small delay for UI

            # Simulate search completion (in real implementation, this would call web search)
            yield f"data: {json.dumps({'type': 'search_complete', 'id': search_id, 'results_count': 3, 'timestamp': datetime.now().isoformat()})}\n\n"

            await asyncio.sleep(0.3)

        # Run the actual research
        try:
            research_data = await researcher.research(
                video_type=video_type,
                company_name=company_name,
                description=description,
                links=request_data.get("links", []),
            )

            # Convert research data to findings format
            findings = {
                "company": [],
                "product": [],
                "industry": [],
                "workflows": [],
                "terminology": [],
                "uncertainties": research_data.get("uncertainties", [])
            }

            if research_data.get("company_context"):
                findings["company"].append({
                    "category": "company",
                    "title": "Company Overview",
                    "content": research_data["company_context"],
                    "sources": research_data.get("company_context_sources", []),
                    "confidence": "high"
                })

            if research_data.get("product_context"):
                findings["product"].append({
                    "category": "product",
                    "title": "Product Information",
                    "content": research_data["product_context"],
                    "sources": research_data.get("product_context_sources", []),
                    "confidence": "high"
                })

            if research_data.get("industry_context"):
                findings["industry"].append({
                    "category": "industry",
                    "title": "Industry Context",
                    "content": research_data["industry_context"],
                    "sources": research_data.get("industry_context_sources", []),
                    "confidence": "medium"
                })

            # Send completion event
            yield f"data: {json.dumps({'type': 'research_complete', 'findings': findings, 'timestamp': datetime.now().isoformat()})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'timestamp': datetime.now().isoformat()})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'timestamp': datetime.now().isoformat()})}\n\n"


@app.get("/api/project/{project_id}/research/stream")
async def stream_research(project_id: str, request: Request):
    """
    SSE endpoint for streaming research progress.

    Returns Server-Sent Events with:
    - {"type": "search_started", "query": "...", "purpose": "..."}
    - {"type": "search_complete", "id": "...", "results_count": N}
    - {"type": "research_complete", "findings": {...}}
    - {"type": "error", "message": "..."}
    """
    # Get query parameters for research
    video_type = request.query_params.get("video_type", "Product Release")
    company_name = request.query_params.get("company_name", "")
    description = request.query_params.get("description", "")

    request_data = {
        "video_type": video_type,
        "company_name": company_name,
        "description": description,
    }

    return StreamingResponse(
        research_event_generator(project_id, request_data),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/api/project/{project_id}/research/run")
async def run_research(project_id: str, request: ResearchRequest):
    """
    Non-streaming endpoint to run research and return results.

    Fallback for when SSE is not available.
    """
    try:
        from app.services.agents.topic_researcher import TopicResearcher

        researcher = TopicResearcher()

        research_data = await researcher.research(
            video_type=request.video_type,
            company_name=request.company_name,
            description=request.description,
            links=request.links or [],
        )

        # Convert to findings format
        findings = {
            "company": [],
            "product": [],
            "industry": [],
            "workflows": [],
            "terminology": [],
            "uncertainties": research_data.get("uncertainties", [])
        }

        if research_data.get("company_context"):
            findings["company"].append({
                "category": "company",
                "title": "Company Overview",
                "content": research_data["company_context"],
                "sources": research_data.get("company_context_sources", []),
                "confidence": "high"
            })

        if research_data.get("product_context"):
            findings["product"].append({
                "category": "product",
                "title": "Product Information",
                "content": research_data["product_context"],
                "sources": research_data.get("product_context_sources", []),
                "confidence": "high"
            })

        if research_data.get("industry_context"):
            findings["industry"].append({
                "category": "industry",
                "title": "Industry Context",
                "content": research_data["industry_context"],
                "sources": research_data.get("industry_context_sources", []),
                "confidence": "medium"
            })

        return {
            "success": True,
            "findings": findings,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running research: {str(e)}")


@app.post("/api/project/{project_id}/brief/generate")
async def generate_brief(project_id: str, request: BriefGenerateRequest):
    """
    Generate a Story Brief from onboarding data, research findings, and gap answers.
    """
    try:
        from app.services.agents.brief_builder import BriefBuilder

        builder = BriefBuilder()

        # Prepare inputs for brief builder
        onboarding = request.onboarding_data
        findings = request.research_findings or {}
        gap_answers = request.gap_answers or {}
        corrections = request.corrections or {}

        # Build the brief
        brief = await builder.build_brief(
            video_type=onboarding.get("videoType", "Product Release"),
            video_goal=onboarding.get("description", ""),
            target_audience=onboarding.get("audience", ""),
            company_name=onboarding.get("companyName", ""),
            tone=onboarding.get("tone", "professional"),
            duration=onboarding.get("duration", 60),
            show_face=onboarding.get("showFace", False),
            platform=onboarding.get("platform", "general"),
            research_findings=findings,
            gap_answers=gap_answers,
            corrections=corrections,
        )

        # Save brief to project
        project_dir = Path(__file__).parent.parent.parent / "data" / f"project_{project_id}"
        if project_dir.exists():
            brief_file = project_dir / "story_brief.json"
            with open(brief_file, "w") as f:
                json.dump(brief, f, indent=2)

        return {
            "success": True,
            "brief": brief,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating brief: {str(e)}")

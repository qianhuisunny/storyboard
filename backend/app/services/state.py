"""
State management for the storyboard orchestrator.

State transitions live here; persistence goes through SQLite via SQLAlchemy.
No pipeline state is written to `state.json`.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Literal, Union
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.db.engine import AsyncSessionLocal
from app.db.models import Base
from app.db.repository import ProjectRepository


ArtifactType = Literal["intake", "outline", "storyboard"]
WorkflowStage = Literal["intake", "outline", "storyboard", "complete"]

LEGACY_WORKFLOW_STAGES: dict[str, WorkflowStage] = {
    "intake": "intake",
    "research": "intake",
    "brief": "intake",
    "brief_chat": "intake",
    "brief_review": "intake",
    "gate1": "intake",
    "outline": "outline",
    "gate2": "outline",
    "outline_research": "outline",
    "write": "storyboard",
    "review": "storyboard",
    "done": "complete",
}


class ArtifactPointers(BaseModel):
    current_version_id: Optional[str] = None
    approved_version_id: Optional[str] = None
    needs_update: bool = False


def default_artifact_pointers() -> dict[ArtifactType, ArtifactPointers]:
    return {
        "intake": ArtifactPointers(),
        "outline": ArtifactPointers(),
        "storyboard": ArtifactPointers(),
    }


class JobOverlay(BaseModel):
    status: Literal["idle", "running", "failed"] = "idle"
    job_id: Optional[str] = None
    kind: Optional[Literal["outline", "storyboard"]] = None
    input_version_id: Optional[str] = None
    error: Optional[str] = None


class RevisionRecord(BaseModel):
    """Record of a revision request at a gating point."""
    gate: Union[Literal[1, 2], str]  # 1, 2, or "optional"
    feedback: str
    timestamp: str
    resolved: bool = False


class StoryboardState(BaseModel):
    """Complete state for a storyboard project through the pipeline."""
    project_id: str
    phase: Literal[
        "intake",         # Initial state, waiting for intake form
        "research",       # Reserved for future researcher reintroduction
        "brief",          # Brief Builder is running (legacy)
        "brief_chat",     # Active chat-assisted guided brief building
        "brief_review",   # NEW: Final brief review before locking
        "gate1",          # Human review of Story Brief
        "outline",        # Storyboard Director is running
        "gate2",          # Human review of Screen Outline
        "outline_research",  # Reserved for future outline research flow
        "write",          # Storyboard Writer is running
        "review",         # Final review (optional refinements)
        "done"            # Complete
    ] = "intake"

    # New workflow contract. Legacy phase/content fields remain available below.
    workflow_stage: WorkflowStage = "intake"
    artifacts: dict[ArtifactType, ArtifactPointers] = Field(
        default_factory=default_artifact_pointers
    )
    job: JobOverlay = Field(default_factory=JobOverlay)

    # Accumulated data through pipeline
    intake_form: Optional[dict] = None
    story_brief: Optional[dict] = None
    screen_outline: Optional[Union[str, list]] = None
    storyboard: Optional[list] = None

    # Guided chat brief state
    confirmed_fields: dict = Field(default_factory=dict)  # Accumulated confirmed fields from each round

    # Reserved I/O slots for the deferred Researcher/EvidenceResearcher work.
    # MVP does not populate them, but we keep the schema stable for a future
    # reintroduction with an explicit contract.
    research_details: Optional[dict] = None
    evidence_research: Optional[dict] = None

    # Quality eval results (auto-grader)
    outline_eval: Optional[dict] = None
    storyboard_eval: Optional[dict] = None

    # Revision tracking
    revision_history: List[RevisionRecord] = Field(default_factory=list)
    revision_count_gate1: int = 0
    revision_count_gate2: int = 0
    max_revisions: int = 3

    # Locks - prevent modification after approval
    brief_locked: bool = False
    outline_locked: bool = False

    # Timestamps
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    @model_validator(mode="before")
    @classmethod
    def hydrate_workflow_contract(cls, value):
        """Add workflow metadata to legacy state blobs without moving content."""
        if not isinstance(value, dict):
            return value

        data = dict(value)
        if data.get("workflow_stage") is None:
            data["workflow_stage"] = LEGACY_WORKFLOW_STAGES.get(
                data.get("phase", "intake"), "intake"
            )

        if "artifacts" in data:
            supplied = data.get("artifacts") or {}
            defaults = default_artifact_pointers()
            data["artifacts"] = {
                artifact_type: supplied.get(artifact_type, defaults[artifact_type])
                for artifact_type in defaults
            }
        return data


class StateManager:
    """Manages state persistence and transitions for a project."""

    WORKFLOW_ALLOWED_EVENTS = {
        "intake": ["save_intake", "approve_intake"],
        "outline": [
            "save_outline",
            "revise_outline",
            "approve_outline",
            "edit_intake",
        ],
        "storyboard": [
            "save_storyboard",
            "revise_storyboard",
            "approve_storyboard",
            "edit_outline",
            "edit_intake",
            "keep_storyboard",
        ],
        "complete": ["reopen_intake", "reopen_outline", "reopen_storyboard"],
    }

    # Valid state transitions: (current_phase, event) -> next_phase
    TRANSITIONS = {
        # Legacy flow (kept for backward compatibility)
        ("intake", "submit"): "research",
        ("research", "context_ready"): "brief",
        ("brief", "brief_ready"): "gate1",
        ("gate1", "approve"): "outline",
        ("gate1", "reject"): "brief",  # Revision loop
        ("outline", "outline_ready"): "gate2",
        ("gate2", "approve"): "write",
        ("gate2", "run_research"): "outline_research",  # Reserved for future researcher flow
        ("gate2", "regenerate_section"): "gate2",  # Regen one section, stay at gate2
        ("gate2", "refine_outline"): "gate2",  # Regen full outline, stay at gate2
        ("gate2", "reject"): "outline",  # Revision loop
        ("outline_research", "run_research"): "outline_research",  # Reserved for future researcher flow
        ("outline_research", "approve"): "write",  # Accept attached research and run writer
        ("write", "storyboard_ready"): "review",
        ("review", "approve"): "done",
        ("review", "refine"): "outline",  # Optional refinement

        # Guided chat-assisted brief flow
        ("intake", "submit_guided_brief"): "brief_chat",
        ("intake", "submit_knowledge_share"): "brief_chat",
        ("brief_chat", "chat_brief_approve"): "gate1",
        ("brief_review", "chat_brief_approve"): "gate1",
        ("brief_review", "brief_approve"): "gate1",                # Legacy compatibility
        ("brief_review", "approve"): "gate1",                      # Public alias for final brief approval
        ("brief_review", "edit"): "brief_chat",                    # Legacy compatibility
        ("brief_review", "edit_brief"): "brief_chat",              # Legacy alias

        # Go back transitions
        ("gate2", "go_back_gate1"): "gate1",      # From outline review -> brief review
        ("review", "go_back_gate2"): "gate2",     # From final review -> outline review
        ("review", "go_back_gate1"): "gate1",     # From final review -> brief review
        ("done", "restart"): "intake",            # Start over completely
    }

    def __init__(self, project_id: str, data_dir: Optional[Path] = None):
        self.project_id = project_id
        self.data_dir = Path(data_dir) if data_dir is not None else None
        self._owned_engine = None
        if self.data_dir is None:
            self._sessionmaker = AsyncSessionLocal
        else:
            db_path = self.data_dir / "plotline.db"
            db_path.parent.mkdir(parents=True, exist_ok=True)
            self._owned_engine = create_async_engine(
                f"sqlite+aiosqlite:///{db_path}",
                echo=False,
            )
            self._sessionmaker = async_sessionmaker(
                self._owned_engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )

    async def _ensure_tables(self) -> None:
        """Create tables for temp/test databases managed by this instance."""
        if self._owned_engine is None:
            return
        async with self._owned_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def load(self) -> StoryboardState:
        """Load state from SQLite, or create initial state if it doesn't exist."""
        await self._ensure_tables()
        async with self._sessionmaker() as session:
            repo = ProjectRepository(session)
            ps = await repo.get_pipeline_state(self.project_id)
            if not ps:
                return await self._create_initial_state()

            data = repo.parse_state_data(ps)
            if not data:
                data = {}
            data.setdefault("project_id", self.project_id)
            data["phase"] = ps.phase or data.get("phase", "intake")
            return StoryboardState(**data)

    async def _create_initial_state(self) -> StoryboardState:
        """Create a new initial state for the project."""
        state = StoryboardState(project_id=self.project_id, phase="intake")
        async with self._sessionmaker() as session:
            repo = ProjectRepository(session)
            project = await repo.get_project(self.project_id)
            if not project:
                await repo.create_project(
                    project_id=self.project_id,
                    user_id="",
                    title="",
                )
            await repo.update_pipeline_state(
                project_id=self.project_id,
                phase=state.phase,
                status="pending",
                state_data=state.model_dump(),
            )
        return state

    async def save(self, state: StoryboardState) -> None:
        """Persist state to SQLite."""
        await self._ensure_tables()
        state.updated_at = datetime.now(timezone.utc).isoformat()
        async with self._sessionmaker() as session:
            repo = ProjectRepository(session)
            project = await repo.get_project(self.project_id)
            if not project:
                await repo.create_project(
                    project_id=self.project_id,
                    user_id="",
                    title="",
                )
            status = "completed" if state.phase == "done" else "pending"
            await repo.update_pipeline_state(
                project_id=self.project_id,
                phase=state.phase,
                status=status,
                state_data=state.model_dump(),
            )

    def transition(self, state: StoryboardState, event: str) -> StoryboardState:
        """
        Attempt a state transition based on current phase and event.

        Args:
            state: Current state
            event: Event triggering the transition

        Returns:
            Updated state with new phase

        Raises:
            ValueError: If transition is invalid
        """
        key = (state.phase, event)
        if key not in self.TRANSITIONS:
            raise ValueError(
                f"Invalid transition: cannot go from '{state.phase}' with event '{event}'. "
                f"Valid events for '{state.phase}': {self._valid_events_for_phase(state.phase)}"
            )

        state.phase = self.TRANSITIONS[key]
        state.workflow_stage = LEGACY_WORKFLOW_STAGES[state.phase]
        return state

    def allowed_events(self, state: StoryboardState) -> List[str]:
        """Return the sole allowed-event contract for the four-stage workflow."""
        return list(self.WORKFLOW_ALLOWED_EVENTS[state.workflow_stage])

    def mark_upstream_changed(
        self,
        state: StoryboardState,
        artifact_type: Literal["intake", "outline"],
    ) -> StoryboardState:
        """Mark existing downstream versions stale while retaining all pointers."""
        downstream = {
            "intake": ("outline", "storyboard"),
            "outline": ("storyboard",),
        }
        if artifact_type not in downstream:
            raise ValueError(f"Unsupported upstream artifact type: {artifact_type}")

        for downstream_type in downstream[artifact_type]:
            pointers = state.artifacts[downstream_type]
            if pointers.current_version_id is not None:
                pointers.needs_update = True
        return state

    def _valid_events_for_phase(self, phase: str) -> List[str]:
        """Get list of valid events for a given phase."""
        return [event for (p, event) in self.TRANSITIONS.keys() if p == phase]

    def can_transition(self, state: StoryboardState, event: str) -> bool:
        """Check if a transition is valid without actually performing it."""
        return (state.phase, event) in self.TRANSITIONS

    def add_revision(
        self,
        state: StoryboardState,
        gate: Union[int, str],
        feedback: str
    ) -> StoryboardState:
        """
        Add a revision record and increment the revision counter.

        Args:
            state: Current state
            gate: Which gate (1, 2, or "optional")
            feedback: The revision feedback

        Returns:
            Updated state

        Raises:
            ValueError: If max revisions exceeded
        """
        # Check revision limits
        if gate == 1:
            if state.revision_count_gate1 >= state.max_revisions:
                raise ValueError(
                    f"Maximum revisions ({state.max_revisions}) reached at Gate 1. "
                    "Please approve the current version or request manual intervention."
                )
            state.revision_count_gate1 += 1
        elif gate == 2:
            if state.revision_count_gate2 >= state.max_revisions:
                raise ValueError(
                    f"Maximum revisions ({state.max_revisions}) reached at Gate 2. "
                    "Please approve the current version or request manual intervention."
                )
            state.revision_count_gate2 += 1

        # Add revision record
        state.revision_history.append(RevisionRecord(
            gate=gate,
            feedback=feedback,
            timestamp=datetime.now(timezone.utc).isoformat(),
            resolved=False
        ))

        return state

    def lock_brief(self, state: StoryboardState) -> StoryboardState:
        """Lock the story brief after Gate 1 approval."""
        state.brief_locked = True
        # Mark any Gate 1 revisions as resolved
        for rev in state.revision_history:
            if rev.gate == 1:
                rev.resolved = True
        return state

    def lock_outline(self, state: StoryboardState) -> StoryboardState:
        """Lock the screen outline after Gate 2 approval."""
        state.outline_locked = True
        # Mark any Gate 2 revisions as resolved
        for rev in state.revision_history:
            if rev.gate == 2:
                rev.resolved = True
        return state

    def get_pending_revisions(self, state: StoryboardState, gate: int) -> List[RevisionRecord]:
        """Get unresolved revisions for a specific gate."""
        return [
            rev for rev in state.revision_history
            if rev.gate == gate and not rev.resolved
        ]

    def get_revision_summary(self, state: StoryboardState) -> dict:
        """Get a summary of revision history for the project."""
        return {
            "gate1_revisions": state.revision_count_gate1,
            "gate2_revisions": state.revision_count_gate2,
            "total_revisions": len(state.revision_history),
            "pending_revisions": len([r for r in state.revision_history if not r.resolved]),
            "max_revisions_per_gate": state.max_revisions,
        }

    def go_back(self, state: StoryboardState, target_gate: int) -> StoryboardState:
        """
        Go back to an earlier gate, unlocking stages and clearing downstream data.

        Args:
            state: Current state
            target_gate: Target gate to return to (1 or 2), or 0 for intake

        Returns:
            Updated state with unlocked stages and cleared downstream data
        """
        if target_gate == 0:
            # Full restart - clear everything
            state.brief_locked = False
            state.outline_locked = False
            state.intake_form = None
            state.story_brief = None
            state.screen_outline = None
            state.storyboard = None
            state.revision_count_gate1 = 0
            state.revision_count_gate2 = 0
            state.revision_history = []
            state.phase = "intake"
            state.workflow_stage = "intake"

        elif target_gate == 1:
            # Go back to Gate 1 - unlock brief, clear outline, storyboard and research
            state.brief_locked = False
            state.outline_locked = False
            state.screen_outline = None
            state.storyboard = None
            state.evidence_research = None
            state.phase = "gate1"
            state.workflow_stage = "intake"

        elif target_gate == 2:
            # Go back to Gate 2 - unlock outline, clear storyboard and research
            state.outline_locked = False
            state.storyboard = None
            state.evidence_research = None
            state.phase = "gate2"
            state.workflow_stage = "outline"

        return state

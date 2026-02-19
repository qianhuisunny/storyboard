"""
State Management for Storyboard Orchestrator.
Manages project state through the multi-agent pipeline with gating points.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Literal, Union
from pydantic import BaseModel, Field


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
        "intake",      # Initial state, waiting for intake form
        "research",    # Topic Researcher is running
        "brief",       # Brief Builder is running
        "gate1",       # Human review of Story Brief
        "outline",     # Storyboard Director is running
        "gate2",       # Human review of Screen Outline
        "write",       # Storyboard Writer is running
        "review",      # Final review (optional refinements)
        "done"         # Complete
    ] = "intake"

    # Accumulated data through pipeline
    intake_form: Optional[dict] = None
    context_pack: Optional[dict] = None
    story_brief: Optional[dict] = None
    screen_outline: Optional[list] = None
    storyboard: Optional[list] = None

    # Revision tracking
    revision_history: List[RevisionRecord] = Field(default_factory=list)
    revision_count_gate1: int = 0
    revision_count_gate2: int = 0
    max_revisions: int = 3

    # Locks - prevent modification after approval
    brief_locked: bool = False
    outline_locked: bool = False

    # Timestamps
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class StateManager:
    """Manages state persistence and transitions for a project."""

    # Valid state transitions: (current_phase, event) -> next_phase
    TRANSITIONS = {
        ("intake", "submit"): "research",
        ("research", "context_ready"): "brief",
        ("brief", "brief_ready"): "gate1",
        ("gate1", "approve"): "outline",
        ("gate1", "reject"): "brief",  # Revision loop
        ("outline", "outline_ready"): "gate2",
        ("gate2", "approve"): "write",
        ("gate2", "reject"): "outline",  # Revision loop
        ("write", "storyboard_ready"): "review",
        ("review", "approve"): "done",
        ("review", "refine"): "outline",  # Optional refinement
        # Go back transitions
        ("gate2", "go_back_gate1"): "gate1",      # From outline review -> brief review
        ("review", "go_back_gate2"): "gate2",     # From final review -> outline review
        ("review", "go_back_gate1"): "gate1",     # From final review -> brief review
        ("done", "restart"): "intake",            # Start over completely
    }

    def __init__(self, project_id: str, data_dir: Optional[Path] = None):
        self.project_id = project_id
        self.data_dir = data_dir or Path(__file__).parent.parent.parent.parent / "data"
        self.project_dir = self.data_dir / f"project_{project_id}"
        self.state_path = self.project_dir / "state.json"

    def load(self) -> StoryboardState:
        """Load state from disk, or create initial state if doesn't exist."""
        if self.state_path.exists():
            with open(self.state_path, "r") as f:
                data = json.load(f)
            return StoryboardState(**data)
        return self._create_initial_state()

    def _create_initial_state(self) -> StoryboardState:
        """Create a new initial state for the project."""
        state = StoryboardState(
            project_id=self.project_id,
            phase="intake",
        )
        self.save(state)
        return state

    def save(self, state: StoryboardState) -> None:
        """Save state to disk."""
        state.updated_at = datetime.now().isoformat()
        self.project_dir.mkdir(parents=True, exist_ok=True)
        with open(self.state_path, "w") as f:
            json.dump(state.model_dump(), f, indent=2)

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
            timestamp=datetime.now().isoformat(),
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
            state.context_pack = None
            state.story_brief = None
            state.screen_outline = None
            state.storyboard = None
            state.revision_count_gate1 = 0
            state.revision_count_gate2 = 0
            state.revision_history = []
            state.phase = "intake"

        elif target_gate == 1:
            # Go back to Gate 1 - unlock brief, clear outline and storyboard
            state.brief_locked = False
            state.outline_locked = False
            state.screen_outline = None
            state.storyboard = None
            state.phase = "gate1"

        elif target_gate == 2:
            # Go back to Gate 2 - unlock outline, clear storyboard
            state.outline_locked = False
            state.storyboard = None
            state.phase = "gate2"

        return state

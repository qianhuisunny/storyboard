"""
Storyboard Orchestrator - Coordinates the multi-agent storyboard generation pipeline.
Manages state transitions, gating points, and revision loops.
"""

from datetime import datetime
from typing import Optional, Dict, Any

from app.services.state import StateManager, StoryboardState, RevisionRecord
from app.services.agents import (
    TopicResearcher,
    BriefBuilder,
    StoryboardDirector,
    StoryboardWriter,
)


class StoryboardOrchestrator:
    """
    Orchestrates the storyboard generation pipeline.

    Pipeline:
    1. intake -> research (TopicResearcher)
    2. research -> brief (BriefBuilder)
    3. brief -> gate1 (Human Review)
    4. gate1 -> outline (StoryboardDirector)
    5. outline -> gate2 (Human Review)
    6. gate2 -> write (StoryboardWriter)
    7. write -> review (Optional refinements)
    8. review -> done

    Events:
    - submit: Start the pipeline with intake form
    - approve: Approve at a gating point
    - reject: Request revision at a gating point
    - refine: Request optional refinement after storyboard generation
    """

    def __init__(self):
        """Initialize the orchestrator with all agents."""
        self.agents = {
            "researcher": TopicResearcher(),
            "brief_builder": BriefBuilder(),
            "director": StoryboardDirector(),
            "writer": StoryboardWriter(),
        }

    async def process_event(
        self,
        project_id: str,
        event: str,
        payload: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process a state machine event.

        Args:
            project_id: The project ID
            event: Event type (submit, approve, reject, refine)
            payload: Event payload (intake_form for submit, feedback for reject)

        Returns:
            dict with phase, state data, and any generated content
        """
        payload = payload or {}
        manager = StateManager(project_id)
        state = manager.load()

        result = {
            "phase": state.phase,
            "previous_phase": state.phase,
            "event": event,
            "success": True,
            "message": "",
        }

        try:
            # Route based on current phase and event
            handler = self._get_handler(state.phase, event)
            if handler:
                state, result = await handler(state, manager, payload, result)
            else:
                raise ValueError(
                    f"Invalid event '{event}' for phase '{state.phase}'. "
                    f"Valid events: {manager._valid_events_for_phase(state.phase)}"
                )

            manager.save(state)
            result["phase"] = state.phase
            result["state"] = self._serialize_state(state)

        except Exception as e:
            result["success"] = False
            result["message"] = str(e)
            result["error"] = str(e)

        return result

    def _get_handler(self, phase: str, event: str):
        """Get the handler function for a phase/event combination."""
        handlers = {
            ("intake", "submit"): self._handle_intake_submit,
            ("gate1", "approve"): self._handle_gate1_approve,
            ("gate1", "reject"): self._handle_gate1_reject,
            ("gate2", "approve"): self._handle_gate2_approve,
            ("gate2", "reject"): self._handle_gate2_reject,
            ("gate2", "go_back_gate1"): self._handle_go_back_gate1,
            ("review", "approve"): self._handle_review_approve,
            ("review", "refine"): self._handle_review_refine,
            ("review", "go_back_gate1"): self._handle_go_back_gate1,
            ("review", "go_back_gate2"): self._handle_go_back_gate2,
            ("done", "restart"): self._handle_restart,
        }
        return handlers.get((phase, event))

    async def _handle_intake_submit(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle intake form submission - runs research and brief building."""
        # Validate intake form
        intake_form = payload.get("intake_form")
        if not intake_form:
            raise ValueError("intake_form is required in payload")

        # Store intake form
        state.intake_form = intake_form
        state = manager.transition(state, "submit")
        result["message"] = "Intake received, starting research..."

        # Run Topic Researcher
        context_pack = self.agents["researcher"].run(state)
        state.context_pack = context_pack
        state = manager.transition(state, "context_ready")
        result["message"] = "Research complete, building brief..."

        # Run Brief Builder
        story_brief = self.agents["brief_builder"].run(state)
        state.story_brief = story_brief
        state = manager.transition(state, "brief_ready")
        result["message"] = "Story Brief ready for review at Gate 1"

        # Include the story brief in result for frontend display
        result["story_brief"] = story_brief
        result["context_pack"] = context_pack

        return state, result

    async def _handle_gate1_approve(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle Gate 1 approval - locks brief and runs director."""
        # VALIDATION: Check story_brief exists and has content
        if not state.story_brief:
            raise ValueError("Cannot approve: Story Brief is empty")

        required_fields = ["video_goal", "target_audience", "key_points"]
        missing = [f for f in required_fields if not state.story_brief.get(f)]
        if missing:
            raise ValueError(f"Cannot approve: Story Brief missing required fields: {missing}")

        # Lock the brief
        state = manager.lock_brief(state)
        state = manager.transition(state, "approve")
        result["message"] = "Story Brief approved, creating outline..."

        # Run Storyboard Director in initial mode
        screen_outline = self.agents["director"].run(state, mode="initial")
        state.screen_outline = screen_outline
        state = manager.transition(state, "outline_ready")
        result["message"] = "Screen Outline ready for review at Gate 2"

        # Include outline in result
        result["screen_outline"] = screen_outline

        return state, result

    async def _handle_gate1_reject(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle Gate 1 rejection - revise the brief."""
        feedback = payload.get("feedback")
        if not feedback:
            raise ValueError("feedback is required for rejection")

        # Add revision record
        state = manager.add_revision(state, gate=1, feedback=feedback)

        # Re-run Brief Builder with feedback
        story_brief = self.agents["brief_builder"].run(
            state,
            revision_feedback=feedback
        )
        state.story_brief = story_brief
        state.phase = "gate1"  # Stay at gate1 for re-review

        result["message"] = f"Brief revised (revision {state.revision_count_gate1}/{state.max_revisions})"
        result["story_brief"] = story_brief

        return state, result

    async def _handle_gate2_approve(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle Gate 2 approval - locks outline and runs writer."""
        # VALIDATION: Check screen_outline exists and has screens
        if not state.screen_outline:
            raise ValueError("Cannot approve: Screen Outline is empty")

        if len(state.screen_outline) < 3:
            raise ValueError(
                f"Cannot approve: Screen Outline has only {len(state.screen_outline)} screens (minimum 3 required)"
            )

        # Check each screen has required fields
        for i, screen in enumerate(state.screen_outline):
            required = ["voiceover_text", "screen_type", "visual_direction"]
            missing = [f for f in required if not screen.get(f)]
            if missing:
                raise ValueError(f"Cannot approve: Screen {i+1} missing required fields: {missing}")

        # Lock the outline
        state = manager.lock_outline(state)
        state = manager.transition(state, "approve")
        result["message"] = "Screen Outline approved, generating storyboard..."

        # Run Storyboard Writer
        storyboard = self.agents["writer"].run(state)
        state.storyboard = storyboard
        state = manager.transition(state, "storyboard_ready")
        result["message"] = "Storyboard complete! Review and optionally refine."

        # Include storyboard in result
        result["storyboard"] = storyboard

        return state, result

    async def _handle_gate2_reject(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle Gate 2 rejection - revise the outline."""
        feedback = payload.get("feedback")
        if not feedback:
            raise ValueError("feedback is required for rejection")

        # Add revision record
        state = manager.add_revision(state, gate=2, feedback=feedback)

        # Re-run Director in revision mode
        screen_outline = self.agents["director"].run(
            state,
            mode="revision",
            revision_request=feedback
        )
        state.screen_outline = screen_outline
        state.phase = "gate2"  # Stay at gate2 for re-review

        result["message"] = f"Outline revised (revision {state.revision_count_gate2}/{state.max_revisions})"
        result["screen_outline"] = screen_outline

        return state, result

    async def _handle_review_approve(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle final approval - mark as done."""
        # VALIDATION: Check storyboard exists and has screens
        if not state.storyboard:
            raise ValueError("Cannot approve: Storyboard is empty")

        if len(state.storyboard) < 3:
            raise ValueError(
                f"Cannot approve: Storyboard has only {len(state.storyboard)} screens (minimum 3 required)"
            )

        # Check each screen has required fields
        for i, screen in enumerate(state.storyboard):
            if not screen.get("target_duration_sec"):
                raise ValueError(f"Cannot approve: Screen {i+1} missing target_duration_sec")

        state = manager.transition(state, "approve")
        result["message"] = "Storyboard finalized!"
        result["storyboard"] = state.storyboard

        return state, result

    async def _handle_review_refine(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle optional refinement request."""
        feedback = payload.get("feedback")
        if not feedback:
            raise ValueError("feedback is required for refinement")

        # Add revision record with "optional" gate
        state.revision_history.append(RevisionRecord(
            gate="optional",
            feedback=feedback,
            timestamp=datetime.now().isoformat(),
            resolved=False
        ))

        # Re-run Director in revision mode
        screen_outline = self.agents["director"].run(
            state,
            mode="revision",
            revision_request=feedback
        )
        state.screen_outline = screen_outline

        # Re-run Writer with updated outline
        storyboard = self.agents["writer"].run(state)
        state.storyboard = storyboard

        # Mark revision as resolved
        state.revision_history[-1].resolved = True

        result["message"] = "Storyboard refined!"
        result["screen_outline"] = screen_outline
        result["storyboard"] = storyboard

        return state, result

    async def _handle_go_back_gate1(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Go back to Gate 1 to re-edit the Story Brief."""
        state = manager.go_back(state, target_gate=1)
        result["message"] = "Returned to Gate 1. Story Brief unlocked for editing."
        result["story_brief"] = state.story_brief

        return state, result

    async def _handle_go_back_gate2(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Go back to Gate 2 to re-edit the Screen Outline."""
        state = manager.go_back(state, target_gate=2)
        result["message"] = "Returned to Gate 2. Screen Outline unlocked for editing."
        result["screen_outline"] = state.screen_outline

        return state, result

    async def _handle_restart(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Restart the entire project from intake."""
        state = manager.go_back(state, target_gate=0)
        result["message"] = "Project restarted. All data cleared."

        return state, result

    def _serialize_state(self, state: StoryboardState) -> dict:
        """Serialize state for API response."""
        return {
            "project_id": state.project_id,
            "phase": state.phase,
            "brief_locked": state.brief_locked,
            "outline_locked": state.outline_locked,
            "revision_count_gate1": state.revision_count_gate1,
            "revision_count_gate2": state.revision_count_gate2,
            "max_revisions": state.max_revisions,
            "has_intake_form": state.intake_form is not None,
            "has_context_pack": state.context_pack is not None,
            "has_story_brief": state.story_brief is not None,
            "has_screen_outline": state.screen_outline is not None,
            "has_storyboard": state.storyboard is not None,
            "created_at": state.created_at,
            "updated_at": state.updated_at,
        }

    # =========================================================================
    # Legacy API support (for backward compatibility with existing endpoints)
    # =========================================================================

    async def run_stage(
        self,
        stage: str,
        user_input: str,
        previous_stages: dict,
        feedback: Optional[str] = None,
        video_type: Optional[str] = "Product Release",
        project_id: Optional[str] = None,
    ) -> dict:
        """
        Legacy method for backward compatibility with existing stage-based API.

        Maps old stage names to new event-based flow.
        """
        import json

        # Use provided project_id or create a temporary one
        if not project_id:
            project_id = f"legacy_{id(previous_stages)}"

        # For non-brief stages, we need to run the agents directly
        # since the state machine approach requires proper state setup
        if stage == "brief":
            # Combine user input with video type for display
            combined_input = f"{user_input} + {video_type}"
            payload = {
                "intake_form": {
                    "user_inputs": combined_input,
                    "video_goal": "",
                    "target_audience": "",
                    "company_or_brand_name": "",
                    "tone_and_style": "professional",
                    "format_or_platform": "general",
                    "desired_length": "60",
                    "show_face": "No",
                    "cta": "",
                    "video_type": video_type,
                }
            }
            # Run through event system for brief
            result = await self.process_event(project_id, "submit", payload)
            return {
                "ai_content": result.get("story_brief") or "",
                "sources": [{"type": "ai_generated", "reference": "Generated via brief stage"}],
                "context_pack": result.get("context_pack", {}),
            }

        elif stage == "outline":
            # For outline, we need the story brief from previous stages
            brief_json = previous_stages.get("brief", "{}")
            try:
                story_brief = json.loads(brief_json) if isinstance(brief_json, str) else brief_json
            except json.JSONDecodeError:
                story_brief = {"raw_content": brief_json}

            # Create a mock state for the StoryboardDirector
            class MockState:
                def __init__(self, brief):
                    self.story_brief = brief
                    self.context_pack = {}
                    self.intake_form = {"video_type": video_type}

            mock_state = MockState(story_brief)

            # Run StoryboardDirector directly
            screen_outline = self.agents["director"].run(
                mock_state,
                mode="revision" if feedback else "initial",
                revision_request=feedback
            )

            return {
                "ai_content": screen_outline,
                "sources": [{"type": "ai_generated", "reference": "Generated via outline stage"}],
                "context_pack": {},
            }

        elif stage in ["panels", "draft"]:
            # For panels/draft, we need the screen outline
            outline_json = previous_stages.get("outline", "[]")
            try:
                screen_outline = json.loads(outline_json) if isinstance(outline_json, str) else outline_json
            except json.JSONDecodeError:
                screen_outline = []

            brief_json = previous_stages.get("brief", "{}")
            try:
                story_brief = json.loads(brief_json) if isinstance(brief_json, str) else brief_json
            except json.JSONDecodeError:
                story_brief = {}

            # Create a mock state for the StoryboardWriter
            class MockState:
                def __init__(self, brief, outline):
                    self.story_brief = brief
                    self.screen_outline = outline
                    self.context_pack = {}

            mock_state = MockState(story_brief, screen_outline)

            # Run StoryboardWriter directly
            storyboard = self.agents["writer"].run(mock_state)

            return {
                "ai_content": storyboard,
                "sources": [{"type": "ai_generated", "reference": f"Generated via {stage} stage"}],
                "context_pack": {},
            }

        elif stage == "polish":
            # Polish stage - just return the existing storyboard
            storyboard_json = previous_stages.get("draft", "[]")
            return {
                "ai_content": storyboard_json,
                "sources": [{"type": "ai_generated", "reference": "Generated via polish stage"}],
                "context_pack": {},
            }

        else:
            raise ValueError(f"Unknown stage: {stage}")


# Singleton instance
orchestrator = StoryboardOrchestrator()

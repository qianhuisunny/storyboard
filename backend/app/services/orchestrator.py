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
            # Legacy flow
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

            # NEW: 3-Round Briefing Flow for Knowledge Share
            ("intake", "submit_knowledge_share"): self._handle_submit_knowledge_share,
            ("brief_round1", "round1_confirm"): self._handle_round1_confirm,
            ("brief_round2", "round2_confirm"): self._handle_round2_confirm,
            ("brief_round3", "round3_confirm"): self._handle_round3_confirm,
            ("brief_review", "brief_approve"): self._handle_brief_approve,
            ("brief_review", "edit_brief"): self._handle_edit_brief,
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

        # Run Topic Researcher (output not currently used - will be restructured)
        self.agents["researcher"].run(state)
        state = manager.transition(state, "context_ready")
        result["message"] = "Research complete, building brief..."

        # Run Brief Builder
        story_brief = self.agents["brief_builder"].run(state)
        state.story_brief = story_brief
        state = manager.transition(state, "brief_ready")
        result["message"] = "Story Brief ready for review at Gate 1"

        # Include the story brief in result for frontend display
        result["story_brief"] = story_brief

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
            "has_story_brief": state.story_brief is not None,
            "has_screen_outline": state.screen_outline is not None,
            "has_storyboard": state.storyboard is not None,
            "created_at": state.created_at,
            "updated_at": state.updated_at,
            # NEW: 3-Round Briefing Flow state
            "brief_round": state.brief_round,
            "confirmed_fields": state.confirmed_fields,
            "research_complete": state.research_complete,
        }

    # =========================================================================
    # NEW: 3-Round Briefing Flow Handlers (Knowledge Share)
    # =========================================================================

    async def _handle_submit_knowledge_share(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle Knowledge Share intake submission.
        Starts research in background and generates Round 1 fields.
        """
        intake_form = payload.get("intake_form")
        if not intake_form:
            raise ValueError("intake_form is required in payload")

        # Store intake form
        state.intake_form = intake_form
        state.brief_round = 1

        # Start Topic Researcher (background - results stored for Round 3)
        # For now, run synchronously and store results
        try:
            research_results = self.agents["researcher"].run(state)
            state.research_results = research_results
            state.research_complete = True
        except Exception as e:
            # Research failed - continue without it
            state.research_results = None
            state.research_complete = False
            result["research_error"] = str(e)

        # Transition to brief_round1
        state = manager.transition(state, "submit_knowledge_share")

        # Generate Round 1 fields
        round1_result = self.agents["brief_builder"].run(
            state,
            round=1
        )

        # Store in story_brief
        state.story_brief = round1_result

        result["message"] = "Knowledge Share brief started. Review Section 1: Core Intent."
        result["brief_fields"] = round1_result.get("fields", {})
        result["round"] = 1
        result["research_status"] = "complete" if state.research_complete else "running"

        return state, result

    async def _handle_round1_confirm(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle Round 1 confirmation (Section 1: Core Intent).
        Stores confirmed fields and generates Round 2 fields.
        """
        confirmed_fields = payload.get("confirmed_fields", {})

        # Merge confirmed fields
        state.confirmed_fields = {
            **state.confirmed_fields,
            **confirmed_fields
        }

        # Transition to brief_round2
        state = manager.transition(state, "round1_confirm")
        state.brief_round = 2

        # Generate Round 2 fields
        round2_result = self.agents["brief_builder"].run(
            state,
            round=2,
            confirmed_fields=state.confirmed_fields
        )

        # Update story_brief with round 2 fields
        if state.story_brief:
            state.story_brief["round"] = 2
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **round2_result.get("fields", {})
            }
        else:
            state.story_brief = round2_result

        result["message"] = "Section 1 confirmed. Review Section 2: Delivery & Format."
        result["brief_fields"] = round2_result.get("fields", {})
        result["round"] = 2
        result["research_status"] = "complete" if state.research_complete else "running"

        return state, result

    async def _handle_round2_confirm(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle Round 2 confirmation (Section 2: Delivery & Format).
        Waits for research if needed, then generates Round 3 fields.
        """
        confirmed_fields = payload.get("confirmed_fields", {})

        # Merge confirmed fields
        state.confirmed_fields = {
            **state.confirmed_fields,
            **confirmed_fields
        }

        # Transition to brief_round3
        state = manager.transition(state, "round2_confirm")
        state.brief_round = 3

        # Generate Round 3 fields (uses research results)
        round3_result = self.agents["brief_builder"].run(
            state,
            round=3,
            confirmed_fields=state.confirmed_fields
        )

        # Update story_brief with round 3 fields
        if state.story_brief:
            state.story_brief["round"] = 3
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **round3_result.get("fields", {})
            }
        else:
            state.story_brief = round3_result

        result["message"] = "Section 2 confirmed. Review Section 3: Content Spine."
        result["brief_fields"] = round3_result.get("fields", {})
        result["round"] = 3
        result["research_status"] = "complete" if state.research_complete else "failed"

        return state, result

    async def _handle_round3_confirm(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle Round 3 confirmation (Section 3: Content Spine).
        Shows full brief review.
        """
        confirmed_fields = payload.get("confirmed_fields", {})

        # Merge confirmed fields
        state.confirmed_fields = {
            **state.confirmed_fields,
            **confirmed_fields
        }

        # Transition to brief_review
        state = manager.transition(state, "round3_confirm")
        state.brief_round = 4  # Review phase

        # Update story_brief with final confirmed fields
        if state.story_brief:
            state.story_brief["round"] = "review"
            # Mark all fields as confirmed in story_brief
            for key, field in state.story_brief.get("fields", {}).items():
                if key in state.confirmed_fields:
                    field["confirmed"] = True
                    field["value"] = state.confirmed_fields[key].get("value", field.get("value"))

        result["message"] = "Section 3 confirmed. Review complete brief before proceeding."
        result["full_brief"] = state.story_brief
        result["confirmed_fields"] = state.confirmed_fields
        result["round"] = "review"

        return state, result

    async def _handle_brief_approve(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle final brief approval.
        Locks the brief and proceeds to Gate 1 (which goes to Director).
        """
        # Lock the brief
        state = manager.lock_brief(state)

        # Transition to gate1 (Director will run on gate1 approve)
        state = manager.transition(state, "brief_approve")

        result["message"] = "Brief approved and locked. Ready for outline generation."
        result["story_brief"] = state.story_brief
        result["brief_locked"] = True

        return state, result

    async def _handle_edit_brief(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle request to edit brief from review.
        Goes back to Round 1 for editing.
        """
        # Transition back to brief_round1
        state = manager.transition(state, "edit_brief")
        state.brief_round = 1

        result["message"] = "Returned to editing mode. All sections editable."
        result["brief_fields"] = state.story_brief.get("fields", {}) if state.story_brief else {}
        result["round"] = 1

        return state, result

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

            mock_state = MockState(story_brief, screen_outline)

            # Run StoryboardWriter directly
            storyboard = self.agents["writer"].run(mock_state)

            return {
                "ai_content": storyboard,
                "sources": [{"type": "ai_generated", "reference": f"Generated via {stage} stage"}],
            }

        elif stage == "polish":
            # Polish stage - just return the existing storyboard
            storyboard_json = previous_stages.get("draft", "[]")
            return {
                "ai_content": storyboard_json,
                "sources": [{"type": "ai_generated", "reference": "Generated via polish stage"}],
            }

        else:
            raise ValueError(f"Unknown stage: {stage}")


# Singleton instance
orchestrator = StoryboardOrchestrator()

"""
Storyboard Orchestrator - Coordinates the multi-agent storyboard generation pipeline.
Manages state transitions, gating points, and revision loops.
"""

from datetime import datetime
from typing import Optional, Dict, Any

from app.services.state import StateManager, StoryboardState, RevisionRecord
from app.services.agents import (
    BriefBuilder,
    StoryboardDirector,
    StoryboardWriter,
)
from app.services.quality_gate import QualityGate


class StoryboardOrchestrator:
    """
    Orchestrates the storyboard generation pipeline.

    Pipeline:
    1. intake -> brief (BriefBuilder) -> brief confirmation is gate1
    2. gate1 -> outline (StoryboardDirector)
    3. outline -> gate2 (Human Review)
    4. gate2 -> write (StoryboardWriter)
    5. write -> review (Optional refinements)
    6. review -> done

    Events:
    - submit: Start the pipeline with the intake form
    - approve: Approve at a gating point
    - edit: Edit at a gating point
        - If within same step: keep all info, allow edits
        - If going to previous step: delete all info in next steps (cascading)

    Edit payload:
    - target: "current" (edit in place) or step name to go back to ("gate1", "gate2")
    - feedback: optional revision feedback
    """

    def __init__(self):
        """Initialize the orchestrator with all agents."""
        self.agents = {
            "brief_builder": BriefBuilder(),
            "director": StoryboardDirector(),
            "writer": StoryboardWriter(),
        }
        self.quality_gate = QualityGate()

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
            event: Event type (submit, approve, edit)
            payload: Event payload (intake_form for submit, target/feedback for edit)

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
            # Core flow: submit, approve, edit
            ("intake", "submit"): self._handle_intake_submit,
            ("gate1", "approve"): self._handle_gate1_approve,
            ("gate1", "edit"): self._handle_gate1_edit,
            ("gate2", "approve"): self._handle_gate2_approve,
            ("gate2", "regenerate_section"): self._handle_regenerate_section,
            ("gate2", "refine_outline"): self._handle_refine_outline,
            ("gate2", "edit"): self._handle_gate2_edit,
            ("review", "approve"): self._handle_review_approve,
            ("review", "edit"): self._handle_review_edit,
            ("done", "restart"): self._handle_restart,

            # Knowledge Share 3-Round Briefing Flow
            ("intake", "submit_knowledge_share"): self._handle_submit_knowledge_share,
            ("brief_round1", "round1_confirm"): self._handle_round1_confirm,
            # RESEARCH DISABLED: these events are no longer used
            # ("brief_round1", "select_perspective"): self._handle_select_perspective,
            # ("brief_round1", "confirm_talking_points"): self._handle_confirm_talking_points,
            ("brief_round2", "round2_confirm"): self._handle_round2_confirm,
            ("brief_round3", "generate_content_spine"): self._handle_generate_content_spine,
            ("brief_round3", "round3_confirm"): self._handle_round3_confirm,
            ("brief_review", "brief_approve"): self._handle_brief_approve,
            ("brief_review", "edit"): self._handle_edit_brief,
            ("brief_round1", "chat_brief_approve"): self._handle_chat_brief_approve,
            ("brief_round2", "chat_brief_approve"): self._handle_chat_brief_approve,
            ("brief_round3", "chat_brief_approve"): self._handle_chat_brief_approve,
            ("brief_review", "chat_brief_approve"): self._handle_chat_brief_approve,
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
        result["message"] = "Intake received, building brief..."

        state = manager.transition(state, "context_ready")
        result["message"] = "Building brief..."

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

        # Support both old flat schema and new nested schema
        if "fields" in state.story_brief:
            # New Knowledge Share schema: {fields: {field_name: {value, source, confirmed}}}
            fields = state.story_brief.get("fields", {})
            required_new = ["viewer_outcome", "target_audience", "core_talking_points"]
            missing = []
            for f in required_new:
                field_data = fields.get(f, {})
                value = field_data.get("value") if isinstance(field_data, dict) else field_data
                # Check for empty value (empty string, empty list, None)
                if not value or (isinstance(value, list) and len(value) == 0):
                    missing.append(f)
            if missing:
                raise ValueError(f"Cannot approve: Story Brief missing required fields: {missing}")
        else:
            # Old flat schema: {video_goal, target_audience, key_points, ...}
            required_fields = ["video_goal", "target_audience", "key_points"]
            missing = [f for f in required_fields if not state.story_brief.get(f)]
            if missing:
                raise ValueError(f"Cannot approve: Story Brief missing required fields: {missing}")

        # Lock the brief
        state = manager.lock_brief(state)
        state = manager.transition(state, "approve")
        result["message"] = "Story Brief approved, creating outline..."

        # Run Storyboard Director with quality gate
        screen_outline, outline_grade = await self.quality_gate.run_with_gate(
            agent=self.agents["director"],
            state=state,
            stage="outline",
        )
        state.screen_outline = screen_outline
        state.outline_grade = outline_grade.to_dict()
        state = manager.transition(state, "outline_ready")
        result["message"] = "Outline ready for review at Gate 2"

        # Include outline in result
        result["screen_outline"] = screen_outline
        result["outline_grade"] = state.outline_grade

        return state, result

    async def _handle_gate1_edit(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle edit at Gate 1.
        Unlocks brief for editing. No cascading delete needed (gate1 is first gate).
        """
        # Unlock brief for editing
        state.brief_locked = False

        # Stay at gate1 phase for editing
        result["message"] = "Story Brief unlocked for editing."
        result["story_brief"] = state.story_brief

        return state, result

    async def _handle_gate2_approve(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle Gate 2 approval - locks outline and runs writer."""
        # VALIDATION: Check screen_outline exists and is non-empty
        if not state.screen_outline:
            raise ValueError("Cannot approve: Outline is empty")

        # For text-based outlines, just check it's non-empty text
        if isinstance(state.screen_outline, str) and len(state.screen_outline.strip()) < 50:
            raise ValueError("Cannot approve: Outline is too short")

        # Lock the outline
        state = manager.lock_outline(state)
        state = manager.transition(state, "approve")
        result["message"] = "Outline approved, generating storyboard..."

        # Run Storyboard Writer with quality gate
        storyboard, storyboard_grade = await self.quality_gate.run_with_gate(
            agent=self.agents["writer"],
            state=state,
            stage="storyboard",
        )
        state.storyboard = storyboard
        state.storyboard_grade = storyboard_grade.to_dict()

        # Cross-stage check
        cross_grade = await self.quality_gate.evaluate(
            stage="cross_stage",
            brief=state.story_brief or {},
            output=storyboard,
            outline=state.screen_outline,
        )
        cross_grade.attempt = 1
        cross_grade.total_attempts = 1
        state.cross_stage_grade = cross_grade.to_dict()

        state = manager.transition(state, "storyboard_ready")
        result["message"] = "Storyboard complete! Review and optionally refine."

        # Include storyboard in result
        result["storyboard"] = storyboard
        result["storyboard_grade"] = state.storyboard_grade
        result["cross_stage_grade"] = state.cross_stage_grade

        return state, result

    async def _handle_gate2_edit(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle edit at Gate 2.

        Payload:
        - target: "current" (edit outline) or "gate1" (go back to brief)
        """
        target = payload.get("target", "current")

        if target == "gate1":
            # Cascade delete: remove outline, go back to gate1
            state.screen_outline = None
            state.outline_locked = False
            state.brief_locked = False
            state = manager.go_back(state, target_gate=1)

            result["message"] = "Returned to Gate 1. Outline deleted, Brief unlocked for editing."
            result["story_brief"] = state.story_brief
            result["cascade_deleted"] = ["screen_outline"]
        else:
            # Outline is edited directly by the user in the textarea — no re-generation
            state.outline_locked = False
            result["message"] = "Outline unlocked for editing."
            result["screen_outline"] = state.screen_outline

        return state, result

    async def _handle_regenerate_section(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Regenerate a single section of the outline based on user instruction."""
        section_number = payload.get("section_number")
        instruction = payload.get("instruction", "")
        if not section_number or not instruction:
            raise ValueError("section_number and instruction are required")

        # Prefer frontend's current outline (includes user edits) over backend state
        current_outline = payload.get("current_outline") or state.screen_outline or ""
        if not current_outline:
            raise ValueError("Cannot regenerate section: no outline exists")

        state = manager.transition(state, "regenerate_section")

        new_outline = self.agents["director"].regenerate_section(
            current_outline=current_outline,
            section_number=section_number,
            instruction=instruction,
            story_brief=state.story_brief or {},
        )
        state.screen_outline = new_outline
        result["message"] = f"Section {section_number} regenerated."
        result["screen_outline"] = new_outline
        return state, result

    async def _handle_refine_outline(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Regenerate the full outline based on user instruction."""
        instruction = payload.get("instruction", "")
        if not instruction:
            raise ValueError("instruction is required")

        # Prefer frontend's current outline (includes user edits) over backend state
        current_outline = payload.get("current_outline") or state.screen_outline or ""
        if not current_outline:
            raise ValueError("Cannot refine outline: no outline exists")

        state = manager.transition(state, "refine_outline")

        new_outline = self.agents["director"].refine_outline(
            current_outline=current_outline,
            instruction=instruction,
            story_brief=state.story_brief or {},
        )
        state.screen_outline = new_outline
        result["message"] = "Outline regenerated."
        result["screen_outline"] = new_outline
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
            if not screen.get("duration"):
                raise ValueError(f"Cannot approve: Screen {i+1} missing duration")

        state = manager.transition(state, "approve")
        result["message"] = "Storyboard finalized!"
        result["storyboard"] = state.storyboard

        return state, result

    async def _handle_review_edit(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle edit at Review phase.

        Payload:
        - target: "current" (refine storyboard), "gate2" (go back to outline), or "gate1" (go back to brief)
        - feedback: optional revision feedback for refinement
        """
        target = payload.get("target", "current")
        feedback = payload.get("feedback")

        if target == "gate1":
            # Cascade delete: remove storyboard AND outline, go back to gate1
            state.storyboard = None
            state.screen_outline = None
            state.outline_locked = False
            state.brief_locked = False
            state = manager.go_back(state, target_gate=1)

            result["message"] = "Returned to Gate 1. Storyboard and Outline deleted, Brief unlocked for editing."
            result["story_brief"] = state.story_brief
            result["cascade_deleted"] = ["storyboard", "screen_outline"]

        elif target == "gate2":
            # Cascade delete: remove storyboard, go back to gate2
            state.storyboard = None
            state.outline_locked = False
            state = manager.go_back(state, target_gate=2)

            result["message"] = "Returned to Gate 2. Storyboard deleted, Outline unlocked for editing."
            result["screen_outline"] = state.screen_outline
            result["cascade_deleted"] = ["storyboard"]

        else:
            # No revision mode — user edits directly. Go back to gate2 for re-approval.
            state.storyboard = None
            state.outline_locked = False
            state = manager.go_back(state, target_gate=2)

            result["message"] = "Returned to Gate 2. Edit the outline and re-approve."
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
            "research_complete": getattr(state, 'research_complete', False),
            "has_evidence_research": state.evidence_research is not None,
            "outline_grade": state.outline_grade,
            "storyboard_grade": state.storyboard_grade,
            "cross_stage_grade": state.cross_stage_grade,
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
        Generates Round 1 fields immediately from intake form.
        Research runs later after Round 1 confirmation.
        """
        import time
        start_time = time.time()
        print(f"[KS] _handle_submit_knowledge_share started")

        intake_form = payload.get("intake_form")
        if not intake_form:
            raise ValueError("intake_form is required in payload")

        print(f"[KS] intake_form: {intake_form}")

        # Store intake form
        state.intake_form = intake_form
        state.brief_round = 1

        # RESEARCH DISABLED: research is skipped entirely
        state.research_results = None
        state.research_complete = True  # Mark as complete since we're skipping it

        # Transition to brief_round1
        state = manager.transition(state, "submit_knowledge_share")
        print(f"[KS] State transitioned in {(time.time() - start_time)*1000:.0f}ms")

        # Generate Round 1 fields (no research needed - just extract from intake)
        brief_start = time.time()
        round1_result = self.agents["brief_builder"].run(
            state,
            round=1
        )
        print(f"[KS] BriefBuilder.run() completed in {(time.time() - brief_start)*1000:.0f}ms")

        # Store in story_brief
        state.story_brief = round1_result

        result["message"] = "Knowledge Share brief started. Review Section 1: Core Intent."
        result["brief_fields"] = round1_result.get("fields", {})
        result["round"] = 1
        result["research_status"] = "complete"  # RESEARCH DISABLED: always complete

        print(f"[KS] _handle_submit_knowledge_share completed in {(time.time() - start_time)*1000:.0f}ms")
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
        RESEARCH DISABLED: Skips perspective generation, transitions directly to Round 2.
        """
        confirmed_fields = payload.get("confirmed_fields", {})

        # Ensure state.confirmed_fields is a dict
        if state.confirmed_fields is None:
            state.confirmed_fields = {}

        # Merge confirmed fields
        state.confirmed_fields = {
            **state.confirmed_fields,
            **confirmed_fields
        }

        # Transition directly to Round 2
        state = manager.transition(state, "round1_confirm")
        state.brief_round = 2
        state.research_complete = True

        # Generate Round 2 fields
        round2_result = self.agents["brief_builder"].run(
            state,
            round=2,
            confirmed_fields=state.confirmed_fields
        )

        # Update story_brief with confirmed Round 1 values + new Round 2 fields
        if state.story_brief:
            state.story_brief["round"] = 2
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **confirmed_fields,  # User's confirmed Round 1 values
                **round2_result.get("fields", {})
            }
        else:
            state.story_brief = round2_result

        result["message"] = "Section 1 confirmed. Moving to Section 2: Delivery & Format."
        result["status"] = "round2_ready"
        result["brief_fields"] = round2_result.get("fields", {})
        result["round"] = 2
        result["research_status"] = "complete"

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
        Transitions to brief_round3. Round 3 fields generated after user provides POV.
        """
        confirmed_fields = payload.get("confirmed_fields", {})

        # Merge confirmed fields
        state.confirmed_fields = {
            **state.confirmed_fields,
            **confirmed_fields
        }

        # Transition to brief_round3 — Round 3 fields generated after user provides POV
        state = manager.transition(state, "round2_confirm")
        state.brief_round = 3

        # Write confirmed Round 2 values back to story_brief for state restoration
        if state.story_brief:
            state.story_brief["round"] = 3
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **confirmed_fields,
            }

        result["message"] = "Section 2 confirmed. Moving to Section 3: Content Spine."
        result["brief_fields"] = {}
        result["round"] = 3
        result["research_status"] = "complete" if state.research_complete else "failed"

        return state, result

    async def _handle_generate_content_spine(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle POV submission: store POV, generate content spine fields via BriefBuilder.
        Does NOT transition state — stays in brief_round3.
        """
        point_of_view = payload.get("point_of_view", "")
        if not point_of_view:
            raise ValueError("point_of_view is required in payload")

        feedback = payload.get("feedback")  # Optional regeneration feedback

        # Store POV in confirmed fields
        state.confirmed_fields["point_of_view"] = {
            "value": point_of_view,
            "source": "extracted",
            "confirmed": True,
        }

        # Self-loop transition (stays in brief_round3)
        state = manager.transition(state, "generate_content_spine")

        # Generate content spine from POV
        round3_result = self.agents["brief_builder"].run(
            state,
            round=3,
            confirmed_fields=state.confirmed_fields,
            revision_feedback=feedback,
        )

        # Update story_brief with generated fields
        if state.story_brief:
            state.story_brief["round"] = 3
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **round3_result.get("fields", {}),
                "point_of_view": {
                    "value": point_of_view,
                    "source": "extracted",
                    "confirmed": True,
                },
            }
        else:
            fields = round3_result.get("fields", {})
            fields["point_of_view"] = {
                "value": point_of_view,
                "source": "extracted",
                "confirmed": True,
            }
            state.story_brief = {"round": 3, "fields": fields}

        result["message"] = "Content spine generated. Review and edit before confirming."
        result["brief_fields"] = round3_result.get("fields", {})
        result["round"] = 3

        return state, result

    async def _handle_round3_confirm(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle Round 3 confirmation. Stores all Content Spine fields and transitions to brief_review.
        """
        confirmed_fields = payload.get("confirmed_fields", {})

        # Merge confirmed fields
        state.confirmed_fields = {
            **state.confirmed_fields,
            **confirmed_fields
        }

        # Transition to brief_review (direct, no angle_selection)
        state = manager.transition(state, "round3_confirm")
        state.brief_round = 4  # Review phase

        # Write confirmed Round 3 values back to story_brief for state restoration
        if state.story_brief:
            state.story_brief["round"] = "review"
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **confirmed_fields,
            }

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
        Locks the brief and runs the Director to generate outline.
        """
        # Lock the brief
        state = manager.lock_brief(state)

        # Transition to gate1
        state = manager.transition(state, "brief_approve")

        # Immediately run Director with quality gate (combining brief_approve + gate1_approve)
        state = manager.transition(state, "approve")  # gate1 → outline
        screen_outline, outline_grade = await self.quality_gate.run_with_gate(
            agent=self.agents["director"],
            state=state,
            stage="outline",
        )
        state.screen_outline = screen_outline
        state.outline_grade = outline_grade.to_dict()
        state = manager.transition(state, "outline_ready")  # outline → gate2

        result["message"] = "Screen Outline ready for review"
        result["story_brief"] = state.story_brief
        result["brief_locked"] = True
        result["screen_outline"] = screen_outline
        result["outline_grade"] = state.outline_grade

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

    async def _handle_chat_brief_approve(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle chat-based brief approval.
        Accepts all fields at once, batch-transitions through rounds, then runs Director.
        """
        all_fields = payload.get("all_fields", {})
        if not all_fields:
            raise ValueError("all_fields is required in payload")

        # Store all fields in state
        state.confirmed_fields = all_fields
        if not state.story_brief:
            state.story_brief = {"round": "review", "fields": all_fields}
        else:
            state.story_brief["round"] = "review"
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **all_fields,
            }

        # Force phase to brief_review for the approve transition
        state.phase = "brief_review"

        # Lock the brief
        state = manager.lock_brief(state)

        # Transition to gate1
        state = manager.transition(state, "brief_approve")

        # Immediately run Director with quality gate (combining brief_approve + gate1_approve)
        state = manager.transition(state, "approve")  # gate1 → outline
        screen_outline, outline_grade = await self.quality_gate.run_with_gate(
            agent=self.agents["director"],
            state=state,
            stage="outline",
        )
        state.screen_outline = screen_outline
        state.outline_grade = outline_grade.to_dict()
        state = manager.transition(state, "outline_ready")  # outline → gate2

        result["message"] = "Screen Outline ready for review"
        result["story_brief"] = state.story_brief
        result["brief_locked"] = True
        result["screen_outline"] = screen_outline
        result["outline_grade"] = state.outline_grade

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

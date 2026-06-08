"""
Storyboard Orchestrator - Coordinates the multi-agent storyboard generation pipeline.
Manages state transitions, gating points, and revision loops.
"""

from datetime import datetime
import json
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
        state = await manager.load()
        normalized_event, normalized_payload = self._normalize_event_alias(
            phase=state.phase,
            event=event,
            payload=payload,
        )

        result = {
            "phase": state.phase,
            "previous_phase": state.phase,
            "event": normalized_event,
            "success": True,
            "message": "",
        }
        if normalized_event != event:
            result["requested_event"] = event

        try:
            ks_initialized_phases = {
                "brief_chat",
                "brief_review",
                "gate1",
                "outline",
                "gate2",
                "outline_research",
                "write",
                "review",
                "done",
            }

            if normalized_event in {"submit_guided_brief", "submit_knowledge_share"} and state.phase in ks_initialized_phases:
                state, result = await self._handle_submit_knowledge_share_reentrant(
                    state, manager, normalized_payload, result
                )
            else:
                # Route based on current phase and event
                handler = self._get_handler(state.phase, normalized_event)
                if handler:
                    state, result = await handler(state, manager, normalized_payload, result)
                else:
                    raise ValueError(
                        f"Invalid event '{event}' for phase '{state.phase}'. "
                        f"Valid events: {manager._valid_events_for_phase(state.phase)}"
                    )

            await manager.save(state)
            result["phase"] = state.phase
            result["state"] = self._serialize_state(state)

        except Exception as e:
            result["success"] = False
            result["message"] = str(e)
            result["error"] = str(e)

        return result

    def _normalize_event_alias(
        self,
        phase: str,
        event: str,
        payload: Dict[str, Any],
    ) -> tuple[str, Dict[str, Any]]:
        """
        Keep public event names stable even when internal handlers use a more
        specific contract. This prevents frontend/API drift from turning into
        Invalid event errors.
        """
        if phase == "brief_review" and event == "approve":
            return "brief_approve", payload

        if phase == "brief_review" and event == "edit_brief":
            return "edit", payload

        if event not in {"reject", "refine"}:
            return event, payload

        feedback = payload.get("feedback") or payload.get("instruction")
        if not feedback:
            raise ValueError("feedback is required")

        if phase == "gate2":
            return "refine_outline", {
                **payload,
                "instruction": feedback,
            }

        if phase in {"gate1", "brief_review", "review"}:
            return "edit", {
                **payload,
                "target": payload.get("target", "current"),
                "feedback": feedback,
            }

        return event, payload

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
            ("gate2", "chat_brief_approve"): self._handle_reapprove_brief_from_downstream,
            ("gate2", "edit"): self._handle_gate2_edit,
            ("review", "approve"): self._handle_review_approve,
            ("review", "edit"): self._handle_review_edit,
            ("done", "restart"): self._handle_restart,

            # Guided chat-assisted brief flow
            ("intake", "submit_guided_brief"): self._handle_submit_knowledge_share,
            ("intake", "submit_knowledge_share"): self._handle_submit_knowledge_share,
            ("brief_review", "brief_approve"): self._handle_brief_approve,
            ("brief_review", "edit"): self._handle_edit_brief,
            ("brief_chat", "chat_brief_approve"): self._handle_chat_brief_approve,
            ("brief_review", "chat_brief_approve"): self._handle_chat_brief_approve,
        }
        return handlers.get((phase, event))

    def _raise_if_quality_gate_failed(self, stage_label: str, eval_result) -> None:
        """Stop the pipeline when the quality gate rejects the output."""
        if eval_result.passed:
            return

        parts = [
            f"{stage_label} quality gate failed after {eval_result.total_attempts} attempt(s)",
            f"(best score: {eval_result.composite_score}/10).",
        ]

        if eval_result.gut and eval_result.gut.feedback:
            parts.append(f"Gut check: {eval_result.gut.feedback}")

        if eval_result.dimensions:
            weakest = min(eval_result.dimensions, key=lambda item: item.score)
            if weakest.feedback:
                parts.append(f"Weakest dimension ({weakest.dimension}): {weakest.feedback}")

        raise ValueError(" ".join(parts))

    def _coerce_json_payload(self, payload: Any, field_name: str) -> Any:
        """Parse JSON strings from event payloads while accepting already-parsed objects."""
        if payload is None:
            return None
        if isinstance(payload, str):
            try:
                return json.loads(payload)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{field_name} must be valid JSON when provided as a string") from exc
        return payload

    async def _handle_intake_submit(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """Handle intake form submission for the legacy brief flow."""
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
        current_story_brief = self._coerce_json_payload(
            payload.get("current_story_brief"),
            "current_story_brief",
        )
        if current_story_brief is not None:
            state.story_brief = current_story_brief

        # VALIDATION: Check story_brief exists and has content
        if not state.story_brief:
            raise ValueError("Cannot approve: Story Brief is empty")

        # Support both old flat schema and new nested schema
        if "fields" in state.story_brief:
            # New guided brief schema: {fields: {field_name: {value, source, confirmed}}}
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
        screen_outline, outline_eval = await self.quality_gate.run_with_gate(
            agent=self.agents["director"],
            state=state,
            stage="outline",
        )
        self._raise_if_quality_gate_failed("Outline", outline_eval)
        state.screen_outline = screen_outline
        state.outline_eval = outline_eval.to_dict()
        try:
            from app.infra.quality_log import qlog
            qlog.log_generate(
                project_id=state.project_id,
                stage="outline",
                scope="full",
                attempt=outline_eval.attempt,
                model=self.quality_gate.model,
                prompt_ref=self.agents["director"].prompt_file,
                context=str(state.story_brief),
                raw_response=str(screen_outline),
                parsed_output=screen_outline if isinstance(screen_outline, (dict, list)) else None,
            )
        except Exception:
            pass
        state = manager.transition(state, "outline_ready")
        result["message"] = "Outline ready for review at Gate 2"

        # Include outline in result
        result["screen_outline"] = screen_outline
        result["outline_eval"] = state.outline_eval

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
        current_outline = self._coerce_json_payload(
            payload.get("current_outline"),
            "current_outline",
        )
        if current_outline is not None:
            state.screen_outline = current_outline

        if payload.get("evidence_research") is not None:
            state.evidence_research = payload.get("evidence_research")

        # VALIDATION: Check screen_outline exists and is non-empty
        if not state.screen_outline:
            raise ValueError("Cannot approve: Outline is empty")

        # For text-based outlines, just check it's non-empty text
        if isinstance(state.screen_outline, str) and len(state.screen_outline.strip()) < 50:
            raise ValueError("Cannot approve: Outline is too short")
        if isinstance(state.screen_outline, str):
            self.agents["writer"].validate_outline_contract(state.screen_outline)

        # Lock the outline
        state = manager.lock_outline(state)
        state = manager.transition(state, "approve")
        result["message"] = "Outline approved, generating storyboard..."

        # Run Storyboard Writer with quality gate
        storyboard, storyboard_eval = await self.quality_gate.run_with_gate(
            agent=self.agents["writer"],
            state=state,
            stage="storyboard",
            outline_for_cross_stage=state.screen_outline,
        )
        self._raise_if_quality_gate_failed("Storyboard", storyboard_eval)
        state.storyboard = storyboard
        state.storyboard_eval = storyboard_eval.to_dict()
        try:
            from app.infra.quality_log import qlog
            qlog.log_generate(
                project_id=state.project_id,
                stage="storyboard",
                scope="full",
                attempt=storyboard_eval.attempt,
                model=self.quality_gate.model,
                prompt_ref=self.agents["writer"].prompt_file,
                context=f"brief: {state.story_brief}\noutline: {state.screen_outline}",
                raw_response=str(storyboard),
                parsed_output=storyboard if isinstance(storyboard, (dict, list)) else None,
            )
        except Exception:
            pass

        state = manager.transition(state, "storyboard_ready")
        result["message"] = "Storyboard complete! Review and optionally refine."

        # Include storyboard in result
        result["storyboard"] = storyboard
        result["storyboard_eval"] = state.storyboard_eval

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
        current_storyboard = self._coerce_json_payload(
            payload.get("current_storyboard"),
            "current_storyboard",
        )
        if current_storyboard is not None:
            state.storyboard = current_storyboard

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
            "confirmed_fields": state.confirmed_fields,
            "has_evidence_research": state.evidence_research is not None,
            "outline_eval": state.outline_eval,
            "storyboard_eval": state.storyboard_eval,
        }

    # =========================================================================
    # Guided Chat Brief Flow
    # =========================================================================

    async def _handle_submit_knowledge_share(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle guided brief intake submission.
        Generates the initial brief seed from onboarding data and moves to the
        single chat-assisted brief phase.
        """
        import time
        start_time = time.time()
        print(f"[Brief] _handle_submit_guided_brief started")

        intake_form = payload.get("intake_form")
        if not intake_form:
            raise ValueError("intake_form is required in payload")

        print(f"[Brief] intake_form: {intake_form}")

        # Store intake form
        state.intake_form = intake_form

        # Transition to the single chat-assisted brief phase
        state = manager.transition(state, "submit_knowledge_share")
        print(f"[Brief] State transitioned in {(time.time() - start_time)*1000:.0f}ms")

        # Generate the initial field seed from onboarding data
        brief_start = time.time()
        round1_result = self.agents["brief_builder"].run(
            state,
            round=1
        )
        print(f"[Brief] BriefBuilder.run() completed in {(time.time() - brief_start)*1000:.0f}ms")

        # Store in story_brief
        state.story_brief = round1_result

        result["message"] = "Guided video brief started."
        result["brief_fields"] = round1_result.get("fields", {})

        print(f"[Brief] _handle_submit_guided_brief completed in {(time.time() - start_time)*1000:.0f}ms")
        return state, result

    async def _handle_submit_knowledge_share_reentrant(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Treat repeat guided brief initialization as idempotent.

        This protects the dev flow under React StrictMode, where the brief
        stage can mount twice and issue a duplicate submit event
        before the UI finishes hydrating.
        """
        existing_fields = {}
        if state.story_brief:
            existing_fields = state.story_brief.get("fields", {}) or {}

        if not state.intake_form and payload.get("intake_form"):
            state.intake_form = payload["intake_form"]

        print(f"[Brief] Reusing existing guided brief initialization at phase={state.phase}")
        result["message"] = f"Guided brief already initialized at {state.phase}."
        result["brief_fields"] = existing_fields
        result["story_brief"] = state.story_brief

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
        screen_outline, outline_eval = await self.quality_gate.run_with_gate(
            agent=self.agents["director"],
            state=state,
            stage="outline",
        )
        self._raise_if_quality_gate_failed("Outline", outline_eval)
        state.screen_outline = screen_outline
        state.outline_eval = outline_eval.to_dict()
        try:
            from app.infra.quality_log import qlog
            qlog.log_generate(
                project_id=state.project_id,
                stage="outline",
                scope="full",
                attempt=outline_eval.attempt,
                model=self.quality_gate.model,
                prompt_ref=self.agents["director"].prompt_file,
                context=str(state.story_brief),
                raw_response=str(screen_outline),
                parsed_output=screen_outline if isinstance(screen_outline, (dict, list)) else None,
            )
        except Exception:
            pass
        state = manager.transition(state, "outline_ready")  # outline → gate2

        result["message"] = "Screen Outline ready for review"
        result["story_brief"] = state.story_brief
        result["brief_locked"] = True
        result["screen_outline"] = screen_outline
        result["outline_eval"] = state.outline_eval

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
        # Transition back to the single chat-assisted brief phase
        state = manager.transition(state, "edit")

        result["message"] = "Returned to chat-assisted brief editing."
        result["brief_fields"] = state.story_brief.get("fields", {}) if state.story_brief else {}

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
        Accepts the final brief fields at once and enters Gate 1 with the
        briefing document ready for approval.
        """
        all_fields = payload.get("all_fields", {})
        if not all_fields:
            raise ValueError("all_fields is required in payload")

        # Store all fields in state
        state.confirmed_fields = all_fields
        if not state.story_brief:
            state.story_brief = {"fields": all_fields}
        else:
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **all_fields,
            }

        # Finalize the chat-built briefing document and enter Gate 1.
        state = manager.transition(state, "chat_brief_approve")

        result["message"] = "Video brief ready for Gate 1 review."
        result["story_brief"] = state.story_brief
        result["brief_locked"] = state.brief_locked

        return state, result

    async def _handle_reapprove_brief_from_downstream(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Re-approve an edited brief after the project has already reached Gate 2.

        The frontend lets users navigate back to the brief and edit it directly.
        In that case the backend may still be in gate2, so chat_brief_approve
        means "save this edited brief and regenerate the outline."
        """
        all_fields = payload.get("all_fields", {})
        if not all_fields:
            raise ValueError("all_fields is required in payload")

        state.confirmed_fields = all_fields
        if not state.story_brief:
            state.story_brief = {"fields": all_fields}
        else:
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **all_fields,
            }

        state.screen_outline = None
        state.storyboard = None
        state.outline_eval = None
        state.storyboard_eval = None
        state = manager.go_back(state, target_gate=1)

        result["message"] = "Edited brief saved. Regenerating outline..."
        result["story_brief"] = state.story_brief
        result["brief_reapproved_from_phase"] = "gate2"

        return await self._handle_gate1_approve(
            state,
            manager,
            {"current_story_brief": state.story_brief},
            result,
        )
# Singleton instance
orchestrator = StoryboardOrchestrator()

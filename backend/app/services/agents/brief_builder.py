"""
Brief Builder Agent - Creates the initial Story Brief seed from intake form.
Generates fields with proper source tagging (extracted vs inferred).
"""

from typing import Any, Optional

from app.services.video_intent import infer_video_intent_route, make_brief_field

from .base import BaseAgent


class BriefBuilder(BaseAgent):
    """
    Initial brief generation for guided video briefs.

    Field sources are determined by WHERE data comes from:
    - extracted: directly from user-provided inputs (form submission or explicit answers)
    - inferred: suggested by the system (AI inference)
    - empty: not set
    """

    prompt_file = "CONTENT_SPINE_PROMPT_v0603.md"

    def run(
        self,
        state: Any,
        round: int = 1,
        confirmed_fields: Optional[dict] = None,
        revision_feedback: Optional[str] = None,
        **kwargs
    ) -> dict:
        """
        Build Story Brief fields for a specific round.

        Args:
            state: StoryboardState with intake_form
            round: Which round to generate (1, 2, or 3)
            confirmed_fields: Fields confirmed from previous rounds
            revision_feedback: Optional feedback for revisions

        Returns:
            dict with { round: int, fields: { key: { value, source, confirmed } } }
        """
        if not state.intake_form:
            raise ValueError("BriefBuilder requires intake_form in state")

        confirmed_fields = confirmed_fields or {}

        if round == 1:
            return self._generate_round1(state.intake_form)
        elif round == 2:
            return self._generate_round2(state.intake_form, confirmed_fields)
        elif round == 3:
            return self._generate_round3(state.intake_form, confirmed_fields, revision_feedback)
        else:
            raise ValueError(f"Invalid round: {round}. Must be 1, 2, or 3.")

    def _generate_round1(self, intake_form: dict) -> dict:
        """
        Generate Section 1: Core Intent fields.

        Returns fields immediately (no LLM call). Route-specific defaults are
        inferred from user intent so the user does not have to choose a type.

        Field source mapping:
        - video_type / intent_route / content_mode: inferred route metadata
        - viewer_outcome: empty (user fills in — merged from old primary_goal + one_big_thing)
        - target_audience: extracted (from initial form)
        - duration: extracted (from initial form)
        - audience_level / platform / delivery fields: inferred route defaults unless provided
        """
        fields = {}
        route = infer_video_intent_route(intake_form)

        fields["video_type"] = make_brief_field(route.key, "inferred", True)
        fields["intent_route"] = make_brief_field(route.key, "inferred", True)
        fields["content_mode"] = make_brief_field(route.content_mode, "inferred", True)
        fields["format_style"] = make_brief_field(route.label, "inferred", True)
        fields["route_summary"] = make_brief_field(route.summary, "inferred", True)

        # viewer_outcome - empty (user fills in)
        # Combines old primary_goal and one_big_thing into a single field
        fields["viewer_outcome"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # target_audience - extracted from form
        target_audience = intake_form.get("target_audience", "")
        fields["target_audience"] = {
            "value": target_audience,
            "source": "extracted" if target_audience else "empty",
            "confirmed": False,
        }

        # duration - extracted from form (can be "duration", "desired_length", or minutes)
        # Auto-confirmed when extracted from onboarding (not shown in Section 1 form)
        duration = intake_form.get("duration") or intake_form.get("desired_length", "")
        if not duration and intake_form.get("duration_minutes"):
            try:
                duration = int(float(intake_form["duration_minutes"])) * 60
            except (TypeError, ValueError):
                duration = ""
        fields["duration"] = {
            "value": str(duration) if duration else "",
            "source": "extracted" if duration else "empty",
            "confirmed": True if duration else False,
        }

        # Route defaults guide the questions, outline shape, and allowed visuals.
        fields["audience_level"] = {
            "value": intake_form.get("audience_level") or route.default_audience_level,
            "source": "extracted" if intake_form.get("audience_level") else "inferred",
            "confirmed": bool(intake_form.get("audience_level")),
        }

        fields["platform"] = {
            "value": intake_form.get("platform") or route.default_platform,
            "source": "extracted" if intake_form.get("platform") else "inferred",
            "confirmed": bool(intake_form.get("platform")),
        }

        fields["on_camera_presence"] = make_brief_field(
            intake_form.get("on_camera_presence") or route.default_on_camera_presence,
            "extracted" if intake_form.get("on_camera_presence") else "inferred",
            bool(intake_form.get("on_camera_presence")),
        )
        fields["broll_type"] = make_brief_field(
            intake_form.get("broll_type") or list(route.default_broll_type),
            "extracted" if intake_form.get("broll_type") else "inferred",
            bool(intake_form.get("broll_type")),
        )
        fields["delivery_tone"] = make_brief_field(
            intake_form.get("delivery_tone") or route.default_tone,
            "extracted" if intake_form.get("delivery_tone") else "inferred",
            bool(intake_form.get("delivery_tone")),
        )
        fields["freshness_expectation"] = make_brief_field(
            intake_form.get("freshness_expectation") or route.default_freshness,
            "extracted" if intake_form.get("freshness_expectation") else "inferred",
            bool(intake_form.get("freshness_expectation")),
        )

        return {"fields": fields}

    def _generate_round2(self, intake_form: dict, confirmed_fields: dict) -> dict:
        """
        Generate Section 2: Delivery & Format fields.

        Round 2 defaults are route-aware and can be edited/confirmed by users.
        No LLM call to ensure immediate response.

        Field source mapping:
        - on_camera_presence: empty (user selects)
        - broll_type: empty (user selects)
        - delivery_tone: empty (user selects)
        - freshness_expectation: empty (user selects)
        """
        route = infer_video_intent_route({**intake_form, **confirmed_fields})
        fields = {
            "on_camera_presence": make_brief_field(
                intake_form.get("on_camera_presence") or route.default_on_camera_presence,
                "extracted" if intake_form.get("on_camera_presence") else "inferred",
                bool(intake_form.get("on_camera_presence")),
            ),
            "broll_type": make_brief_field(
                intake_form.get("broll_type") or list(route.default_broll_type),
                "extracted" if intake_form.get("broll_type") else "inferred",
                bool(intake_form.get("broll_type")),
            ),
            "delivery_tone": make_brief_field(
                intake_form.get("delivery_tone") or route.default_tone,
                "extracted" if intake_form.get("delivery_tone") else "inferred",
                bool(intake_form.get("delivery_tone")),
            ),
            "freshness_expectation": make_brief_field(
                intake_form.get("freshness_expectation") or route.default_freshness,
                "extracted" if intake_form.get("freshness_expectation") else "inferred",
                bool(intake_form.get("freshness_expectation")),
            ),
        }

        return {"fields": fields}

    def _generate_round3(
        self,
        intake_form: dict,
        confirmed_fields: dict,
        revision_feedback: Optional[str] = None,
    ) -> dict:
        """
        Generate Section 3: Content Spine fields from user's Point of View.
        Loads the route-aware content spine prompt and injects brief context.
        POV is the source of truth. All fields are downstream derivations.
        """
        # Extract confirmed field values for context
        def get_val(key: str, default: str = "") -> str:
            field = confirmed_fields.get(key, {})
            if isinstance(field, dict) and "value" in field:
                v = field["value"]
                return ", ".join(v) if isinstance(v, list) else str(v)
            return str(field) if field else default

        point_of_view = get_val("point_of_view")
        intent_route = get_val("intent_route") or get_val("video_type")
        content_mode = get_val("content_mode")
        format_style = get_val("format_style")
        viewer_outcome = get_val("viewer_outcome")
        target_audience = get_val("target_audience")
        audience_level = get_val("audience_level", "intermediate")
        duration = get_val("duration", "300")
        platform = get_val("platform")
        delivery_tone = get_val("delivery_tone")
        freshness = get_val("freshness_expectation")

        # System prompt = CONTENT_SPINE_PROMPT_v0603.md (loaded by BaseAgent)
        # User prompt = brief context only (POV + audience + duration etc.)
        prompt = f"""## POINT OF VIEW (source of truth)
{point_of_view}

## BRIEF CONTEXT
- Intent Route: {intent_route}
- Content Mode: {content_mode}
- Format Style: {format_style}
- Target Audience: {target_audience}
- Audience Level: {audience_level}
- Viewer Outcome: {viewer_outcome}
- Duration: {duration} seconds
- Platform: {platform}
- Delivery Tone: {delivery_tone}
- Freshness: {freshness}"""

        if revision_feedback:
            prompt += f"""

## REVISION FEEDBACK
The user reviewed the previous generation and wants changes:
{revision_feedback}

Regenerate the content spine incorporating this feedback."""

        # Call LLM to generate content spine
        try:
            response = self.call_llm(prompt, max_tokens=2000, temperature=0.7)
            parsed = self._extract_json(response)
        except Exception as e:
            print(f"[BriefBuilder] Round 3 LLM call failed: {e}")
            parsed = None

        # Build fields from LLM response or fallback to empty
        if parsed and isinstance(parsed, dict):
            talking_points = parsed.get("core_talking_points", [])
            # Accept both "misconception" (new) and "misconceptions" (legacy)
            misconception = parsed.get("misconception") or parsed.get("misconceptions", "")
            # must_avoid commented out — P3: gather requirements on must-avoid types
            # must_avoid = parsed.get("must_avoid", [])

            # Ensure talking_points is a list
            if isinstance(talking_points, str):
                talking_points = [talking_points]
            # misconception should be a string; if LLM returned a list, take the first
            if isinstance(misconception, list):
                misconception = misconception[0] if misconception else ""

            fields = {
                "core_talking_points": {
                    "value": talking_points,
                    "source": "inferred",
                    "confirmed": False,
                },
                "misconceptions": {
                    "value": misconception,
                    "source": "inferred",
                    "confirmed": False,
                },
                # "must_avoid": { "value": must_avoid, "source": "inferred", "confirmed": False },
            }
        else:
            # Fallback: empty fields for user input
            fields = {
                "core_talking_points": {
                    "value": [],
                    "source": "empty",
                    "confirmed": False,
                },
                "misconceptions": {
                    "value": "",
                    "source": "empty",
                    "confirmed": False,
                },
                # "must_avoid": { "value": [], "source": "empty", "confirmed": False },
            }

        return {"fields": fields}

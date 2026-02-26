"""
Brief Builder Agent - Creates Story Brief from intake form using 3-round flow.
Generates fields with proper source tagging (extracted vs inferred).
"""

import json
from typing import Any, Optional

from .base import BaseAgent


class BriefBuilder(BaseAgent):
    """
    Three-round brief generation for Knowledge Share videos.

    Field sources are determined by WHERE data comes from:
    - extracted: directly from user-provided inputs (form submission or explicit answers)
    - inferred: suggested by the system (AI inference)
    - empty: not set
    """

    prompt_file = "BRIEF_BUILDER_SYSTEM_PROMPT.md"

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
            research_results = getattr(state, 'research_results', None) or {}
            return self._generate_round3(state.intake_form, confirmed_fields, research_results)
        else:
            raise ValueError(f"Invalid round: {round}. Must be 1, 2, or 3.")

    def _generate_round1(self, intake_form: dict) -> dict:
        """
        Generate Section 1: Core Intent fields.

        Field source mapping:
        - video_type: extracted (user selection), confirmed=true
        - primary_goal: inferred (AI prefill from user description)
        - target_audience: extracted (from initial form)
        - audience_level: inferred (AI guess) or empty
        - platform: inferred (AI guess from context)
        - duration: extracted (from initial form)
        - one_big_thing: empty (preferred) or inferred (AI suggestion)
        - viewer_next_action: inferred (AI suggestion)
        """
        fields = {}

        # video_type is always extracted and confirmed
        fields["video_type"] = {
            "value": "knowledge_share",
            "source": "extracted",
            "confirmed": True,
        }

        # target_audience - extracted from form
        target_audience = intake_form.get("target_audience", "")
        fields["target_audience"] = {
            "value": target_audience,
            "source": "extracted" if target_audience else "empty",
            "confirmed": False,
        }

        # duration - extracted from form (can be "duration" or "desired_length")
        duration = intake_form.get("duration") or intake_form.get("desired_length", "")
        fields["duration"] = {
            "value": str(duration) if duration else "",
            "source": "extracted" if duration else "empty",
            "confirmed": False,
        }

        # AI-inferred fields - call LLM to generate
        ai_suggestions = self._call_llm_for_round1(intake_form)

        # primary_goal - inferred from user description
        primary_goal = ai_suggestions.get("primary_goal", "")
        fields["primary_goal"] = {
            "value": primary_goal,
            "source": "inferred" if primary_goal else "empty",
            "confirmed": False,
        }

        # audience_level - inferred
        audience_level = ai_suggestions.get("audience_level", "")
        fields["audience_level"] = {
            "value": audience_level,
            "source": "inferred" if audience_level else "empty",
            "confirmed": False,
        }

        # platform - inferred
        platform = ai_suggestions.get("platform", "")
        fields["platform"] = {
            "value": platform,
            "source": "inferred" if platform else "empty",
            "confirmed": False,
        }

        # one_big_thing - prefer empty, but AI can suggest
        one_big_thing = ai_suggestions.get("one_big_thing", "")
        fields["one_big_thing"] = {
            "value": one_big_thing,
            "source": "inferred" if one_big_thing else "empty",
            "confirmed": False,
        }

        # viewer_next_action - inferred
        viewer_next_action = ai_suggestions.get("viewer_next_action", "")
        fields["viewer_next_action"] = {
            "value": viewer_next_action,
            "source": "inferred" if viewer_next_action else "empty",
            "confirmed": False,
        }

        return {"round": 1, "fields": fields}

    def _generate_round2(self, intake_form: dict, confirmed_fields: dict) -> dict:
        """
        Generate Section 2: Delivery & Format fields.

        Field source mapping:
        - on_camera_presence: inferred (AI default per video type)
        - broll_type: inferred (AI default per video type)
        - delivery_tone: inferred (AI suggestion)
        - freshness_expectation: inferred (if topic contains year) or empty

        All Round 2 fields are AI-suggested (inferred).
        """
        ai_suggestions = self._call_llm_for_round2(intake_form, confirmed_fields)

        fields = {}

        # on_camera_presence - inferred
        on_camera_presence = ai_suggestions.get("on_camera_presence", "")
        fields["on_camera_presence"] = {
            "value": on_camera_presence,
            "source": "inferred" if on_camera_presence else "empty",
            "confirmed": False,
        }

        # broll_type - inferred (array)
        broll_type = ai_suggestions.get("broll_type", [])
        fields["broll_type"] = {
            "value": broll_type if isinstance(broll_type, list) else [],
            "source": "inferred" if broll_type else "empty",
            "confirmed": False,
        }

        # delivery_tone - inferred
        delivery_tone = ai_suggestions.get("delivery_tone", "")
        fields["delivery_tone"] = {
            "value": delivery_tone,
            "source": "inferred" if delivery_tone else "empty",
            "confirmed": False,
        }

        # freshness_expectation - inferred
        freshness_expectation = ai_suggestions.get("freshness_expectation", "")
        fields["freshness_expectation"] = {
            "value": freshness_expectation,
            "source": "inferred" if freshness_expectation else "empty",
            "confirmed": False,
        }

        return {"round": 2, "fields": fields}

    def _generate_round3(
        self,
        intake_form: dict,
        confirmed_fields: dict,
        research_results: dict
    ) -> dict:
        """
        Generate Section 3: Content Spine fields (after research).

        Field source mapping:
        - must_avoid: inferred (optional AI suggestion) or empty
        - source_assets: extracted (from user uploads), confirmed=true
        - core_talking_points: inferred (generated after research)
        - misconceptions: inferred (generated after research)
        - practical_takeaway: inferred (generated after research)
        """
        # source_assets comes from user uploads (extracted)
        user_assets = intake_form.get("source_assets", [])

        # AI-generated fields using research results
        ai_suggestions = self._call_llm_for_round3(
            intake_form, confirmed_fields, research_results
        )

        fields = {}

        # source_assets - extracted from user uploads
        fields["source_assets"] = {
            "value": user_assets if isinstance(user_assets, list) else [],
            "source": "extracted" if user_assets else "empty",
            "confirmed": True,  # Auto-confirmed (read-only display)
        }

        # must_avoid - inferred (optional)
        must_avoid = ai_suggestions.get("must_avoid", [])
        fields["must_avoid"] = {
            "value": must_avoid if isinstance(must_avoid, list) else [],
            "source": "inferred" if must_avoid else "empty",
            "confirmed": False,
        }

        # core_talking_points - inferred from research
        core_talking_points = ai_suggestions.get("core_talking_points", [])
        fields["core_talking_points"] = {
            "value": core_talking_points if isinstance(core_talking_points, list) else [],
            "source": "inferred" if core_talking_points else "empty",
            "confirmed": False,
        }

        # misconceptions - inferred from research
        misconceptions = ai_suggestions.get("misconceptions", [])
        fields["misconceptions"] = {
            "value": misconceptions if isinstance(misconceptions, list) else [],
            "source": "inferred" if misconceptions else "empty",
            "confirmed": False,
        }

        # practical_takeaway - inferred from research
        practical_takeaway = ai_suggestions.get("practical_takeaway", "")
        fields["practical_takeaway"] = {
            "value": practical_takeaway,
            "source": "inferred" if practical_takeaway else "empty",
            "confirmed": False,
        }

        return {"round": 3, "fields": fields}

    def _call_llm_for_round1(self, intake_form: dict) -> dict:
        """Call LLM to generate Round 1 field suggestions."""
        prompt = f"""Based on the following intake form, suggest values for the Core Intent fields.

## INTAKE FORM:
{json.dumps(intake_form, indent=2)}

## TASK:
Generate suggestions for these fields:
1. primary_goal - The main goal of this video (1-3 sentences)
2. audience_level - How familiar is the audience? (beginner/intermediate/advanced/mixed)
3. platform - Where will this be published? (youtube/internal_lms)
4. one_big_thing - If viewers remember only one thing, what should it be? (1 sentence, optional)
5. viewer_next_action - What should viewers do after watching? (1 action)

Return a JSON object with these keys. Only include fields you can reasonably infer.
Example:
{{
  "primary_goal": "Help viewers understand...",
  "audience_level": "intermediate",
  "platform": "youtube",
  "one_big_thing": "...",
  "viewer_next_action": "..."
}}"""

        response = self.call_llm(prompt, max_tokens=1000)
        parsed = self._extract_json(response)
        return parsed if isinstance(parsed, dict) else {}

    def _call_llm_for_round2(self, intake_form: dict, confirmed_fields: dict) -> dict:
        """Call LLM to generate Round 2 field suggestions."""
        prompt = f"""Based on the intake form and confirmed fields, suggest values for Delivery & Format.

## INTAKE FORM:
{json.dumps(intake_form, indent=2)}

## CONFIRMED FIELDS FROM ROUND 1:
{json.dumps(confirmed_fields, indent=2)}

## TASK:
Generate suggestions for these fields:
1. on_camera_presence - Face on screen? (no/yes_throughout/yes_intro_outro)
2. broll_type - What should viewers see? Array of: screen_recording, slides, diagrams, whiteboard, code_editor, stock_footage, real_world
3. delivery_tone - How should it feel? (clear_practical/analytical_informative/mentor_peer/executive_briefing)
4. freshness_expectation - How time-sensitive? (evergreen/current_year/recent)

Return a JSON object with these keys.
Example:
{{
  "on_camera_presence": "yes_intro_outro",
  "broll_type": ["slides", "diagrams"],
  "delivery_tone": "analytical_informative",
  "freshness_expectation": "current_year"
}}"""

        response = self.call_llm(prompt, max_tokens=1000)
        parsed = self._extract_json(response)
        return parsed if isinstance(parsed, dict) else {}

    def _call_llm_for_round3(
        self,
        intake_form: dict,
        confirmed_fields: dict,
        research_results: dict
    ) -> dict:
        """Call LLM to generate Round 3 field suggestions using research."""
        prompt = f"""Based on the intake form, confirmed fields, and research results, generate Content Spine suggestions.

## INTAKE FORM:
{json.dumps(intake_form, indent=2)}

## CONFIRMED FIELDS FROM ROUNDS 1-2:
{json.dumps(confirmed_fields, indent=2)}

## RESEARCH RESULTS:
{json.dumps(research_results, indent=2) if research_results else "No research available."}

## TASK:
Generate suggestions for these fields:
1. core_talking_points - Array of 3-5 key points/framework for the video
2. misconceptions - Array of 2-3 common misconceptions to address
3. practical_takeaway - A practical takeaway format (e.g., "Checklist: evaluate X" or "3 steps to Y")
4. must_avoid - Array of things to avoid (optional, can be empty)

Return a JSON object with these keys.
Example:
{{
  "core_talking_points": ["Point 1...", "Point 2...", "Point 3..."],
  "misconceptions": ["Misconception 1...", "Misconception 2..."],
  "practical_takeaway": "Checklist: evaluate your readiness",
  "must_avoid": []
}}"""

        response = self.call_llm(prompt, max_tokens=2000)
        parsed = self._extract_json(response)
        return parsed if isinstance(parsed, dict) else {}

    # =========================================================================
    # Legacy method for backward compatibility
    # =========================================================================

    def run_legacy(
        self,
        state: Any,
        revision_feedback: Optional[str] = None,
        **kwargs
    ) -> dict:
        """
        Legacy single-shot brief generation (for backward compatibility).
        """
        if not state.intake_form:
            raise ValueError("BriefBuilder requires intake_form in state")

        user_prompt = self._build_legacy_prompt(
            state.intake_form,
            revision_feedback
        )

        response = self.call_llm(user_prompt, max_tokens=6000)
        story_brief = self._parse_legacy_brief(response, state.intake_form)

        return story_brief

    def _build_legacy_prompt(
        self,
        intake_form: dict,
        revision_feedback: Optional[str] = None
    ) -> str:
        """Build the prompt for legacy Story Brief generation."""
        prompt = f"""Create a Story Brief from the following inputs:

## INTAKE FORM (from user):
{json.dumps(intake_form, indent=2)}

"""
        if revision_feedback:
            prompt += f"""
## REVISION FEEDBACK:
The previous Story Brief was rejected with this feedback:
{revision_feedback}

Please address this feedback in the updated Story Brief.

"""

        prompt += """
Generate a complete Story Brief following the schema in your system prompt.
Include:
1. All core fields from the intake form
2. Inferred fields (key_points, constraints, video-type-specific fields)
3. Metadata fields (auto_filled_fields, unresolved_questions)

Return the Story Brief as a valid JSON object."""

        return prompt

    def _parse_legacy_brief(self, response: str, intake_form: dict) -> dict:
        """Parse LLM response into a legacy Story Brief."""
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict):
            return self._normalize_legacy_brief(parsed, intake_form)

        return self._create_fallback_brief(intake_form, response)

    def _normalize_legacy_brief(self, brief: dict, intake_form: dict) -> dict:
        """Ensure legacy story brief has all required fields."""
        core_fields = [
            "video_goal", "target_audience", "company_or_brand_name",
            "tone_and_style", "format_or_platform", "desired_length",
            "show_face", "cta", "video_type", "user_inputs"
        ]

        for field in core_fields:
            if field not in brief and field in intake_form:
                brief[field] = intake_form[field]

        if "key_points" not in brief:
            brief["key_points"] = []
        if "constraints" not in brief:
            brief["constraints"] = []
        if "auto_filled_fields" not in brief:
            brief["auto_filled_fields"] = []
        if "unresolved_questions" not in brief:
            brief["unresolved_questions"] = []

        return brief

    def _create_fallback_brief(self, intake_form: dict, raw_response: str) -> dict:
        """Create a basic brief when JSON parsing fails."""
        return {
            **intake_form,
            "key_points": [],
            "constraints": [],
            "auto_filled_fields": [],
            "unresolved_questions": [
                {
                    "field": "parsing_error",
                    "note": "Could not parse AI response as JSON",
                    "context": raw_response[:500]
                }
            ],
            "raw_response": raw_response
        }

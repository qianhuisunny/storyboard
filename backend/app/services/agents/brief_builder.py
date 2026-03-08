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

        Returns extracted fields immediately (no LLM call).
        Inferred fields are left empty for user input.

        Field source mapping:
        - video_type: extracted (user selection), confirmed=true
        - viewer_outcome: empty (user fills in — merged from old primary_goal + one_big_thing)
        - target_audience: extracted (from initial form)
        - duration: extracted (from initial form)
        - audience_level: empty (user selects)
        - platform: empty (user selects)
        - viewer_next_action: empty (user fills in)
        """
        fields = {}

        # video_type is always extracted and confirmed
        fields["video_type"] = {
            "value": "knowledge_share",
            "source": "extracted",
            "confirmed": True,
        }

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

        # duration - extracted from form (can be "duration" or "desired_length")
        duration = intake_form.get("duration") or intake_form.get("desired_length", "")
        fields["duration"] = {
            "value": str(duration) if duration else "",
            "source": "extracted" if duration else "empty",
            "confirmed": False,
        }

        # Remaining fields are empty - user fills them in
        # No LLM call here to ensure immediate response

        # audience_level - empty (user selects)
        fields["audience_level"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # platform - empty (user selects)
        fields["platform"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # viewer_next_action - empty (user fills in)
        fields["viewer_next_action"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        return {"round": 1, "fields": fields}

    def _generate_round2(self, intake_form: dict, confirmed_fields: dict) -> dict:
        """
        Generate Section 2: Delivery & Format fields.

        All Round 2 fields are empty - user fills them in.
        No LLM call to ensure immediate response.

        Field source mapping:
        - on_camera_presence: empty (user selects)
        - broll_type: empty (user selects)
        - delivery_tone: empty (user selects)
        - freshness_expectation: empty (user selects)
        """
        fields = {}

        # on_camera_presence - empty (user selects)
        fields["on_camera_presence"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # broll_type - empty (user selects, array)
        fields["broll_type"] = {
            "value": [],
            "source": "empty",
            "confirmed": False,
        }

        # delivery_tone - empty (user selects)
        fields["delivery_tone"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # freshness_expectation - empty (user selects)
        fields["freshness_expectation"] = {
            "value": "",
            "source": "empty",
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
        Generate Section 3: Content Spine fields.

        Uses LLM to infer core_talking_points, misconceptions, and must_avoid
        based on confirmed fields from Rounds 1-2.

        Field source mapping:
        - core_talking_points: inferred (AI-suggested from confirmed fields)
        - misconceptions: inferred (AI-suggested)
        - must_avoid: inferred (AI-suggested)
        - additional_notes: empty (optional, user fills in)
        """
        # Extract confirmed field values for context
        def get_val(key: str, default: str = "") -> str:
            field = confirmed_fields.get(key, {})
            if isinstance(field, dict) and "value" in field:
                v = field["value"]
                return ", ".join(v) if isinstance(v, list) else str(v)
            return str(field) if field else default

        viewer_outcome = get_val("viewer_outcome")
        target_audience = get_val("target_audience")
        audience_level = get_val("audience_level", "intermediate")
        duration = get_val("duration", "300")
        platform = get_val("platform")
        viewer_next_action = get_val("viewer_next_action")
        delivery_tone = get_val("delivery_tone")
        freshness = get_val("freshness_expectation")

        prompt = f"""## TASK: Generate Round 3 fields

Follow the Round 3 generation guidelines in your system prompt.

## CONFIRMED FIELDS FROM ROUNDS 1-2
- Viewer Outcome: {viewer_outcome}
- Target Audience: {target_audience}
- Audience Level: {audience_level}
- Duration: {duration} seconds
- Platform: {platform}
- Viewer Next Action: {viewer_next_action}
- Delivery Tone: {delivery_tone}
- Freshness: {freshness}

## OUTPUT FORMAT
Return a JSON object with exactly these 3 keys:
{{
  "core_talking_points": ["point 1", "point 2", "point 3"],
  "misconceptions": ["misconception 1", "misconception 2"],
  "must_avoid": ["avoid item 1"]
}}

Generate 3-5 talking points, 2-3 misconceptions, and 0-3 must-avoid items.
Be specific to the topic, not generic."""

        # Call LLM to generate suggestions
        try:
            response = self.call_llm(prompt, max_tokens=1500, temperature=0.7)
            parsed = self._extract_json(response)
        except Exception as e:
            print(f"[BriefBuilder] Round 3 LLM call failed: {e}")
            parsed = None

        # Build fields from LLM response or fallback to empty
        if parsed and isinstance(parsed, dict):
            talking_points = parsed.get("core_talking_points", [])
            misconceptions = parsed.get("misconceptions", [])
            must_avoid = parsed.get("must_avoid", [])

            # Ensure they're lists
            if isinstance(talking_points, str):
                talking_points = [talking_points]
            if isinstance(misconceptions, str):
                misconceptions = [misconceptions]
            if isinstance(must_avoid, str):
                must_avoid = [must_avoid]

            fields = {
                "core_talking_points": {
                    "value": talking_points,
                    "source": "inferred",
                    "confirmed": False,
                },
                "misconceptions": {
                    "value": misconceptions,
                    "source": "inferred",
                    "confirmed": False,
                },
                "must_avoid": {
                    "value": must_avoid,
                    "source": "inferred",
                    "confirmed": False,
                },
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
                    "value": [],
                    "source": "empty",
                    "confirmed": False,
                },
                "must_avoid": {
                    "value": [],
                    "source": "empty",
                    "confirmed": False,
                },
            }

        # additional_notes - always empty (optional, user fills in)
        fields["additional_notes"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        return {"round": 3, "fields": fields}


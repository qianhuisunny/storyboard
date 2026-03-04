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
        - target_audience: extracted (from initial form)
        - duration: extracted (from initial form)
        - primary_goal: empty (user fills in)
        - audience_level: empty (user selects)
        - platform: empty (user selects)
        - one_big_thing: empty (user fills in)
        - viewer_next_action: empty (user fills in)
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

        # Remaining fields are empty - user fills them in
        # No LLM call here to ensure immediate response

        # primary_goal - empty (user fills in)
        fields["primary_goal"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

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

        # one_big_thing - empty (user fills in)
        fields["one_big_thing"] = {
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
        Generate Section 3: Content Spine fields (after research).

        Uses values already generated by TopicResearcher.research_questions().
        No LLM call needed - research already did this work.

        Field source mapping:
        - core_talking_points: from research
        - misconceptions: from research (source: "generated", not deeply researched yet)
        - practical_takeaway: from research (source: "generated")
        - must_avoid: from research (source: "generated")
        - additional_notes: empty (optional, user fills in)
        """
        # Use values directly from research_results (already generated by TopicResearcher)
        fields = {
            "core_talking_points": research_results.get("core_talking_points", {
                "value": [],
                "source": "empty",
                "confirmed": False,
            }),
            "misconceptions": research_results.get("misconceptions", {
                "value": [],
                "source": "empty",
                "confirmed": False,
            }),
            "practical_takeaway": research_results.get("practical_takeaway", {
                "value": "",
                "source": "empty",
                "confirmed": False,
            }),
            "must_avoid": research_results.get("must_avoid", {
                "value": [],
                "source": "empty",
                "confirmed": False,
            }),
        }

        # additional_notes - empty (optional, user fills in)
        fields["additional_notes"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        return {"round": 3, "fields": fields}


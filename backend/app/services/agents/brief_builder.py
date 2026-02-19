"""
Brief Builder Agent - Creates Story Brief from intake form and Context Pack.
Auto-fills fields from research and identifies gaps requiring user input.
"""

import json
from typing import Any, Optional

from .base import BaseAgent


class BriefBuilder(BaseAgent):
    """
    Creates a complete Story Brief by combining user intake with research.

    Input: intake_form + context_pack
    Output: story_brief dict with all fields populated or flagged
    """

    prompt_file = "BRIEF_BUILDER_SYSTEM_PROMPT.md"

    def run(
        self,
        state: Any,
        revision_feedback: Optional[str] = None,
        **kwargs
    ) -> dict:
        """
        Build a Story Brief from intake form and context pack.

        Args:
            state: StoryboardState with intake_form and context_pack
            revision_feedback: Optional feedback for revisions

        Returns:
            story_brief dict with all required fields
        """
        if not state.intake_form:
            raise ValueError("BriefBuilder requires intake_form in state")
        if not state.context_pack:
            raise ValueError("BriefBuilder requires context_pack in state")

        # Build the user prompt
        user_prompt = self._build_brief_prompt(
            state.intake_form,
            state.context_pack,
            revision_feedback
        )

        # Call LLM
        response = self.call_llm(user_prompt, max_tokens=6000)

        # Parse the response
        story_brief = self._parse_story_brief(response, state.intake_form)

        return story_brief

    def _build_brief_prompt(
        self,
        intake_form: dict,
        context_pack: dict,
        revision_feedback: Optional[str] = None
    ) -> str:
        """Build the prompt for Story Brief generation."""
        prompt = f"""Create a Story Brief from the following inputs:

## INTAKE FORM (from user):
{json.dumps(intake_form, indent=2)}

## CONTEXT PACK (from research):
{json.dumps(context_pack, indent=2)}

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
2. Auto-filled fields from the Context Pack (key_points, constraints, video-type-specific fields)
3. Metadata fields (auto_filled_fields, unresolved_questions)

Return the Story Brief as a valid JSON object."""

        return prompt

    def _parse_story_brief(self, response: str, intake_form: dict) -> dict:
        """Parse LLM response into a Story Brief."""
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict):
            return self._normalize_story_brief(parsed, intake_form)

        # Fallback: create basic brief from intake form
        return self._create_fallback_brief(intake_form, response)

    def _normalize_story_brief(self, brief: dict, intake_form: dict) -> dict:
        """Ensure story brief has all required fields."""
        # Core fields from intake form (copy if not present)
        core_fields = [
            "video_goal", "target_audience", "company_or_brand_name",
            "tone_and_style", "format_or_platform", "desired_length",
            "show_face", "cta", "video_type", "user_inputs"
        ]

        for field in core_fields:
            if field not in brief and field in intake_form:
                brief[field] = intake_form[field]

        # Ensure required auto-fill fields exist
        if "key_points" not in brief:
            brief["key_points"] = []
        if "constraints" not in brief:
            brief["constraints"] = []

        # Metadata fields
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

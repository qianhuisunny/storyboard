"""
Storyboard Director Agent - Generates a text-based video outline.

One-shot: takes story_brief → returns formatted plain text outline with sections.
No JSON, no revision mode. Output is human-readable and editable.
"""

from typing import Any

from .base import BaseAgent
from ..processing_log import log_llm_request, log_llm_response


class StoryboardDirector(BaseAgent):
    """
    Generates a structured text outline from the story brief.

    Input: story_brief with fields (viewer_outcome, core_talking_points, etc.)
    Output: plain text outline with sections (purpose, duration, talking points,
            evidence needed, visual intent)
    """

    prompt_file = "storyboard_director_prompt_v0312.md"

    def _extract_brief_field(self, story_brief: dict, field_name: str, default=None):
        """
        Extract a field from story_brief, handling both new and legacy formats.

        New format: story_brief.fields.{field_name}.value
        Legacy format: story_brief.{field_name}
        """
        if "fields" in story_brief:
            field = story_brief["fields"].get(field_name, {})
            if isinstance(field, dict) and "value" in field:
                return field["value"]
        return story_brief.get(field_name, default)

    def run(self, state: Any, **kwargs) -> str:
        """
        Generate a text outline from the story brief.

        Args:
            state: StoryboardState with story_brief

        Returns:
            Plain text outline string
        """
        if not state.story_brief:
            raise ValueError("StoryboardDirector requires story_brief in state")

        project_id = getattr(state, "project_id", None)
        story_brief = state.story_brief

        # Build the user prompt
        user_prompt = self._build_prompt(story_brief)

        # Log request
        if project_id:
            log_llm_request(
                project_id=project_id,
                phase="storyboard_director",
                input_fields={
                    "viewer_outcome": str(self._extract_brief_field(story_brief, "viewer_outcome") or ""),
                    "duration": str(self._extract_brief_field(story_brief, "duration") or ""),
                    "target_audience": str(self._extract_brief_field(story_brief, "target_audience") or ""),
                },
                system_prompt=self.system_prompt,
                user_prompt=user_prompt,
                max_tokens=8000,
            )

        # Call LLM — return raw text, no parsing
        response = self.call_llm(user_prompt, max_tokens=8000, temperature=0.7)

        # Strip any markdown code block wrappers if the LLM adds them
        text = response.strip()
        if text.startswith("```"):
            # Remove opening ``` line
            lines = text.split("\n")
            lines = lines[1:]  # skip first ```
            # Remove closing ``` if present
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        # Log response
        if project_id:
            log_llm_response(
                project_id=project_id,
                phase="storyboard_director",
                raw_response=response,
                parsed_result={"type": "text", "length": len(text)},
            )

        return text

    def _build_prompt(self, story_brief: dict) -> str:
        """Build user prompt with brief fields as context."""
        viewer_outcome = self._extract_brief_field(story_brief, "viewer_outcome") or ""
        target_audience = self._extract_brief_field(story_brief, "target_audience") or ""
        audience_level = self._extract_brief_field(story_brief, "audience_level") or "intermediate"
        duration = self._extract_brief_field(story_brief, "duration") or "60"
        platform = self._extract_brief_field(story_brief, "platform") or ""
        delivery_tone = self._extract_brief_field(story_brief, "delivery_tone") or ""
        point_of_view = self._extract_brief_field(story_brief, "point_of_view") or ""

        talking_points = self._extract_brief_field(story_brief, "core_talking_points") or []
        if isinstance(talking_points, str):
            talking_points = [talking_points]

        misconceptions = self._extract_brief_field(story_brief, "misconceptions") or []
        if isinstance(misconceptions, str):
            misconceptions = [misconceptions]

        must_avoid = self._extract_brief_field(story_brief, "must_avoid") or []
        if isinstance(must_avoid, str):
            must_avoid = [must_avoid]

        # Format lists
        tp_text = "\n".join(f"- {tp}" for tp in talking_points) if talking_points else "- (none provided)"
        misc_text = "\n".join(f"- {m}" for m in misconceptions) if misconceptions else "- (none)"
        avoid_text = "\n".join(f"- {a}" for a in must_avoid) if must_avoid else "- (none)"

        return f"""Generate a video outline for this brief.

VIEWER OUTCOME
{viewer_outcome}

TARGET AUDIENCE
{target_audience} (level: {audience_level})

TOTAL DURATION
{duration} seconds

PLATFORM
{platform}

DELIVERY TONE
{delivery_tone}

POINT OF VIEW
{point_of_view}

CORE TALKING POINTS
{tp_text}

MISCONCEPTIONS TO ADDRESS
{misc_text}

MUST AVOID
{avoid_text}

Generate the outline now. Return plain text only, following the section format in your system prompt."""

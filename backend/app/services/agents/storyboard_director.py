"""
Storyboard Director Agent - Generates a text-based video outline.

One-shot: takes story_brief → returns formatted plain text outline with sections.
No JSON, no revision mode. Output is human-readable and editable.
"""

from typing import Any

from .base import BaseAgent


class StoryboardDirector(BaseAgent):
    """
    Generates a structured text outline from the story brief.

    Input: story_brief with fields (viewer_outcome, core_talking_points, etc.)
    Output: plain text outline with sections (purpose, duration, talking points,
            evidence needed, visual intent)
    """

    prompt_file = "storyboard_director_prompt_v0603.md"

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

        return text

    def _build_prompt(self, story_brief: dict) -> str:
        """Build user prompt with brief fields as context."""
        viewer_outcome = self._extract_brief_field(story_brief, "viewer_outcome") or ""
        intent_route = self._extract_brief_field(story_brief, "intent_route") or self._extract_brief_field(story_brief, "video_type") or ""
        content_mode = self._extract_brief_field(story_brief, "content_mode") or ""
        format_style = self._extract_brief_field(story_brief, "format_style") or ""
        target_audience = self._extract_brief_field(story_brief, "target_audience") or ""
        audience_level = self._extract_brief_field(story_brief, "audience_level") or "intermediate"
        duration = self._extract_brief_field(story_brief, "duration") or "60"
        platform = self._extract_brief_field(story_brief, "platform") or ""
        delivery_tone = self._extract_brief_field(story_brief, "delivery_tone") or ""
        point_of_view = self._extract_brief_field(story_brief, "point_of_view") or ""
        broll_type = self._extract_brief_field(story_brief, "broll_type") or []
        if isinstance(broll_type, str):
            broll_type = [broll_type]

        talking_points = self._extract_brief_field(story_brief, "core_talking_points") or []
        if isinstance(talking_points, str):
            talking_points = [talking_points]

        misconceptions = self._extract_brief_field(story_brief, "misconceptions") or ""
        # Handle legacy array format — join into single string
        if isinstance(misconceptions, list):
            misconceptions = "; ".join(misconceptions) if misconceptions else ""

        must_avoid = self._extract_brief_field(story_brief, "must_avoid") or []
        if isinstance(must_avoid, str):
            must_avoid = [must_avoid]

        # Format lists
        tp_text = "\n".join(f"- {tp}" for tp in talking_points) if talking_points else "- (none provided)"
        misc_text = misconceptions if misconceptions else "(none)"
        avoid_text = "\n".join(f"- {a}" for a in must_avoid) if must_avoid else "- (none)"

        return f"""Generate a video outline for this brief.

INTENT ROUTE
{intent_route}

CONTENT MODE
{content_mode}

FORMAT STYLE
{format_style}

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

VISUAL FORMATS
{", ".join(broll_type) if broll_type else "(none specified)"}

POINT OF VIEW
{point_of_view}

CORE TALKING POINTS
{tp_text}

CORE MISCONCEPTION TO ADDRESS
{misc_text}

MUST AVOID
{avoid_text}

Generate the outline now. Return plain text only, following the section format in your system prompt."""

    def _strip_markdown_wrapper(self, text: str) -> str:
        """Strip markdown code block wrappers if present."""
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        return text

    def regenerate_section(
        self,
        current_outline: str,
        section_number: int,
        instruction: str,
        story_brief: dict,
    ) -> str:
        """
        Regenerate a single section of the outline based on user instruction.

        Returns the full updated outline text with the target section replaced.
        """
        brief_context = self._build_brief_context(story_brief)

        prompt = f"""You are revising ONE section of an existing video outline.

{brief_context}

## CURRENT OUTLINE
{current_outline}

## TASK
Regenerate ONLY Section {section_number} based on this instruction:
"{instruction}"

Return the COMPLETE outline with all sections. Only Section {section_number} should change — keep all other sections exactly as they are. Return plain text only, following the same section format."""

        response = self.call_llm(prompt, max_tokens=8000, temperature=0.7)
        return self._strip_markdown_wrapper(response)

    def refine_outline(
        self,
        current_outline: str,
        instruction: str,
        story_brief: dict,
    ) -> str:
        """
        Regenerate the full outline based on user instruction.

        Returns the complete new outline text.
        """
        brief_context = self._build_brief_context(story_brief)

        prompt = f"""You are revising a video outline based on user feedback.

{brief_context}

## CURRENT OUTLINE
{current_outline}

## USER INSTRUCTION
"{instruction}"

Regenerate the full outline incorporating the instruction above. You may add, remove, merge, or restructure sections as needed. Return plain text only, following the same section format."""

        response = self.call_llm(prompt, max_tokens=8000, temperature=0.7)
        return self._strip_markdown_wrapper(response)

    def _build_brief_context(self, story_brief: dict) -> str:
        """Build a brief context summary for refinement prompts."""
        viewer_outcome = self._extract_brief_field(story_brief, "viewer_outcome") or ""
        intent_route = self._extract_brief_field(story_brief, "intent_route") or self._extract_brief_field(story_brief, "video_type") or ""
        content_mode = self._extract_brief_field(story_brief, "content_mode") or ""
        target_audience = self._extract_brief_field(story_brief, "target_audience") or ""
        point_of_view = self._extract_brief_field(story_brief, "point_of_view") or ""

        return f"""## BRIEF CONTEXT
Intent route: {intent_route}
Content mode: {content_mode}
Viewer outcome: {viewer_outcome}
Target audience: {target_audience}
Point of view: {point_of_view}"""

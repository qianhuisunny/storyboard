"""Storyboard Director agent for human-editable video outlines."""

import re
from typing import Any, Optional

from app.services.prompt_context import render_prompt_value
from app.services.production_formats import normalize_production_formats

from .base import BaseAgent


class StoryboardDirector(BaseAgent):
    """Turn an approved intake artifact into the Writer's plain-text outline."""

    prompt_file = "storyboard_director_prompt_v0712.md"

    _CONTEXT_FIELDS = (
        ("prompt", ("prompt", "topic", "description", "video_goal")),
        ("viewer_outcome", ("viewer_outcome",)),
        ("target_audience", ("target_audience",)),
        ("audience_level", ("audience_level",)),
        ("platform", ("platform",)),
        ("aspect_ratio", ("aspect_ratio",)),
        ("delivery_tone", ("delivery_tone",)),
        ("source_snapshot", ("source_snapshot", "source_context", "key_points")),
        ("sources", ("sources",)),
    )

    @staticmethod
    def _unwrap(value: Any) -> Any:
        if isinstance(value, dict) and "value" in value:
            return value["value"]
        return value

    @staticmethod
    def _present(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, tuple, dict, set)):
            return bool(value)
        return True

    def _read_aliases(
        self, story_brief: dict, aliases: tuple[str, ...], default: Any = None
    ) -> Any:
        """Prefer direct intake keys, then support the old nested field envelope."""
        story_brief = story_brief or {}
        for name in aliases:
            if name in story_brief:
                value = self._unwrap(story_brief[name])
                if self._present(value):
                    return value

        fields = story_brief.get("fields", {})
        if isinstance(fields, dict):
            for name in aliases:
                if name in fields:
                    value = self._unwrap(fields[name])
                    if self._present(value):
                        return value
        return default

    def _extract_brief_field(
        self, story_brief: dict, field_name: str, default: Any = None
    ) -> Any:
        """Compatibility helper for callers that still request one field."""
        return self._read_aliases(story_brief, (field_name,), default)

    def _has_field(self, story_brief: dict, name: str) -> bool:
        if name in (story_brief or {}):
            return True
        fields = (story_brief or {}).get("fields", {})
        return isinstance(fields, dict) and name in fields

    @staticmethod
    def _parse_duration(value: Any) -> Optional[int]:
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, str):
            match = re.fullmatch(
                r"\s*(\d+(?:\.0+)?)\s*(?:seconds?|secs?|s)?\s*",
                value,
                re.IGNORECASE,
            )
            if not match:
                return None
            value = match.group(1)
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if number <= 0 or not number.is_integer():
            return None
        return int(number)

    def _production_formats(self, story_brief: dict) -> list[str]:
        canonical = self._read_aliases(story_brief, ("production_formats",))
        is_legacy = not self._has_field(story_brief, "production_formats")
        raw = canonical
        if is_legacy:
            raw = self._read_aliases(story_brief, ("broll_type",), [])

        formats = normalize_production_formats(raw)

        if is_legacy:
            on_camera = self._read_aliases(
                story_brief, ("on_camera_presence",), ""
            )
            if str(on_camera).strip().lower() not in {"", "no", "none", "false", "0"}:
                if "talking_head" not in formats:
                    formats.append("talking_head")
        return formats

    def _canonical_context(self, story_brief: dict) -> dict[str, Any]:
        context: dict[str, Any] = {}
        for canonical, aliases in self._CONTEXT_FIELDS:
            value = self._read_aliases(story_brief, aliases)
            if self._present(value):
                context[canonical] = value

        duration = self._parse_duration(
            self._read_aliases(story_brief, ("duration_seconds", "duration"))
        )
        if duration is not None:
            context["duration_seconds"] = duration

        formats = self._production_formats(story_brief)
        if formats:
            context["production_formats"] = formats
        return context

    @staticmethod
    def _format_value(key: str, value: Any) -> str:
        cap = 8000 if key == "source_snapshot" else 6000 if key == "sources" else 2000
        return render_prompt_value(value, cap)

    def _build_brief_context(self, story_brief: dict) -> str:
        context = self._canonical_context(story_brief)
        labels = (
            ("prompt", "VIDEO GOAL"),
            ("viewer_outcome", "VIEWER OUTCOME"),
            ("target_audience", "TARGET AUDIENCE"),
            ("audience_level", "AUDIENCE LEVEL"),
            ("duration_seconds", "TOTAL DURATION (SECONDS)"),
            ("platform", "PLATFORM"),
            ("aspect_ratio", "ASPECT RATIO"),
            ("delivery_tone", "DELIVERY TONE"),
            ("production_formats", "PRODUCTION FORMATS"),
            ("source_snapshot", "SOURCE SNAPSHOT"),
            ("sources", "SOURCES"),
        )
        blocks = [
            f"{label}\n{self._format_value(key, context[key])}"
            for key, label in labels
            if key in context
        ]
        return "## APPROVED INTAKE\n\n" + "\n\n".join(blocks)

    def _build_prompt(
        self, story_brief: dict, quality_feedback: Optional[str] = None
    ) -> str:
        feedback = ""
        if quality_feedback:
            feedback = (
                "\n\n## REVIEW FEEDBACK TO ADDRESS\n"
                f"{render_prompt_value(quality_feedback, 4000)}"
            )
        return (
            "Generate a complete video outline from the approved intake. Decide the "
            "most effective narrative structure directly from the goal, outcome, and "
            "available source material.\n\n"
            f"{self._build_brief_context(story_brief)}"
            f"{feedback}\n\n"
            "Return plain text only and follow the exact section contract in the "
            "system prompt."
        )

    def run(self, state: Any, **kwargs) -> str:
        if not state.story_brief:
            raise ValueError("StoryboardDirector requires story_brief in state")

        user_prompt = self._build_prompt(
            state.story_brief, quality_feedback=kwargs.get("quality_feedback")
        )
        response = self.call_llm(user_prompt, max_tokens=8000, temperature=0.7)
        return self._strip_markdown_wrapper(response)

    @staticmethod
    def _strip_markdown_wrapper(text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")[1:]
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
        prompt = f"""Revise one section of an existing video outline.

{self._build_brief_context(story_brief)}

## CURRENT OUTLINE
{render_prompt_value(current_outline, 12000)}

## TASK
Regenerate only Section {section_number} based on this instruction:
{render_prompt_value(instruction, 4000)}

Return the complete outline. Keep every other section exactly unchanged and use the exact section contract from the system prompt."""
        response = self.call_llm(prompt, max_tokens=8000, temperature=0.7)
        return self._strip_markdown_wrapper(response)

    def refine_outline(
        self,
        current_outline: str,
        instruction: str,
        story_brief: dict,
        quality_feedback: Optional[str] = None,
    ) -> str:
        feedback = ""
        if quality_feedback:
            feedback = (
                "\n\n## HOLISTIC REVIEW FEEDBACK\n"
                f"{render_prompt_value(quality_feedback, 4000)}"
            )
        prompt = f"""Revise an existing video outline from user feedback.

{self._build_brief_context(story_brief)}

## CURRENT OUTLINE
{render_prompt_value(current_outline, 12000)}

## USER INSTRUCTION
{render_prompt_value(instruction, 4000)}
{feedback}

Return the complete revised outline. You may restructure sections when the instruction requires it, while preserving the exact section contract from the system prompt."""
        response = self.call_llm(prompt, max_tokens=8000, temperature=0.7)
        return self._strip_markdown_wrapper(response)

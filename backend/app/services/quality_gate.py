"""Deterministic structural validation plus one holistic quality review."""

import asyncio
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from app.infra.llm_gateway import llm


PROMPTS_DIR = Path(__file__).parent.parent.parent.parent / "prompts"

STAGE_PROMPTS = {
    "outline": "OUTLINE_EVAL_PROMPT_v0712.md",
    "storyboard": "STORYBOARD_EVAL_PROMPT_v0712.md",
}

VALID_SCREEN_TYPES = {
    "screen_recording",
    "slides",
    "whiteboard_animation",
    "whiteboard",
    "code_editor",
    "stock_footage",
    "real_world",
    "talking_head",
    "talking_head_with_split_screens",
    "talking_head_left_with_notes",
}

STORYBOARD_REQUIRED_FIELDS = {
    "screen_number",
    "section_number",
    "section_title",
    "screen_type",
    "voiceover_text",
    "visual_direction",
    "action_notes",
}


@dataclass
class DimensionScore:
    """Compatibility shape for historical persisted evaluations."""

    dimension: str
    score: float
    feedback: str


@dataclass
class GutScore:
    """Compatibility view of the single holistic review."""

    score: float
    feedback: str


@dataclass
class QualityEvalResult:
    passed: bool
    gut: GutScore
    dimensions: Optional[list[DimensionScore]]
    composite_score: float
    attempt: int
    total_attempts: int
    strengths: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    deterministic_issues: list[str] = field(default_factory=list)
    advisory: bool = False
    review_passed: bool = False

    @property
    def feedback(self) -> str:
        return self.gut.feedback

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "gut": {"score": self.gut.score, "feedback": self.gut.feedback},
            "dimensions": [
                {
                    "dimension": item.dimension,
                    "score": item.score,
                    "feedback": item.feedback,
                }
                for item in self.dimensions
            ]
            if self.dimensions
            else None,
            "composite_score": self.composite_score,
            "attempt": self.attempt,
            "total_attempts": self.total_attempts,
            "feedback": self.feedback,
            "strengths": self.strengths,
            "issues": self.issues,
            "deterministic_issues": self.deterministic_issues,
            "advisory": self.advisory,
            "review_passed": self.review_passed,
        }


class QualityGate:
    stage_prompts = STAGE_PROMPTS

    def __init__(
        self,
        model: str = "gpt-4o",
        threshold: float = 7.0,
        max_attempts: int = 2,
    ):
        self.model = model
        self.threshold = threshold
        # The gate has exactly one generation retry. The parameter remains for
        # call-site compatibility, but cannot expand the LLM retry budget.
        self.max_attempts = 2
        self._prompts: dict[str, str] = {}

    def _get_prompt(self, stage: str) -> str:
        if stage not in self.stage_prompts:
            raise ValueError(f"Unsupported quality stage: {stage}")
        if stage not in self._prompts:
            path = PROMPTS_DIR / self.stage_prompts[stage]
            self._prompts[stage] = path.read_text(encoding="utf-8")
        return self._prompts[stage]

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

    def _extract_aliases(
        self, brief: dict, aliases: tuple[str, ...], default: Any = None
    ) -> Any:
        brief = brief or {}
        for name in aliases:
            if name in brief:
                value = self._unwrap(brief[name])
                if self._present(value):
                    return value
        fields = brief.get("fields", {})
        if isinstance(fields, dict):
            for name in aliases:
                if name in fields:
                    value = self._unwrap(fields[name])
                    if self._present(value):
                        return value
        return default

    def _extract_brief_field(
        self, story_brief: dict, field_name: str, default: Any = ""
    ) -> Any:
        """Compatibility helper used by historical callers."""
        return self._extract_aliases(story_brief, (field_name,), default)

    @staticmethod
    def _parse_positive_integer(value: Any) -> Optional[int]:
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

    def _requested_duration(self, brief: dict) -> Optional[int]:
        return self._parse_positive_integer(
            self._extract_aliases(brief, ("duration_seconds", "duration"))
        )

    def _canonical_brief_context(self, brief: dict) -> dict[str, Any]:
        definitions = (
            ("prompt", ("prompt", "topic", "description")),
            ("viewer_outcome", ("viewer_outcome",)),
            ("target_audience", ("target_audience",)),
            ("audience_level", ("audience_level",)),
            ("platform", ("platform",)),
            ("aspect_ratio", ("aspect_ratio",)),
            ("delivery_tone", ("delivery_tone",)),
            ("production_formats", ("production_formats", "broll_type")),
            ("source_snapshot", ("source_snapshot", "source_context")),
            ("sources", ("sources",)),
        )
        context = {}
        for canonical, aliases in definitions:
            value = self._extract_aliases(brief, aliases)
            if self._present(value):
                context[canonical] = value
        duration = self._requested_duration(brief)
        if duration is not None:
            context["duration_seconds"] = duration
        return context

    def _build_brief_context(self, brief: dict) -> str:
        context = self._canonical_brief_context(brief)
        labels = (
            ("prompt", "Video goal"),
            ("viewer_outcome", "Viewer outcome"),
            ("target_audience", "Target audience"),
            ("audience_level", "Audience level"),
            ("duration_seconds", "Total duration (seconds)"),
            ("platform", "Platform"),
            ("aspect_ratio", "Aspect ratio"),
            ("delivery_tone", "Delivery tone"),
            ("production_formats", "Production formats"),
            ("source_snapshot", "Source snapshot"),
            ("sources", "Sources"),
        )
        lines = []
        for key, label in labels:
            if key not in context:
                continue
            value = context[key]
            if isinstance(value, (list, tuple, dict)):
                rendered = json.dumps(value, ensure_ascii=False, indent=2)
            else:
                rendered = str(value)
            lines.append(f"{label}: {rendered}")
        return "\n".join(lines) or "No additional intake values were provided."

    @staticmethod
    def _outline_field(block: str, label: str) -> str:
        labels = ("Purpose", "Entry assumption", "Exit state", "Duration", "Talking points")
        matches = []
        for candidate in labels:
            match = re.search(
                rf"^(?:\*\*)?{re.escape(candidate)}(?:\*\*)?\s*$",
                block,
                re.MULTILINE | re.IGNORECASE,
            )
            if match:
                matches.append((match.start(), match.end(), candidate.lower()))
        matches.sort(key=lambda item: item[0])
        for index, (_start, end, name) in enumerate(matches):
            if name != label.lower():
                continue
            next_start = matches[index + 1][0] if index + 1 < len(matches) else len(block)
            return block[end:next_start].strip()
        return ""

    def _validate_outline(self, brief: dict, output: Any) -> list[str]:
        if not isinstance(output, str) or not output.strip():
            return ["Outline must be a non-empty string"]

        header_pattern = re.compile(
            r"^Section\s+(\d+)\s*[—–-]\s*(.+)$", re.MULTILINE
        )
        headers = list(header_pattern.finditer(output))
        if not headers:
            return ["Could not parse any Section blocks"]

        issues = []
        total_duration = 0
        for index, header in enumerate(headers):
            section_number = int(header.group(1))
            title = header.group(2).strip()
            end = headers[index + 1].start() if index + 1 < len(headers) else len(output)
            block = output[header.start():end]

            if not title:
                issues.append(f"Section {section_number} is missing a title")
            purpose = self._outline_field(block, "Purpose")
            if not purpose:
                issues.append(f"Section {section_number} is missing Purpose")

            duration_text = self._outline_field(block, "Duration")
            duration = self._parse_positive_integer(duration_text)
            if duration is None:
                issues.append(
                    f"Section {section_number} Duration must be a positive integer number of seconds"
                )
            else:
                total_duration += duration

            talking_points = self._outline_field(block, "Talking points")
            bullets = [
                line
                for line in talking_points.splitlines()
                if re.match(r"^\s*[-*]\s+\S", line)
            ]
            if not bullets:
                issues.append(
                    f"Section {section_number} must include at least one Talking point"
                )

        requested = self._requested_duration(brief)
        if requested is not None and not any("Duration" in item for item in issues):
            if total_duration != requested:
                issues.append(
                    f"Outline section durations total {total_duration} seconds; expected exactly {requested} seconds"
                )
        return issues

    @staticmethod
    def _validate_storyboard(output: Any) -> list[str]:
        if not isinstance(output, list) or not output:
            return ["Storyboard must be a non-empty list"]

        issues = []
        for index, screen in enumerate(output, start=1):
            if not isinstance(screen, dict):
                issues.append(f"Screen {index} must be an object")
                continue

            missing = sorted(STORYBOARD_REQUIRED_FIELDS - set(screen))
            if missing:
                issues.append(
                    f"Screen {index} is missing required fields: {', '.join(missing)}"
                )

            number = screen.get("screen_number")
            if isinstance(number, bool) or not isinstance(number, int) or number != index:
                issues.append(
                    f"Screen numbers must be sequential from 1; expected {index}"
                )
            section_number = screen.get("section_number")
            if (
                isinstance(section_number, bool)
                or not isinstance(section_number, int)
                or section_number <= 0
            ):
                issues.append(f"Screen {index} has an invalid section_number")
            if not isinstance(screen.get("section_title"), str) or not screen.get(
                "section_title", ""
            ).strip():
                issues.append(f"Screen {index} has an invalid section_title")
            if screen.get("screen_type") not in VALID_SCREEN_TYPES:
                issues.append(f"Screen {index} has an invalid screen_type")
            if not isinstance(screen.get("voiceover_text"), str):
                issues.append(f"Screen {index} voiceover_text must be a string")
            if not isinstance(screen.get("visual_direction"), list):
                issues.append(f"Screen {index} visual_direction must be a list")
            if not isinstance(screen.get("action_notes"), str):
                issues.append(f"Screen {index} action_notes must be a string")

            if "duration" in screen:
                duration = screen["duration"]
                if (
                    isinstance(duration, bool)
                    or not isinstance(duration, (int, float))
                    or duration <= 0
                ):
                    issues.append(f"Screen {index} duration must be positive")
        return issues

    def validate_structure(self, stage: str, brief: dict, output: Any) -> list[str]:
        if stage == "outline":
            return self._validate_outline(brief, output)
        if stage == "storyboard":
            return self._validate_storyboard(output)
        raise ValueError(f"Unsupported quality stage: {stage}")

    def _call_eval(self, stage: str, user_prompt: str, label: str = "holistic") -> dict:
        return llm.chat_json(
            category="storyboard",
            label=f"qg_{label}",
            system_prompt=self._get_prompt(stage),
            user_prompt=user_prompt,
            model=self.model,
            temperature=0.2,
            max_tokens=700,
        )

    async def _async_call_eval(
        self, stage: str, user_prompt: str, label: str = "holistic"
    ) -> dict:
        return await asyncio.to_thread(self._call_eval, stage, user_prompt, label)

    @staticmethod
    def _format_output(output: Any) -> str:
        if isinstance(output, (list, dict)):
            return json.dumps(output, indent=2, ensure_ascii=False)
        return str(output)

    def _build_review_prompt(
        self, stage: str, brief: dict, output: Any, outline: Any = None
    ) -> str:
        if stage == "storyboard" and outline is not None:
            artifact = (
                f"## APPROVED OUTLINE\n{self._format_output(outline)}\n\n"
                f"## STORYBOARD\n{self._format_output(output)}"
            )
        else:
            label = "OUTLINE" if stage == "outline" else "STORYBOARD"
            artifact = f"## {label}\n{self._format_output(output)}"
        return (
            "Review this artifact holistically for usefulness, coherence, specificity, "
            "grounding, audience fit, production readiness, and completion.\n\n"
            f"## APPROVED INTAKE\n{self._build_brief_context(brief)}\n\n"
            f"{artifact}\n\n"
            "Return the exact JSON object required by the system prompt."
        )

    @staticmethod
    def _string_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item) for item in value if str(item).strip()]

    def _structural_failure_result(
        self, issues: list[str], attempt: int = 0
    ) -> QualityEvalResult:
        feedback = "Structural validation failed: " + "; ".join(issues)
        return QualityEvalResult(
            passed=False,
            gut=GutScore(score=0.0, feedback=feedback),
            dimensions=None,
            composite_score=0.0,
            attempt=attempt,
            total_attempts=self.max_attempts,
            issues=list(issues),
            deterministic_issues=list(issues),
            advisory=False,
            review_passed=False,
        )

    def _log_eval_event(
        self, stage: str, brief: dict, output: Any, result: QualityEvalResult,
        outline: Any = None,
    ) -> None:
        try:
            from app.infra.quality_log import qlog

            context = self._build_review_prompt(stage, brief, output, outline)
            qlog.log_eval(
                project_id=brief.get("project_id", "unknown"),
                stage=stage,
                scope="full",
                model=self.model,
                prompt_ref=self.stage_prompts[stage],
                context=context,
                raw_response="",
                scores=result.to_dict(),
            )
        except Exception:
            pass

    async def evaluate(
        self,
        stage: str,
        brief: dict,
        output: Any,
        outline: Any = None,
    ) -> QualityEvalResult:
        structural_issues = self.validate_structure(stage, brief, output)
        if structural_issues:
            result = self._structural_failure_result(structural_issues)
            self._log_eval_event(stage, brief, output, result, outline)
            return result

        prompt = self._build_review_prompt(stage, brief, output, outline)
        raw = await self._async_call_eval(stage, prompt, label="holistic")
        try:
            score = float(raw.get("score", 0))
        except (TypeError, ValueError, AttributeError):
            score = 0.0
        score = max(0.0, min(10.0, score))
        review_passed = bool(raw.get("passed", False)) and score >= self.threshold
        feedback = str(raw.get("feedback", ""))
        result = QualityEvalResult(
            # Structural validity controls pipeline blocking. A subjective miss
            # remains explicit advisory metadata.
            passed=True,
            gut=GutScore(score=score, feedback=feedback),
            dimensions=None,
            composite_score=round(score, 1),
            attempt=0,
            total_attempts=0,
            strengths=self._string_list(raw.get("strengths")),
            issues=self._string_list(raw.get("issues")),
            deterministic_issues=[],
            advisory=not review_passed,
            review_passed=review_passed,
        )
        self._log_eval_event(stage, brief, output, result, outline)
        return result

    def format_feedback_for_retry(
        self, result: QualityEvalResult, attempt: int
    ) -> str:
        lines = [
            f"Holistic review feedback from attempt {attempt + 1} of {self.max_attempts}:",
            result.feedback,
        ]
        if result.issues:
            lines.append("Issues to address:")
            lines.extend(f"- {item}" for item in result.issues)
        lines.append("Revise the output while preserving everything that already works.")
        return "\n".join(line for line in lines if line)

    async def run_with_gate(
        self,
        agent: Any,
        state: Any,
        stage: str,
        outline_for_cross_stage: Any = None,
    ) -> tuple[Any, QualityEvalResult]:
        brief = state.story_brief or {}
        quality_feedback: Optional[str] = None

        for attempt in range(1, self.max_attempts + 1):
            if quality_feedback:
                output = agent.run(state, quality_feedback=quality_feedback)
            else:
                output = agent.run(state)

            structural_issues = self.validate_structure(stage, brief, output)
            if structural_issues:
                result = self._structural_failure_result(
                    structural_issues, attempt=attempt
                )
                if attempt == self.max_attempts:
                    return output, result
                quality_feedback = (
                    "The previous output failed deterministic structural validation. "
                    "Correct every issue before returning:\n- "
                    + "\n- ".join(structural_issues)
                )
                continue

            outline = outline_for_cross_stage if stage == "storyboard" else None
            result = await self.evaluate(stage, brief, output, outline=outline)
            result.attempt = attempt
            result.total_attempts = self.max_attempts
            if result.review_passed:
                result.advisory = False
                return output, result
            if attempt == self.max_attempts:
                # The output is structurally safe. Keep the low holistic review
                # visible, but do not block the workflow after the one retry.
                result.passed = True
                result.advisory = True
                return output, result
            quality_feedback = self.format_feedback_for_retry(result, attempt - 1)

        raise RuntimeError("Quality gate exhausted unexpectedly")

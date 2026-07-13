"""Deterministic structural validation plus one holistic quality review."""

import asyncio
import inspect
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from app.infra.llm_gateway import llm
from app.services.legacy_storyboard import legacy_outline_sections
from app.services.production_formats import (
    VALID_SCREEN_TYPES,
    resolve_production_formats,
)
from app.services.prompt_context import render_prompt_value


PROMPTS_DIR = Path(__file__).parent.parent.parent.parent / "prompts"

STAGE_PROMPTS = {
    "outline": "OUTLINE_EVAL_PROMPT_v0712.md",
    "storyboard": "STORYBOARD_EVAL_PROMPT_v0712.md",
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
        context = {}
        for canonical, aliases in definitions:
            value = self._extract_aliases(brief, aliases)
            if self._present(value):
                context[canonical] = value
        duration = self._requested_duration(brief)
        if duration is not None:
            context["duration_seconds"] = duration
        formats_provided, formats = self._selected_production_formats(brief)
        if formats_provided and formats:
            context["production_formats"] = formats
        return context

    @staticmethod
    def _parse_section_duration(value: Any) -> Optional[int]:
        if not isinstance(value, str):
            return None
        match = re.fullmatch(
            r"\s*([1-9]\d*)\s*(?:seconds?|secs?|s)?\s*",
            value,
            re.IGNORECASE,
        )
        return int(match.group(1)) if match else None

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
            cap = 4000 if key in {"source_snapshot", "sources"} else 1000
            rendered = render_prompt_value(value, cap)
            lines.append(f"{label}: {rendered}")
        context_text = "\n".join(lines) or "No additional intake values were provided."
        return render_prompt_value(context_text, 10000)

    @staticmethod
    def _outline_sections(output: Any) -> list[tuple[int, str]]:
        if isinstance(output, list):
            return legacy_outline_sections(output)
        if not isinstance(output, str):
            return []
        return [
            (int(match.group(1)), match.group(2).strip())
            for match in re.finditer(
                r"^Section\s+(\d+)\s*[—–-]\s*(.+)$", output, re.MULTILINE
            )
        ]

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
        numbers = [int(header.group(1)) for header in headers]
        if numbers != list(range(1, len(headers) + 1)):
            issues.append("Outline section numbers must be unique and sequential from 1")
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
            entry_assumption = self._outline_field(block, "Entry assumption")
            if not entry_assumption:
                issues.append(
                    f"Section {section_number} is missing Entry assumption"
                )
            exit_state = self._outline_field(block, "Exit state")
            if not exit_state:
                issues.append(f"Section {section_number} is missing Exit state")

            duration_text = self._outline_field(block, "Duration")
            duration = self._parse_section_duration(duration_text)
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

    def _brief_has_field(self, brief: dict, name: str) -> bool:
        if name in (brief or {}):
            return True
        fields = (brief or {}).get("fields", {})
        return isinstance(fields, dict) and name in fields

    def _selected_production_formats(self, brief: dict) -> tuple[bool, list[str]]:
        canonical_present = self._brief_has_field(brief, "production_formats")
        legacy_present = self._brief_has_field(brief, "broll_type")
        if canonical_present:
            raw = self._extract_aliases(brief, ("production_formats",), [])
        elif legacy_present:
            raw = self._extract_aliases(brief, ("broll_type",), [])
        else:
            return False, []
        additional = []
        if not canonical_present:
            on_camera = self._extract_aliases(brief, ("on_camera_presence",), "")
            if str(on_camera).strip().lower() not in {"", "no", "none", "false", "0"}:
                additional.append("talking_head")
        allowed = resolve_production_formats(
            raw,
            fallback_when_empty=True,
            additional=additional,
        )
        return True, allowed

    def _validate_storyboard(
        self, brief: dict, output: Any, outline: Any = None
    ) -> list[str]:
        if not isinstance(output, list) or not output:
            return ["Storyboard must be a non-empty list"]

        issues = []
        formats_provided, allowed_types = self._selected_production_formats(brief)
        parsed_outline_sections = self._outline_sections(outline)
        outline_sections = dict(parsed_outline_sections) if outline is not None else {}
        if outline is not None:
            outline_numbers = [number for number, _title in parsed_outline_sections]
            if outline_numbers != list(range(1, len(parsed_outline_sections) + 1)):
                issues.append(
                    "Approved outline section numbers must be unique and sequential from 1"
                )
        seen_sections = set()
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
            else:
                seen_sections.add(section_number)
                if outline is not None and section_number not in outline_sections:
                    issues.append(
                        f"Screen {index} references unknown outline section {section_number}"
                    )
            if not isinstance(screen.get("section_title"), str) or not screen.get(
                "section_title", ""
            ).strip():
                issues.append(f"Screen {index} has an invalid section_title")
            elif section_number in outline_sections and screen.get(
                "section_title", ""
            ).strip() != outline_sections[section_number]:
                issues.append(
                    f"Screen {index} section_title must match outline title "
                    f"{outline_sections[section_number]!r}"
                )
            if screen.get("screen_type") not in VALID_SCREEN_TYPES:
                issues.append(f"Screen {index} has an invalid screen_type")
            elif formats_provided and screen.get("screen_type") not in allowed_types:
                issues.append(
                    f"Screen {index} screen_type is outside selected production formats"
                )
            voiceover_text = screen.get("voiceover_text")
            if not isinstance(voiceover_text, str) or not voiceover_text.strip():
                issues.append(
                    f"Screen {index} voiceover_text must be a non-empty string"
                )
            visual_direction = screen.get("visual_direction")
            if not isinstance(visual_direction, list):
                issues.append(f"Screen {index} visual_direction must be a list")
            elif not 2 <= len(visual_direction) <= 4 or any(
                not isinstance(item, str) or not item.strip()
                for item in visual_direction
            ):
                issues.append(
                    f"Screen {index} visual_direction must contain 2 to 4 non-empty strings"
                )
            action_notes = screen.get("action_notes")
            if not isinstance(action_notes, str) or not action_notes.strip():
                issues.append(
                    f"Screen {index} action_notes must be a non-empty string"
                )

            if "duration" in screen:
                duration = screen["duration"]
                if (
                    isinstance(duration, bool)
                    or not isinstance(duration, (int, float))
                    or duration <= 0
                ):
                    issues.append(f"Screen {index} duration must be positive")
        if outline is not None:
            for section_number in outline_sections:
                if section_number not in seen_sections:
                    issues.append(
                        f"Storyboard is missing outline section {section_number}"
                    )
        return issues

    def validate_structure(
        self, stage: str, brief: dict, output: Any, outline: Any = None
    ) -> list[str]:
        if stage == "outline":
            return self._validate_outline(brief, output)
        if stage == "storyboard":
            return self._validate_storyboard(brief, output, outline=outline)
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
    def _format_output(output: Any, max_chars: int = 12000) -> str:
        return render_prompt_value(output, max_chars)

    def _build_review_prompt(
        self,
        stage: str,
        brief: dict,
        output: Any,
        outline: Any = None,
        revision_artifact: Any = None,
        revision_instruction: Optional[str] = None,
    ) -> str:
        # Intake (10k), artifact/outline (20k), and revision context (10k)
        # remain under a 40k contextual budget before fixed instructions.
        if stage == "storyboard" and outline is not None:
            artifact = (
                f"## APPROVED OUTLINE\n{self._format_output(outline, 8000)}\n\n"
                f"## STORYBOARD\n{self._format_output(output)}"
            )
        else:
            label = "OUTLINE" if stage == "outline" else "STORYBOARD"
            artifact = f"## {label}\n{self._format_output(output)}"
        revision_context = ""
        if revision_artifact is not None or revision_instruction:
            revision_context = (
                "\n\n## REVISION CONTRACT\n"
                "Judge exact compliance with the user instruction and preservation of "
                "unaffected content.\n"
            )
            if revision_instruction:
                revision_context += (
                    "User instruction:\n"
                    f"{render_prompt_value(revision_instruction, 2000)}\n"
                )
            if revision_artifact is not None:
                revision_context += (
                    "Prior artifact:\n"
                    f"{self._format_output(revision_artifact, 8000)}"
                )
        return (
            "Review this artifact holistically for usefulness, coherence, specificity, "
            "grounding, audience fit, production readiness, and completion.\n\n"
            f"## APPROVED INTAKE\n{self._build_brief_context(brief)}\n\n"
            f"{artifact}{revision_context}\n\n"
            "Return the exact JSON object required by the system prompt."
        )

    @staticmethod
    def _string_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item) for item in value if str(item).strip()]

    def _structural_failure_result(
        self,
        issues: list[str],
        attempt: int = 1,
        total_attempts: int = 1,
    ) -> QualityEvalResult:
        feedback = "Structural validation failed: " + "; ".join(issues)
        return QualityEvalResult(
            passed=False,
            gut=GutScore(score=0.0, feedback=feedback),
            dimensions=None,
            composite_score=0.0,
            attempt=attempt,
            total_attempts=total_attempts,
            issues=list(issues),
            deterministic_issues=list(issues),
            advisory=False,
            review_passed=False,
        )

    def _log_eval_event(
        self, stage: str, brief: dict, output: Any, result: QualityEvalResult,
        outline: Any = None,
        revision_artifact: Any = None,
        revision_instruction: Optional[str] = None,
    ) -> None:
        try:
            from app.infra.quality_log import qlog

            context = self._build_review_prompt(
                stage,
                brief,
                output,
                outline,
                revision_artifact=revision_artifact,
                revision_instruction=revision_instruction,
            )
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
        revision_artifact: Any = None,
        revision_instruction: Optional[str] = None,
    ) -> QualityEvalResult:
        structural_issues = self.validate_structure(
            stage, brief, output, outline=outline
        )
        if structural_issues:
            result = self._structural_failure_result(structural_issues)
            self._log_eval_event(
                stage,
                brief,
                output,
                result,
                outline,
                revision_artifact,
                revision_instruction,
            )
            return result

        result = await self._holistic_result(
            stage,
            brief,
            output,
            outline=outline,
            revision_artifact=revision_artifact,
            revision_instruction=revision_instruction,
            attempt=1,
            total_attempts=1,
        )
        self._log_eval_event(
            stage,
            brief,
            output,
            result,
            outline,
            revision_artifact,
            revision_instruction,
        )
        return result

    async def _holistic_result(
        self,
        stage: str,
        brief: dict,
        output: Any,
        outline: Any = None,
        revision_artifact: Any = None,
        revision_instruction: Optional[str] = None,
        attempt: int = 1,
        total_attempts: int = 1,
    ) -> QualityEvalResult:
        """Run only the subjective review; callers own final metadata and logging."""
        prompt = self._build_review_prompt(
            stage,
            brief,
            output,
            outline,
            revision_artifact=revision_artifact,
            revision_instruction=revision_instruction,
        )
        raw = await self._async_call_eval(stage, prompt, label="holistic")
        try:
            score = float(raw.get("score", 0))
        except (TypeError, ValueError, AttributeError):
            score = 0.0
        score = max(0.0, min(10.0, score))
        review_passed = bool(raw.get("passed", False)) and score >= self.threshold
        feedback = str(raw.get("feedback", ""))
        return QualityEvalResult(
            passed=review_passed,
            gut=GutScore(score=score, feedback=feedback),
            dimensions=None,
            composite_score=round(score, 1),
            attempt=attempt,
            total_attempts=total_attempts,
            strengths=self._string_list(raw.get("strengths")),
            issues=self._string_list(raw.get("issues")),
            deterministic_issues=[],
            advisory=False,
            review_passed=review_passed,
        )

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

    async def run_generator_with_gate(
        self,
        generate_with_feedback: Any,
        brief: dict,
        stage: str,
        outline: Any = None,
        revision_artifact: Any = None,
        revision_instruction: Optional[str] = None,
    ) -> tuple[Any, QualityEvalResult]:
        quality_feedback: Optional[str] = None

        for attempt in range(1, self.max_attempts + 1):
            output = generate_with_feedback(quality_feedback)
            if inspect.isawaitable(output):
                output = await output

            review_outline = outline if stage == "storyboard" else None
            structural_issues = self.validate_structure(
                stage, brief, output, outline=review_outline
            )
            if structural_issues:
                result = self._structural_failure_result(
                    structural_issues,
                    attempt=attempt,
                    total_attempts=self.max_attempts,
                )
                self._log_eval_event(
                    stage,
                    brief,
                    output,
                    result,
                    review_outline,
                    revision_artifact,
                    revision_instruction,
                )
                if attempt == self.max_attempts:
                    return output, result
                quality_feedback = (
                    "The previous output failed deterministic structural validation. "
                    "Correct every issue before returning:\n- "
                    + "\n- ".join(structural_issues)
                )
                continue

            result = await self._holistic_result(
                stage,
                brief,
                output,
                outline=review_outline,
                revision_artifact=revision_artifact,
                revision_instruction=revision_instruction,
                attempt=attempt,
                total_attempts=self.max_attempts,
            )
            if result.review_passed:
                result.advisory = False
                self._log_eval_event(
                    stage,
                    brief,
                    output,
                    result,
                    review_outline,
                    revision_artifact,
                    revision_instruction,
                )
                return output, result
            if attempt == self.max_attempts:
                # The output is structurally safe. Keep the low holistic review
                # visible, but do not block the workflow after the one retry.
                result.passed = True
                result.advisory = True
                self._log_eval_event(
                    stage,
                    brief,
                    output,
                    result,
                    review_outline,
                    revision_artifact,
                    revision_instruction,
                )
                return output, result
            self._log_eval_event(
                stage,
                brief,
                output,
                result,
                review_outline,
                revision_artifact,
                revision_instruction,
            )
            quality_feedback = self.format_feedback_for_retry(result, attempt - 1)

        raise RuntimeError("Quality gate exhausted unexpectedly")

    async def run_with_gate(
        self,
        agent: Any,
        state: Any,
        stage: str,
        outline_for_cross_stage: Any = None,
    ) -> tuple[Any, QualityEvalResult]:
        def generate(quality_feedback: Optional[str]) -> Any:
            if quality_feedback:
                return agent.run(state, quality_feedback=quality_feedback)
            return agent.run(state)

        return await self.run_generator_with_gate(
            generate,
            state.story_brief or {},
            stage,
            outline=outline_for_cross_stage,
        )

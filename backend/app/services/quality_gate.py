import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any, Optional

from app.infra.llm_gateway import llm


PROMPTS_DIR = Path(__file__).parent.parent.parent.parent / "prompts"

OUTLINE_DIMENSIONS = [
    ("flow_coherence", "Does each section prepare the next and create a natural cognitive progression? Look for abrupt jumps, missing bridges between ideas, or circular reasoning."),
    ("talking_point_sharpness", "Are the talking points specific, differentiated, and thesis-supporting rather than generic or interchangeable?"),
    ("evidence_fitness", "Do the proposed evidence directions provide the right kind and strength of support for the claims? Would they actually strengthen the argument?"),
    ("brief_pov_alignment", "Does the outline clearly serve the brief's intended viewer outcome and defend the intended point of view? Has the AI drifted to a related but different topic?"),
    ("section_necessity", "Does each section have a distinct teaching job, or is it redundant, mergeable, or disposable? Could any sections be combined without losing value?"),
    ("narrative_completeness", "Does the outline fully realize the promised arc from hook to closing? Check that the opening actually functions as a hook, the final section clearly lands the last core talking point as a closing/action/reframe, and the outline does not feel cut off or incomplete."),
]

STORYBOARD_DIMENSIONS = [
    ("instructional_progression", "Do the screens build understanding step by step, or merely place information in sequence? Is there a clear learning arc?"),
    ("context_rot", "Does the storyboard preserve the specificity and intent of the outline, or drift into empty significance? Sentences that sound meaningful but convey no substance."),
    ("specificity_retention", "Does the writing preserve concrete, topic-specific substance, or flatten into generic language? Did specific examples, numbers, or references get replaced with vague generalities?"),
    ("source_fidelity", "Does the storyboard stay within the supported claims and evidence, without invention or overreach? Did the AI fabricate facts, statistics, quotes, or claims?"),
    ("redundancy", "Do screens add distinct instructional value, or repeat the same point in different words across screens?"),
    ("handoff_integrity", "Does the storyboard faithfully realize the outline's intended teaching job, section thesis, and required content, without drift, omission, or simplification into weaker material?"),
]

STAGE_DIMENSIONS = {
    "outline": OUTLINE_DIMENSIONS,
    "storyboard": STORYBOARD_DIMENSIONS,
}

STAGE_PROMPTS = {
    "outline": "OUTLINE_EVAL_PROMPT_v0419.md",
    "storyboard": "STORYBOARD_EVAL_PROMPT.md",
}


@dataclass
class DimensionScore:
    dimension: str
    score: float
    feedback: str


@dataclass
class GutScore:
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

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "gut": {"score": self.gut.score, "feedback": self.gut.feedback},
            "dimensions": [
                {"dimension": d.dimension, "score": d.score, "feedback": d.feedback}
                for d in self.dimensions
            ] if self.dimensions else None,
            "composite_score": self.composite_score,
            "attempt": self.attempt,
            "total_attempts": self.total_attempts,
        }


class QualityGate:
    def __init__(
        self,
        model: str = "gpt-4o",
        threshold: float = 7.0,
        max_attempts: int = 2,
    ):
        self.model = model
        self.threshold = threshold
        self.max_attempts = max_attempts
        self._prompts: dict[str, str] = {}

    def _get_prompt(self, stage: str) -> str:
        if stage not in self._prompts:
            filename = STAGE_PROMPTS[stage]
            path = PROMPTS_DIR / filename
            self._prompts[stage] = path.read_text(encoding="utf-8")
        return self._prompts[stage]

    def _extract_brief_field(self, story_brief: dict, field_name: str, default=""):
        if "fields" in story_brief:
            f = story_brief["fields"].get(field_name, {})
            if isinstance(f, dict) and "value" in f:
                return f["value"]
        return story_brief.get(field_name, default)

    def _build_brief_context(self, story_brief: dict) -> str:
        viewer_outcome = self._extract_brief_field(story_brief, "viewer_outcome")
        target_audience = self._extract_brief_field(story_brief, "target_audience")
        audience_level = self._extract_brief_field(story_brief, "audience_level", "intermediate")
        point_of_view = self._extract_brief_field(story_brief, "point_of_view")
        duration = self._extract_brief_field(story_brief, "duration")
        misconceptions = self._extract_brief_field(story_brief, "misconceptions")
        must_avoid = self._extract_brief_field(story_brief, "must_avoid", [])
        core_talking_points = self._extract_brief_field(story_brief, "core_talking_points", [])

        if isinstance(core_talking_points, str):
            core_talking_points = [core_talking_points]
        if isinstance(misconceptions, list):
            misconceptions = "; ".join(str(item) for item in misconceptions if item)
        if isinstance(must_avoid, str):
            must_avoid = [must_avoid]

        talking_points_text = "\n".join(
            f"{idx}. {point}" for idx, point in enumerate(core_talking_points, start=1)
        ) or "(none provided)"
        must_avoid_text = "\n".join(f"- {item}" for item in must_avoid if item) or "(none)"

        return (
            f"Target audience: {target_audience} (level: {audience_level})\n"
            f"Viewer outcome: {viewer_outcome}\n"
            f"Point of view: {point_of_view}\n"
            f"Target duration (seconds): {duration}\n"
            f"Core misconception: {misconceptions or '(none)'}\n"
            f"Must avoid:\n{must_avoid_text}\n"
            f"Core talking points in order:\n{talking_points_text}"
        )

    def _call_eval(self, stage: str, user_prompt: str, label: str = "eval") -> dict:
        return llm.chat_json(
            category="storyboard",
            label=f"qg_{label}",
            system_prompt=self._get_prompt(stage),
            user_prompt=user_prompt,
            model=self.model,
            temperature=0.2,
            max_tokens=500,
        )

    async def _async_call_eval(self, stage: str, user_prompt: str, label: str = "eval") -> dict:
        return await asyncio.to_thread(self._call_eval, stage, user_prompt, label)

    def _log_eval_event(self, stage, brief, output, result, outline=None):
        try:
            from app.infra.quality_log import qlog
            prompt_ref = STAGE_PROMPTS.get(stage, "unknown")
            brief_ctx = self._build_brief_context(brief)
            output_text = self._format_output(stage, output)
            if outline:
                ctx = f"{brief_ctx}\n\nOutline:\n{self._format_output('outline', outline)}\n\nStoryboard:\n{output_text}"
            else:
                ctx = f"{brief_ctx}\n\n{output_text}"
            qlog.log_eval(
                project_id=brief.get("project_id", "unknown"),
                stage=stage,
                scope="full",
                model=self.model,
                prompt_ref=prompt_ref,
                context=ctx,
                raw_response="",
                scores=result.to_dict(),
            )
        except Exception:
            pass

    def _format_output(self, stage: str, output: Any) -> str:
        if isinstance(output, list):
            return json.dumps(output, indent=2, ensure_ascii=False)
        return str(output)

    async def _gut_check(
        self, stage: str, brief: dict, output: Any, outline: Any = None
    ) -> GutScore:
        brief_ctx = self._build_brief_context(brief)
        output_text = self._format_output(stage, output)

        if stage == "storyboard" and outline:
            content_block = (
                f"## Outline\n{self._format_output('outline', outline)}\n\n"
                f"## Storyboard\n{output_text}"
            )
        else:
            label = "Outline" if stage == "outline" else "Storyboard"
            content_block = f"## {label}\n{output_text}"

        prompt = (
            f"## Mode: gut_check\n\n"
            f"## Brief Context\n{brief_ctx}\n\n"
            f"{content_block}"
        )
        result = await self._async_call_eval(stage, prompt, label="eval_gut")
        return GutScore(
            score=float(result.get("score", 5)),
            feedback=result.get("feedback", ""),
        )

    async def _eval_dimension(
        self,
        stage: str,
        brief: dict,
        output: Any,
        dim_name: str,
        dim_description: str,
        outline: Any = None,
    ) -> DimensionScore:
        brief_ctx = self._build_brief_context(brief)
        output_text = self._format_output(stage, output)

        if stage == "storyboard" and outline:
            content_block = (
                f"## Outline\n{self._format_output('outline', outline)}\n\n"
                f"## Storyboard\n{output_text}"
            )
        else:
            label = "Outline" if stage == "outline" else "Storyboard"
            content_block = f"## {label}\n{output_text}"

        prompt = (
            f"## Mode: dimension\n\n"
            f"## Dimension: {dim_name}\n{dim_description}\n\n"
            f"## Brief Context\n{brief_ctx}\n\n"
            f"{content_block}"
        )
        result = await self._async_call_eval(stage, prompt, label=dim_name)
        return DimensionScore(
            dimension=dim_name,
            score=float(result.get("score", 5)),
            feedback=result.get("feedback", ""),
        )

    async def evaluate(
        self,
        stage: str,
        brief: dict,
        output: Any,
        outline: Any = None,
    ) -> QualityEvalResult:
        gut = await self._gut_check(stage, brief, output, outline=outline)

        if gut.score < self.threshold:
            result = QualityEvalResult(
                passed=False,
                gut=gut,
                dimensions=None,
                composite_score=gut.score,
                attempt=0,
                total_attempts=0,
            )
            self._log_eval_event(stage, brief, output, result, outline)
            return result

        dimensions_def = STAGE_DIMENSIONS[stage]
        dim_scores = await asyncio.gather(*[
            self._eval_dimension(
                stage, brief, output, name, desc, outline=outline
            )
            for name, desc in dimensions_def
        ])
        dim_scores = list(dim_scores)
        avg_dim = mean([d.score for d in dim_scores])
        composite = (gut.score + avg_dim) / 2

        result = QualityEvalResult(
            passed=composite >= self.threshold,
            gut=gut,
            dimensions=dim_scores,
            composite_score=round(composite, 1),
            attempt=0,
            total_attempts=0,
        )
        self._log_eval_event(stage, brief, output, result, outline)
        return result

    def format_feedback_for_retry(self, result: QualityEvalResult, attempt: int) -> str:
        lines = [
            f"--- QUALITY REVIEW FEEDBACK (attempt {attempt + 1} of {self.max_attempts}) ---",
            f"Your previous output scored {result.composite_score}/10. A senior reviewer provided this feedback:",
            "",
            f"[Watchability - {result.gut.score:.0f}/10]: \"{result.gut.feedback}\"",
        ]
        if result.dimensions:
            for d in result.dimensions:
                lines.append(f"[{d.dimension} - {d.score:.0f}/10]: \"{d.feedback}\"")
        lines.append("")
        lines.append("Please revise your output addressing this feedback.")
        return "\n".join(lines)

    async def run_with_gate(
        self,
        agent: Any,
        state: Any,
        stage: str,
        outline_for_cross_stage: Any = None,
    ) -> tuple[Any, QualityEvalResult]:
        brief = state.story_brief or {}
        best_output = None
        best_result = None
        feedback_block = ""

        for attempt in range(self.max_attempts):
            if feedback_block:
                original_prompt = agent.system_prompt
                agent.system_prompt = original_prompt + "\n\n" + feedback_block
                output = agent.run(state)
                agent.system_prompt = original_prompt
            else:
                output = agent.run(state)

            outline_ref = outline_for_cross_stage if stage == "storyboard" else None
            eval_result = await self.evaluate(stage, brief, output, outline=outline_ref)
            eval_result.attempt = attempt + 1
            eval_result.total_attempts = self.max_attempts

            if best_result is None or eval_result.composite_score > best_result.composite_score:
                best_output = output
                best_result = eval_result

            if eval_result.passed:
                return output, eval_result

            if attempt < self.max_attempts - 1:
                feedback_block = self.format_feedback_for_retry(eval_result, attempt)

        best_result.passed = False
        return best_output, best_result

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any, Optional

import anthropic


PROMPTS_DIR = Path(__file__).parent.parent.parent.parent / "prompts"

OUTLINE_DIMENSIONS = [
    ("flow_coherence", "Does each section prepare the next and create a natural cognitive progression? Look for abrupt jumps, missing bridges between ideas, or circular reasoning."),
    ("talking_point_sharpness", "Are the talking points specific, differentiated, and thesis-supporting rather than generic or interchangeable?"),
    ("evidence_fitness", "Do the proposed evidence directions provide the right kind and strength of support for the claims? Would they actually strengthen the argument?"),
    ("brief_pov_alignment", "Does the outline clearly serve the brief's intended viewer outcome and defend the intended point of view? Has the AI drifted to a related but different topic?"),
    ("section_necessity", "Does each section have a distinct teaching job, or is it redundant, mergeable, or disposable? Could any sections be combined without losing value?"),
]

STORYBOARD_DIMENSIONS = [
    ("instructional_progression", "Do the screens build understanding step by step, or merely place information in sequence? Is there a clear learning arc?"),
    ("context_rot", "Does the storyboard preserve the specificity and intent of the outline, or drift into empty significance? Sentences that sound meaningful but convey no substance."),
    ("specificity_retention", "Does the writing preserve concrete, topic-specific substance, or flatten into generic language? Did specific examples, numbers, or references get replaced with vague generalities?"),
    ("source_fidelity", "Does the storyboard stay within the supported claims and evidence, without invention or overreach? Did the AI fabricate facts, statistics, quotes, or claims?"),
    ("redundancy", "Do screens add distinct instructional value, or repeat the same point in different words across screens?"),
]

CROSS_STAGE_DIMENSIONS = [
    ("handoff_integrity", "Does the storyboard faithfully realize the outline's intended teaching job, section thesis, and required content, without drift, omission, or simplification into weaker material?"),
]

STAGE_DIMENSIONS = {
    "outline": OUTLINE_DIMENSIONS,
    "storyboard": STORYBOARD_DIMENSIONS,
    "cross_stage": CROSS_STAGE_DIMENSIONS,
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
class GradeResult:
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
        model: str = "claude-sonnet-4-6-20250514",
        threshold: float = 7.0,
        max_attempts: int = 2,
    ):
        self.model = model
        self.threshold = threshold
        self.max_attempts = max_attempts
        self.client = anthropic.Anthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        self.system_prompt = self._load_prompt()

    def _load_prompt(self) -> str:
        path = PROMPTS_DIR / "QUALITY_JUDGE_PROMPT.md"
        return path.read_text(encoding="utf-8")

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
        return (
            f"Target audience: {target_audience} (level: {audience_level})\n"
            f"Viewer outcome: {viewer_outcome}\n"
            f"Point of view: {point_of_view}"
        )

    def _call_judge(self, user_prompt: str) -> dict:
        response = self.client.messages.create(
            model=self.model,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.2,
            max_tokens=500,
        )
        text = response.content[0].text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        return json.loads(text)

    async def _async_call_judge(self, user_prompt: str) -> dict:
        return await asyncio.to_thread(self._call_judge, user_prompt)

    def _format_output(self, stage: str, output: Any) -> str:
        if isinstance(output, list):
            return json.dumps(output, indent=2, ensure_ascii=False)
        return str(output)

    async def _gut_check(
        self, stage: str, brief: dict, output: Any, outline: Any = None
    ) -> GutScore:
        brief_ctx = self._build_brief_context(brief)
        output_text = self._format_output(stage, output)

        if stage == "cross_stage":
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
        result = await self._async_call_judge(prompt)
        return GutScore(
            score=float(result.get("score", 5)),
            feedback=result.get("feedback", ""),
        )

    async def _judge_dimension(
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

        if stage == "cross_stage":
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
        result = await self._async_call_judge(prompt)
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
    ) -> GradeResult:
        gut = await self._gut_check(stage, brief, output, outline=outline)

        if gut.score < self.threshold:
            return GradeResult(
                passed=False,
                gut=gut,
                dimensions=None,
                composite_score=gut.score,
                attempt=0,
                total_attempts=0,
            )

        dimensions_def = STAGE_DIMENSIONS[stage]
        dim_scores = await asyncio.gather(*[
            self._judge_dimension(
                stage, brief, output, name, desc, outline=outline
            )
            for name, desc in dimensions_def
        ])
        dim_scores = list(dim_scores)
        avg_dim = mean([d.score for d in dim_scores])
        composite = (gut.score + avg_dim) / 2

        return GradeResult(
            passed=composite >= self.threshold,
            gut=gut,
            dimensions=dim_scores,
            composite_score=round(composite, 1),
            attempt=0,
            total_attempts=0,
        )

    def format_feedback_for_retry(self, grade: GradeResult, attempt: int) -> str:
        lines = [
            f"--- QUALITY REVIEW FEEDBACK (attempt {attempt + 1} of {self.max_attempts}) ---",
            f"Your previous output scored {grade.composite_score}/10. A senior reviewer provided this feedback:",
            "",
            f"[Watchability - {grade.gut.score:.0f}/10]: \"{grade.gut.feedback}\"",
        ]
        if grade.dimensions:
            for d in grade.dimensions:
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
    ) -> tuple[Any, GradeResult]:
        brief = state.story_brief or {}
        best_output = None
        best_grade = None
        feedback_block = ""

        for attempt in range(self.max_attempts):
            if feedback_block:
                original_prompt = agent.system_prompt
                agent.system_prompt = original_prompt + "\n\n" + feedback_block
                output = agent.run(state)
                agent.system_prompt = original_prompt
            else:
                output = agent.run(state)

            outline_ref = outline_for_cross_stage if stage == "cross_stage" else None
            grade = await self.evaluate(stage, brief, output, outline=outline_ref)
            grade.attempt = attempt + 1
            grade.total_attempts = self.max_attempts

            if best_grade is None or grade.composite_score > best_grade.composite_score:
                best_output = output
                best_grade = grade

            if grade.passed:
                return output, grade

            if attempt < self.max_attempts - 1:
                feedback_block = self.format_feedback_for_retry(grade, attempt)

        best_grade.passed = False
        return best_output, best_grade

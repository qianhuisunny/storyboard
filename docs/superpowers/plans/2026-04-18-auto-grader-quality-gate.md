# Auto-Grader Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline quality gates that grade AI output during generation, retry with written feedback if below threshold, and surface scores to users.

**Architecture:** QualityGate service wraps Director/Writer agent calls in a generate→grade→retry loop. Grading uses a two-tier system: Tier 1 gut check ("would you watch this?"), then Tier 2 parallel per-dimension scoring. Judge calls use Claude Sonnet 4 via the Anthropic SDK (already in base.py). Results attach to pipeline state and render as a collapsible card in the frontend.

**Tech Stack:** Python/FastAPI (backend), Anthropic SDK (judge LLM), React/TypeScript/Tailwind (frontend), existing shadcn Card component.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `prompts/QUALITY_JUDGE_PROMPT.md` | Create | Single judge prompt with gut_check and dimension modes |
| `backend/app/services/quality_gate.py` | Create | QualityGate class: evaluate, retry loop, feedback formatting |
| `backend/app/services/state.py` | Modify | Add 3 grade fields to StoryboardState |
| `backend/app/services/orchestrator.py` | Modify | Wrap Director/Writer calls with quality gate |
| `frontend/src/components/QualityScore.tsx` | Create | Collapsible score card component |
| `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` | Modify | Insert QualityScore card |
| `frontend/src/components/DraftBuilder/UserView/UserView.tsx` | Modify | Insert QualityScore card |
| `prompts/EVAL_JUDGE_PROMPT.md` | Move → `prompts/archive/` | Replaced by QUALITY_JUDGE_PROMPT.md |

---

### Task 1: Create the Judge Prompt

**Files:**
- Create: `prompts/QUALITY_JUDGE_PROMPT.md`

- [ ] **Step 1: Write the judge prompt**

Create `prompts/QUALITY_JUDGE_PROMPT.md`:

```markdown
# Quality Judge

You are evaluating AI-generated content for an educational/knowledge-sharing video. You will be called in one of two modes.

---

## Mode: gut_check

You adopt the persona of the video's target audience. You've just been shown an outline or storyboard for a video.

Answer these questions as that viewer:
- Would you choose to watch this video over competing content?
- Would you stay through the whole thing, or lose interest partway?

Return ONLY valid JSON:

\```json
{
  "score": 7,
  "feedback": "2-3 sentences as the viewer — your honest reaction, not a critique."
}
\```

Score guide:
- 1-3: Would not click. Feels generic, confusing, or irrelevant to me.
- 4-6: Might click but would lose interest. Some parts feel like filler or don't connect.
- 7-8: Would watch and find it useful. Clear value, holds my attention.
- 9-10: Would share with colleagues. Genuinely insightful, couldn't get this elsewhere.

---

## Mode: dimension

You are a senior instructional designer reviewing AI-generated content. Evaluate on ONE specific dimension provided in the user prompt.

Return ONLY valid JSON:

\```json
{
  "score": 7,
  "feedback": "2-3 sentences of direct, specific feedback. Reference section or screen numbers. Write like a design manager giving a note — no tags, no checklists."
}
\```

Score guide:
- 1-3: Fundamental problems. The dimension is not met at all.
- 4-6: Partial. Some aspects work but significant issues remain.
- 7-8: Solid. Minor issues that don't undermine the whole.
- 9-10: Excellent. Nothing meaningful to improve on this dimension.

---

## Dimension Definitions

### Outline Dimensions

1. **flow_coherence** — Does each section prepare the next and create a natural cognitive progression? Look for abrupt jumps, missing bridges between ideas, or circular reasoning.

2. **talking_point_sharpness** — Are the talking points specific, differentiated, and thesis-supporting rather than generic or interchangeable?

3. **evidence_fitness** — Do the proposed evidence directions provide the right kind and strength of support for the claims? Would they actually strengthen the argument?

4. **brief_pov_alignment** — Does the outline clearly serve the brief's intended viewer outcome and defend the intended point of view? Has the AI drifted to a related but different topic?

5. **section_necessity** — Does each section have a distinct teaching job, or is it redundant, mergeable, or disposable? Could any sections be combined without losing value?

### Storyboard Dimensions

1. **instructional_progression** — Do the screens build understanding step by step, or merely place information in sequence? Is there a clear learning arc?

2. **context_rot** — Does the storyboard preserve the specificity and intent of the outline, or drift into empty significance? Sentences that sound meaningful but convey no substance.

3. **specificity_retention** — Does the writing preserve concrete, topic-specific substance, or flatten into generic language? Did specific examples, numbers, or references get replaced with vague generalities?

4. **source_fidelity** — Does the storyboard stay within the supported claims and evidence, without invention or overreach? Did the AI fabricate facts, statistics, quotes, or claims?

5. **redundancy** — Do screens add distinct instructional value, or repeat the same point in different words across screens?

### Cross-Stage Dimensions

1. **handoff_integrity** — Does the storyboard faithfully realize the outline's intended teaching job, section thesis, and required content, without drift, omission, or simplification into weaker material?

---

## Rules

- Only flag issues you are confident about. When in doubt, give benefit of the doubt.
- Be specific in feedback — reference section/screen numbers.
- Do NOT invent issues that don't exist. A score of 8-9 with brief positive feedback is perfectly fine.
- For gut_check mode: react as the audience, not as a professional critic.
- For dimension mode: evaluate standalone quality against the dimension definition. No gold standard comparison.
```

Note: The `\``` ` above should be actual triple backticks in the file (escaped here for plan readability).

- [ ] **Step 2: Commit**

```bash
git add prompts/QUALITY_JUDGE_PROMPT.md
git commit -m "feat: add quality judge prompt for auto-grader"
```

---

### Task 2: Create QualityGate Service

**Files:**
- Create: `backend/app/services/quality_gate.py`

- [ ] **Step 1: Write the QualityGate service**

Create `backend/app/services/quality_gate.py`:

```python
"""
Quality Gate — inline grading for AI-generated outlines and storyboards.

Two-tier grading:
  Tier 1: Gut check ("would you watch this?") — 1 LLM call
  Tier 2: Per-dimension scoring — parallel LLM calls

Retry loop: generate → grade → retry with feedback (up to max_attempts).
"""

import asyncio
import json
import os
import re
from dataclasses import dataclass, field, asdict
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
        max_attempts: int = 3,
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
        # Extract JSON from potential markdown blocks
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
            # Generate
            if feedback_block:
                original_prompt = agent.system_prompt
                agent.system_prompt = original_prompt + "\n\n" + feedback_block
                output = agent.run(state)
                agent.system_prompt = original_prompt
            else:
                output = agent.run(state)

            # Grade
            outline_ref = outline_for_cross_stage if stage == "cross_stage" else None
            grade = await self.evaluate(stage, brief, output, outline=outline_ref)
            grade.attempt = attempt + 1
            grade.total_attempts = self.max_attempts

            # Track best
            if best_grade is None or grade.composite_score > best_grade.composite_score:
                best_output = output
                best_grade = grade

            if grade.passed:
                return output, grade

            # Prepare feedback for retry
            if attempt < self.max_attempts - 1:
                feedback_block = self.format_feedback_for_retry(grade, attempt)

        # All attempts failed — return best
        best_grade.passed = False
        return best_output, best_grade
```

- [ ] **Step 2: Verify the module imports cleanly**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -c "from app.services.quality_gate import QualityGate, GradeResult; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/quality_gate.py
git commit -m "feat: add QualityGate service with two-tier grading and retry loop"
```

---

### Task 3: Add Grade Fields to StoryboardState and API

**Files:**
- Modify: `backend/app/services/state.py:22-70`
- Modify: `backend/app/services/orchestrator.py:446-467` (`_serialize_state`)
- Modify: `backend/app/main.py:787-794` (`get_pipeline_state` data block)

- [ ] **Step 1: Add grade fields to StoryboardState**

In `backend/app/services/state.py`, add three fields after the `evidence_research` field (after line 56):

```python
    # Quality gate grades (auto-grader results)
    outline_grade: Optional[dict] = None
    storyboard_grade: Optional[dict] = None
    cross_stage_grade: Optional[dict] = None
```

- [ ] **Step 2: Add grades to _serialize_state in orchestrator.py**

In `backend/app/services/orchestrator.py`, inside the `_serialize_state` method, add to the returned dict (after `has_evidence_research` line):

```python
            "outline_grade": state.outline_grade,
            "storyboard_grade": state.storyboard_grade,
            "cross_stage_grade": state.cross_stage_grade,
```

- [ ] **Step 3: Add grades to pipeline-state API endpoint**

In `backend/app/main.py`, in the `get_pipeline_state` function, add to the `"data"` dict (after line 793, `"evidence_research"` line):

```python
                "outline_grade": state.outline_grade,
                "storyboard_grade": state.storyboard_grade,
                "cross_stage_grade": state.cross_stage_grade,
```

This is the API the frontend reads to get pipeline state. Without this, the frontend would never see the grades.

- [ ] **Step 4: Verify backend starts**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -c "from app.services.state import StoryboardState; s = StoryboardState(project_id='test'); print(s.outline_grade, s.storyboard_grade, s.cross_stage_grade)"`

Expected: `None None None`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/state.py backend/app/services/orchestrator.py backend/app/main.py
git commit -m "feat: add outline/storyboard/cross-stage grade fields to state and API"
```

---

### Task 4: Wire QualityGate into Orchestrator

**Files:**
- Modify: `backend/app/services/orchestrator.py`

The quality gate wraps the two main generation points:
1. `_handle_brief_approve` (line 717-745) — runs Director
2. `_handle_gate2_approve` (line 238-260) — runs Writer

Plus `_handle_gate1_approve` (line 161-208) for the legacy flow.

- [ ] **Step 1: Add QualityGate import and init**

At the top of `orchestrator.py`, add the import:

```python
from app.services.quality_gate import QualityGate
```

In `StoryboardOrchestrator.__init__`, add after `self.agents`:

```python
        self.quality_gate = QualityGate()
```

- [ ] **Step 2: Wrap Director call in _handle_brief_approve**

Replace the Director generation block in `_handle_brief_approve` (lines 733-738):

```python
        # Current code:
        # state = manager.transition(state, "approve")  # gate1 → outline
        # screen_outline = self.agents["director"].run(state)
        # state.screen_outline = screen_outline
        # state = manager.transition(state, "outline_ready")  # outline → gate2
```

With:

```python
        state = manager.transition(state, "approve")
        screen_outline, outline_grade = await self.quality_gate.run_with_gate(
            agent=self.agents["director"],
            state=state,
            stage="outline",
        )
        state.screen_outline = screen_outline
        state.outline_grade = outline_grade.to_dict()
        state = manager.transition(state, "outline_ready")
```

- [ ] **Step 3: Wrap Writer call in _handle_gate2_approve**

Replace the Writer generation block in `_handle_gate2_approve` (lines 249-252):

```python
        # Current code:
        # storyboard = self.agents["writer"].run(state)
        # state.storyboard = storyboard
        # state = manager.transition(state, "storyboard_ready")
```

With:

```python
        storyboard, storyboard_grade = await self.quality_gate.run_with_gate(
            agent=self.agents["writer"],
            state=state,
            stage="storyboard",
        )
        state.storyboard = storyboard
        state.storyboard_grade = storyboard_grade.to_dict()

        # Cross-stage check
        _, cross_grade = await self.quality_gate.run_with_gate(
            agent=self.agents["writer"],
            state=state,
            stage="cross_stage",
            outline_for_cross_stage=state.screen_outline,
        )
        state.cross_stage_grade = cross_grade.to_dict()
        state = manager.transition(state, "storyboard_ready")
```

Note: The cross-stage gate only evaluates — it doesn't regenerate the writer. If the cross-stage check fails, we still show the storyboard with its scores. The `run_with_gate` call for cross-stage will call `agent.run(state)` again on retry, which is correct — it regenerates the storyboard to try to better match the outline.

- [ ] **Step 4: Wrap Director call in _handle_gate1_approve (legacy flow)**

Replace the Director generation block in `_handle_gate1_approve` (lines 199-202):

```python
        # Current code:
        # screen_outline = self.agents["director"].run(state)
        # state.screen_outline = screen_outline
```

With:

```python
        screen_outline, outline_grade = await self.quality_gate.run_with_gate(
            agent=self.agents["director"],
            state=state,
            stage="outline",
        )
        state.screen_outline = screen_outline
        state.outline_grade = outline_grade.to_dict()
```

- [ ] **Step 5: Add grades to result dicts**

In `_handle_brief_approve`, add to the result dict:

```python
        result["outline_grade"] = state.outline_grade
```

In `_handle_gate2_approve`, add:

```python
        result["storyboard_grade"] = state.storyboard_grade
        result["cross_stage_grade"] = state.cross_stage_grade
```

In `_handle_gate1_approve`, add:

```python
        result["outline_grade"] = state.outline_grade
```

- [ ] **Step 6: Verify backend starts without errors**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -c "from app.services.orchestrator import orchestrator; print('OK')"`

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/orchestrator.py
git commit -m "feat: wire QualityGate into orchestrator Director/Writer calls"
```

---

### Task 5: Create QualityScore Frontend Component

**Files:**
- Create: `frontend/src/components/QualityScore.tsx`

- [ ] **Step 1: Create the QualityScore component**

Create `frontend/src/components/QualityScore.tsx`:

```tsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./ui/card";

interface DimensionScore {
  dimension: string;
  score: number;
  feedback: string;
}

interface GutScore {
  score: number;
  feedback: string;
}

export interface GradeResult {
  passed: boolean;
  gut: GutScore;
  dimensions: DimensionScore[] | null;
  composite_score: number;
  attempt: number;
  total_attempts: number;
}

const DIMENSION_LABELS: Record<string, string> = {
  flow_coherence: "Flow",
  talking_point_sharpness: "Sharpness",
  evidence_fitness: "Evidence",
  brief_pov_alignment: "POV",
  section_necessity: "Necessity",
  instructional_progression: "Progression",
  context_rot: "Context",
  specificity_retention: "Specificity",
  source_fidelity: "Fidelity",
  redundancy: "Redundancy",
  handoff_integrity: "Handoff",
};

function scoreColor(score: number): string {
  if (score >= 8) return "text-green-700";
  if (score >= 6) return "text-yellow-700";
  return "text-red-700";
}

export function QualityScore({ grade }: { grade: GradeResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">
            Quality Score:{" "}
            <span className={scoreColor(grade.composite_score)}>
              {grade.composite_score}/10
            </span>
          </span>
          {grade.total_attempts > 1 && (
            <span className="text-xs text-muted-foreground">
              (attempt {grade.attempt} of {grade.total_attempts})
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* Gut check */}
          <div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Watchability
              </span>
              <span className={`text-sm font-medium ${scoreColor(grade.gut.score)}`}>
                {grade.gut.score}/10
              </span>
            </div>
            <p className="text-sm text-foreground/80 italic">
              "{grade.gut.feedback}"
            </p>
          </div>

          {/* Dimension summary line */}
          {grade.dimensions && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {grade.dimensions.map((d) => (
                <span key={d.dimension} className="text-xs text-muted-foreground">
                  {DIMENSION_LABELS[d.dimension] || d.dimension}:{" "}
                  <span className={`font-medium ${scoreColor(d.score)}`}>
                    {d.score}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Per-dimension feedback */}
          {grade.dimensions && (
            <details className="group">
              <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                Detailed feedback
              </summary>
              <div className="mt-2 space-y-2 pl-2 border-l-2 border-border">
                {grade.dimensions.map((d) => (
                  <div key={d.dimension}>
                    <span className="text-xs font-medium text-foreground">
                      {DIMENSION_LABELS[d.dimension] || d.dimension}{" "}
                      <span className={scoreColor(d.score)}>({d.score}/10)</span>
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.feedback}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build 2>&1 | tail -5`

Expected: Build succeeds (component is created but not imported anywhere yet, so no errors expected).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/QualityScore.tsx
git commit -m "feat: add QualityScore collapsible card component"
```

---

### Task 6: Insert QualityScore into OutlineBuilder

The grade data flows: API (`/pipeline-state`) → `StageContent.tsx` (fetches state) → `OutlineBuilder` (via new prop) → `QualityScore` component.

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/types.ts` (add prop)
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` (render card)
- Modify: `frontend/src/components/StageContent.tsx` (pass grade to OutlineBuilder)

- [ ] **Step 1: Add outlineGrade prop to OutlineBuilderProps**

In `frontend/src/components/OutlineBuilder/types.ts`, add to the `OutlineBuilderProps` interface and add the import:

```tsx
import type { GradeResult } from "../QualityScore";
```

Add to `OutlineBuilderProps`:

```tsx
  outlineGrade?: GradeResult | null;
```

- [ ] **Step 2: Render QualityScore in OutlineBuilder**

In `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`, add import:

```tsx
import { QualityScore } from "../QualityScore";
```

Destructure the new prop in the component function signature (add `outlineGrade` to the destructured props).

In the render, find the `<div id="outline">` element (around line 255). Insert the QualityScore card right before it:

```tsx
        {outlineGrade && (
          <QualityScore grade={outlineGrade} />
        )}
```

- [ ] **Step 3: Pass grade from StageContent to OutlineBuilder**

In `frontend/src/components/StageContent.tsx`:

1. Add state to store the outline grade:

```tsx
const [outlineGrade, setOutlineGrade] = useState<GradeResult | null>(null);
```

Add the import:

```tsx
import type { GradeResult } from "./QualityScore";
```

2. Where pipeline-state is fetched after outline generation (search for `stateData.data?.screen_outline` or the area around line 766 where `get_pipeline_state` is called for outline), extract the grade:

```tsx
setOutlineGrade(stateData.data?.outline_grade || null);
```

Also extract it in the initial state load (around line 180-196 where pipeline-state is first fetched):

```tsx
setOutlineGrade(stateData.data?.outline_grade || null);
```

3. Pass the prop to OutlineBuilder (around line 951-964):

```tsx
        <OutlineBuilder
          content={currentOutlineText}
          aiContent={aiContent}
          onChange={handleOutlineTextChange}
          onRunResearch={handleRunResearch}
          onRerunResearch={handleRerunResearch}
          onContinue={handleResearchContinue}
          onRegenerateSection={handleRegenerateSection}
          onRefineOutline={handleRefineOutline}
          isResearching={isResearchingEvidence}
          isRegenerating={isRegeneratingOutline}
          researchResults={outlineResearchResults}
          researchProgress={researchProgress}
          outlineGrade={outlineGrade}
        />
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OutlineBuilder/types.ts frontend/src/components/OutlineBuilder/OutlineBuilder.tsx frontend/src/components/StageContent.tsx
git commit -m "feat: show QualityScore card in OutlineBuilder"
```

---

### Task 7: Insert QualityScore into DraftBuilder

The grade data flows: API → `StageContent.tsx` → `DraftBuilder` → `UserView` → `QualityScore`.

**Files:**
- Modify: `frontend/src/components/DraftBuilder/types.ts` (add props)
- Modify: `frontend/src/components/DraftBuilder/DraftBuilder.tsx` (pass through)
- Modify: `frontend/src/components/DraftBuilder/UserView/UserView.tsx` (render cards)
- Modify: `frontend/src/components/StageContent.tsx` (pass grades to DraftBuilder)

- [ ] **Step 1: Add grade props to DraftBuilder types**

In `frontend/src/components/DraftBuilder/types.ts`, add import:

```tsx
import type { GradeResult } from "../QualityScore";
```

Add to `DraftBuilderProps`:

```tsx
  storyboardGrade?: GradeResult | null;
  crossStageGrade?: GradeResult | null;
```

Add to `UserViewProps`:

```tsx
  storyboardGrade?: GradeResult | null;
  crossStageGrade?: GradeResult | null;
```

- [ ] **Step 2: Pass through in DraftBuilder.tsx**

In `frontend/src/components/DraftBuilder/DraftBuilder.tsx`, destructure and pass the new props through to `UserView`:

```tsx
  storyboardGrade,
  crossStageGrade,
```

And in the `<UserView>` render:

```tsx
  storyboardGrade={storyboardGrade}
  crossStageGrade={crossStageGrade}
```

- [ ] **Step 3: Render QualityScore in UserView**

In `frontend/src/components/DraftBuilder/UserView/UserView.tsx`, add import:

```tsx
import { QualityScore } from "../../QualityScore";
```

Destructure `storyboardGrade` and `crossStageGrade` from props.

In the render, find the `<div className="w-full max-w-5xl space-y-3">` container (around line 153). Insert the cards at the top:

```tsx
      {storyboardGrade && (
        <QualityScore grade={storyboardGrade} />
      )}
      {crossStageGrade && (
        <QualityScore grade={crossStageGrade} />
      )}
```

- [ ] **Step 4: Pass grades from StageContent to DraftBuilder**

In `frontend/src/components/StageContent.tsx`:

1. Add state for storyboard grades (near the outlineGrade state from Task 6):

```tsx
const [storyboardGrade, setStoryboardGrade] = useState<GradeResult | null>(null);
const [crossStageGrade, setCrossStageGrade] = useState<GradeResult | null>(null);
```

2. Where pipeline-state is fetched after storyboard generation, extract the grades:

```tsx
setStoryboardGrade(stateData.data?.storyboard_grade || null);
setCrossStageGrade(stateData.data?.cross_stage_grade || null);
```

3. Pass props to DraftBuilder (around line 970-980):

```tsx
        <DraftBuilder
          draftData={currentDraft}
          outlineSummary={outlineSummary}
          previousStageOutput={previousStageOutput}
          processingLog={draftProcessingLog}
          onDraftUpdate={handleDraftUpdate}
          onConfirm={handleDraftConfirm}
          storyboardGrade={storyboardGrade}
          crossStageGrade={crossStageGrade}
        />
```

- [ ] **Step 5: Build and verify**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DraftBuilder/types.ts frontend/src/components/DraftBuilder/DraftBuilder.tsx frontend/src/components/DraftBuilder/UserView/UserView.tsx frontend/src/components/StageContent.tsx
git commit -m "feat: show QualityScore cards in DraftBuilder"
```

---

### Task 8: Archive Old Judge Prompt

**Files:**
- Move: `prompts/EVAL_JUDGE_PROMPT.md` → `prompts/archive/EVAL_JUDGE_PROMPT.md`

- [ ] **Step 1: Move the file**

```bash
mv prompts/EVAL_JUDGE_PROMPT.md prompts/archive/EVAL_JUDGE_PROMPT.md
```

- [ ] **Step 2: Update eval_batch.py to load from archive**

In `backend/app/services/eval_batch.py`, line 35, change:

```python
    path = _PROMPTS_DIR / "EVAL_JUDGE_PROMPT.md"
```

To:

```python
    path = _PROMPTS_DIR / "archive" / "EVAL_JUDGE_PROMPT.md"
```

- [ ] **Step 3: Verify backend starts**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -c "from app.services.eval_batch import _load_judge_prompt; print(len(_load_judge_prompt()), 'chars')"`

Expected: prints char count (around 2000+).

- [ ] **Step 4: Commit**

```bash
git add prompts/EVAL_JUDGE_PROMPT.md prompts/archive/EVAL_JUDGE_PROMPT.md backend/app/services/eval_batch.py
git commit -m "chore: archive EVAL_JUDGE_PROMPT.md, replaced by QUALITY_JUDGE_PROMPT.md"
```

---

### Task 9: End-to-End Smoke Test

**Files:** No new files — manual testing.

- [ ] **Step 1: Start the backend**

```bash
cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

- [ ] **Step 2: Start the frontend**

```bash
cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend
npm run dev
```

- [ ] **Step 3: Create a test project and run through the pipeline**

1. Create a new project in the UI
2. Fill out the brief (all 3 rounds)
3. Approve the brief → Director runs → check that outline appears WITH a QualityScore card above it
4. Approve the outline → Writer runs → check that storyboard appears WITH QualityScore card(s)
5. Expand the QualityScore cards and verify:
   - Composite score shows
   - Watchability score + feedback shows
   - Dimension scores show
   - Detailed feedback expands correctly
   - If a retry happened, attempt count shows correctly

- [ ] **Step 4: Check the pipeline-state API**

```bash
curl -s localhost:8001/api/project/{PROJECT_ID}/pipeline-state | python3 -m json.tool | grep -A 5 "outline_grade"
```

Expected: JSON object with `passed`, `gut`, `dimensions`, `composite_score`, `attempt`, `total_attempts` fields.

- [ ] **Step 5: Verify backend logs show grading activity**

Check the terminal where backend is running. You should see timing for judge calls and any retry attempts.

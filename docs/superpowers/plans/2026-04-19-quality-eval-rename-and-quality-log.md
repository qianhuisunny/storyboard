# Quality Eval Rename + Quality Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify naming (runtime → quality_eval, dev-time → offline_prompt_bench), split eval prompts per stage, merge handoff into storyboard eval, then add a quality_log table for production observability.

**Architecture:** Two phases executed sequentially. Phase 1 is a mechanical rename + prompt restructure across ~20 files (no behavior change except merging handoff_integrity into storyboard eval). Phase 2 adds a new SQLAlchemy model, writer module, emit points in orchestrator/quality_gate/main, and 2 API endpoints.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy async / SQLite, React / TypeScript / Vite

---

## Phase 1: Naming Unification

### Task 1: Rename quality_gate.py internals

**Files:**
- Modify: `backend/app/services/quality_gate.py`

- [ ] **Step 1: Rename GradeResult → QualityEvalResult**

In `quality_gate.py`, rename the dataclass and all internal references:

```python
# Line 54: rename class
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
```

Use replace_all to change every `GradeResult` → `QualityEvalResult` in the file (appears at lines 54, 195, 199, 219, 228, 248).

- [ ] **Step 2: Rename _call_judge → _call_eval and _async_call_judge → _async_call_eval**

```python
# Line 110
def _call_eval(self, user_prompt: str, label: str = "eval") -> dict:
    return llm.chat_json(
        category="storyboard",
        label=f"qg_{label}",
        system_prompt=self.system_prompt,
        user_prompt=user_prompt,
        model=self.model,
        temperature=0.2,
        max_tokens=500,
    )

# Line 121
async def _async_call_eval(self, user_prompt: str, label: str = "eval") -> dict:
    return await asyncio.to_thread(self._call_eval, user_prompt, label)
```

- [ ] **Step 3: Rename _judge_dimension → _eval_dimension**

```python
# Line 155
async def _eval_dimension(
    self,
    stage: str,
    brief: dict,
    output: Any,
    dim_name: str,
    dim_description: str,
    outline: Any = None,
) -> DimensionScore:
```

- [ ] **Step 4: Update all internal call sites**

Replace `self._async_call_judge(` → `self._async_call_eval(` at lines 149, 182.
Replace `self._judge_dimension(` → `self._eval_dimension(` at line 210.

Update the gut_check label:
```python
# Line 149
result = await self._async_call_eval(prompt, label="eval_gut")
```

Update `format_feedback_for_retry` signature:
```python
# Line 228
def format_feedback_for_retry(self, result: QualityEvalResult, attempt: int) -> str:
```

And the variable names inside it: `grade` → `result` (lines 228-240).

Update `run_with_gate` return type and variables:
```python
# Line 242
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

        outline_ref = outline_for_cross_stage if stage == "cross_stage" else None
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
```

- [ ] **Step 5: Verify file is consistent**

Run: `cd backend && python -c "from app.services.quality_gate import QualityGate, QualityEvalResult; print('OK')"`

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/quality_gate.py
git commit -m "refactor: rename GradeResult → QualityEvalResult, judge → eval in quality_gate.py"
```

---

### Task 2: Split eval prompt into per-stage files + merge handoff

**Files:**
- Create: `prompts/OUTLINE_EVAL_PROMPT.md`
- Create: `prompts/STORYBOARD_EVAL_PROMPT.md`
- Move: `prompts/QUALITY_JUDGE_PROMPT.md` → `prompts/archive/QUALITY_JUDGE_PROMPT.md`
- Modify: `backend/app/services/quality_gate.py` (update prompt loading + merge handoff)

- [ ] **Step 1: Create OUTLINE_EVAL_PROMPT.md**

```bash
# Verify prompts/ directory
ls prompts/
```

Create `prompts/OUTLINE_EVAL_PROMPT.md`:

```markdown
# Quality Evaluator — Outline

You are evaluating an AI-generated outline for an educational/knowledge-sharing video. You will be called in one of two modes.

---

## Mode: gut_check

You adopt the persona of the video's target audience. You've just been shown an outline for a video.

Answer these questions as that viewer:
- Would you choose to watch this video over competing content?
- Would you stay through the whole thing, or lose interest partway?

Return ONLY valid JSON:

\`\`\`json
{
  "score": 7,
  "feedback": "2-3 sentences as the viewer — your honest reaction, not a critique."
}
\`\`\`

Score guide:
- 1-3: Would not click. Feels generic, confusing, or irrelevant to me.
- 4-6: Might click but would lose interest. Some parts feel like filler or don't connect.
- 7-8: Would watch and find it useful. Clear value, holds my attention.
- 9-10: Would share with colleagues. Genuinely insightful, couldn't get this elsewhere.

---

## Mode: dimension

You are a senior instructional designer reviewing an AI-generated outline. Evaluate on ONE specific dimension provided in the user prompt.

Return ONLY valid JSON:

\`\`\`json
{
  "score": 7,
  "feedback": "2-3 sentences of direct, specific feedback. Reference section numbers. Write like a design manager giving a note — no tags, no checklists."
}
\`\`\`

Score guide:
- 1-3: Fundamental problems. The dimension is not met at all.
- 4-6: Partial. Some aspects work but significant issues remain.
- 7-8: Solid. Minor issues that don't undermine the whole.
- 9-10: Excellent. Nothing meaningful to improve on this dimension.

---

## Dimensions

1. **flow_coherence** — Does each section prepare the next and create a natural cognitive progression? Look for abrupt jumps, missing bridges between ideas, or circular reasoning.

2. **talking_point_sharpness** — Are the talking points specific, differentiated, and thesis-supporting rather than generic or interchangeable?

3. **evidence_fitness** — Do the proposed evidence directions provide the right kind and strength of support for the claims? Would they actually strengthen the argument?

4. **brief_pov_alignment** — Does the outline clearly serve the brief's intended viewer outcome and defend the intended point of view? Has the AI drifted to a related but different topic?

5. **section_necessity** — Does each section have a distinct teaching job, or is it redundant, mergeable, or disposable? Could any sections be combined without losing value?

---

## Rules

- Only flag issues you are confident about. When in doubt, give benefit of the doubt.
- Be specific in feedback — reference section numbers.
- Do NOT invent issues that don't exist. A score of 8-9 with brief positive feedback is perfectly fine.
- For gut_check mode: react as the audience, not as a professional critic.
- For dimension mode: evaluate standalone quality against the dimension definition. No gold standard comparison.
```

- [ ] **Step 2: Create STORYBOARD_EVAL_PROMPT.md**

Create `prompts/STORYBOARD_EVAL_PROMPT.md`:

```markdown
# Quality Evaluator — Storyboard

You are evaluating an AI-generated storyboard for an educational/knowledge-sharing video. You will be called in one of two modes.

---

## Mode: gut_check

You adopt the persona of the video's target audience. You've just been shown a storyboard for a video.

Answer these questions as that viewer:
- Would you choose to watch this video over competing content?
- Would you stay through the whole thing, or lose interest partway?

Return ONLY valid JSON:

\`\`\`json
{
  "score": 7,
  "feedback": "2-3 sentences as the viewer — your honest reaction, not a critique."
}
\`\`\`

Score guide:
- 1-3: Would not click. Feels generic, confusing, or irrelevant to me.
- 4-6: Might click but would lose interest. Some parts feel like filler or don't connect.
- 7-8: Would watch and find it useful. Clear value, holds my attention.
- 9-10: Would share with colleagues. Genuinely insightful, couldn't get this elsewhere.

---

## Mode: dimension

You are a senior instructional designer reviewing an AI-generated storyboard. Evaluate on ONE specific dimension provided in the user prompt.

Return ONLY valid JSON:

\`\`\`json
{
  "score": 7,
  "feedback": "2-3 sentences of direct, specific feedback. Reference screen numbers. Write like a design manager giving a note — no tags, no checklists."
}
\`\`\`

Score guide:
- 1-3: Fundamental problems. The dimension is not met at all.
- 4-6: Partial. Some aspects work but significant issues remain.
- 7-8: Solid. Minor issues that don't undermine the whole.
- 9-10: Excellent. Nothing meaningful to improve on this dimension.

---

## Dimensions

1. **instructional_progression** — Do the screens build understanding step by step, or merely place information in sequence? Is there a clear learning arc?

2. **context_rot** — Does the storyboard preserve the specificity and intent of the outline, or drift into empty significance? Sentences that sound meaningful but convey no substance.

3. **specificity_retention** — Does the writing preserve concrete, topic-specific substance, or flatten into generic language? Did specific examples, numbers, or references get replaced with vague generalities?

4. **source_fidelity** — Does the storyboard stay within the supported claims and evidence, without invention or overreach? Did the AI fabricate facts, statistics, quotes, or claims?

5. **redundancy** — Do screens add distinct instructional value, or repeat the same point in different words across screens?

6. **handoff_integrity** — Does the storyboard faithfully realize the outline's intended teaching job, section thesis, and required content, without drift, omission, or simplification into weaker material? (Requires the outline in the evaluation context.)

---

## Rules

- Only flag issues you are confident about. When in doubt, give benefit of the doubt.
- Be specific in feedback — reference screen numbers.
- Do NOT invent issues that don't exist. A score of 8-9 with brief positive feedback is perfectly fine.
- For gut_check mode: react as the audience, not as a professional critic.
- For dimension mode: evaluate standalone quality against the dimension definition. No gold standard comparison.
- For handoff_integrity: you will receive both the outline and the storyboard. Compare them directly.
```

- [ ] **Step 3: Archive old prompt**

```bash
mv prompts/QUALITY_JUDGE_PROMPT.md prompts/archive/QUALITY_JUDGE_PROMPT.md
```

- [ ] **Step 4: Update quality_gate.py — per-stage prompt loading + merge handoff**

Replace the single `_load_prompt` and dimension constants with per-stage approach:

```python
# Replace lines 11-37 (PROMPTS_DIR through STAGE_DIMENSIONS) with:

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
    ("handoff_integrity", "Does the storyboard faithfully realize the outline's intended teaching job, section thesis, and required content, without drift, omission, or simplification into weaker material?"),
]

STAGE_DIMENSIONS = {
    "outline": OUTLINE_DIMENSIONS,
    "storyboard": STORYBOARD_DIMENSIONS,
}

STAGE_PROMPTS = {
    "outline": "OUTLINE_EVAL_PROMPT.md",
    "storyboard": "STORYBOARD_EVAL_PROMPT.md",
}
```

Replace `_load_prompt` and `__init__`:

```python
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
```

Update `_call_eval` to accept stage:

```python
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
```

Update `_gut_check` — remove cross_stage branching, pass stage through:

```python
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
```

Update `_eval_dimension` — same pattern, remove cross_stage branching:

```python
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
```

Update `evaluate` — storyboard always gets outline:

```python
async def evaluate(
    self,
    stage: str,
    brief: dict,
    output: Any,
    outline: Any = None,
) -> QualityEvalResult:
    gut = await self._gut_check(stage, brief, output, outline=outline)

    if gut.score < self.threshold:
        return QualityEvalResult(
            passed=False,
            gut=gut,
            dimensions=None,
            composite_score=gut.score,
            attempt=0,
            total_attempts=0,
        )

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

    return QualityEvalResult(
        passed=composite >= self.threshold,
        gut=gut,
        dimensions=dim_scores,
        composite_score=round(composite, 1),
        attempt=0,
        total_attempts=0,
    )
```

- [ ] **Step 5: Verify prompt loading works**

Run: `cd backend && python -c "from app.services.quality_gate import QualityGate; qg = QualityGate(); print('outline:', len(qg._get_prompt('outline')), 'chars'); print('storyboard:', len(qg._get_prompt('storyboard')), 'chars')"`

Expected: two non-zero char counts.

- [ ] **Step 6: Commit**

```bash
git add prompts/OUTLINE_EVAL_PROMPT.md prompts/STORYBOARD_EVAL_PROMPT.md prompts/archive/QUALITY_JUDGE_PROMPT.md backend/app/services/quality_gate.py
git commit -m "refactor: split eval prompt per stage, merge handoff_integrity into storyboard eval"
```

---

### Task 3: Rename state.py + orchestrator.py (grade → eval, delete cross_stage)

**Files:**
- Modify: `backend/app/services/state.py`
- Modify: `backend/app/services/orchestrator.py`

- [ ] **Step 1: Rename state.py fields**

In `state.py` lines 58-61, replace:

```python
    # Quality gate grades (auto-grader results)
    outline_grade: Optional[dict] = None
    storyboard_grade: Optional[dict] = None
    cross_stage_grade: Optional[dict] = None
```

with:

```python
    # Quality eval results (auto-grader)
    outline_eval: Optional[dict] = None
    storyboard_eval: Optional[dict] = None
```

- [ ] **Step 2: Update orchestrator.py — replace all grade refs + delete cross_stage eval**

Use replace_all for these renames across `orchestrator.py`:

- `outline_grade` → `outline_eval` (all occurrences: lines 206, 212, 218, 498, 770, 776, 783, 845, 851, 858)
- `storyboard_grade` → `storyboard_eval` (all occurrences: lines 264, 270, 288, 499)
- `cross_stage_grade` → delete (see next step)

Delete the cross-stage evaluation block in `_handle_gate2_approve` (lines 273-281):

```python
        # DELETE these lines:
        # Cross-stage check
        cross_grade = await self.quality_gate.evaluate(
            stage="cross_stage",
            brief=state.story_brief or {},
            output=storyboard,
            outline=state.screen_outline,
        )
        cross_grade.attempt = 1
        cross_grade.total_attempts = 1
        state.cross_stage_grade = cross_grade.to_dict()
```

Instead, pass outline to the storyboard quality gate so handoff_integrity runs as dimension #6. Update the `run_with_gate` call at line 264:

```python
        storyboard, storyboard_eval = await self.quality_gate.run_with_gate(
            agent=self.agents["writer"],
            state=state,
            stage="storyboard",
            outline_for_cross_stage=state.screen_outline,
        )
        state.storyboard = storyboard
        state.storyboard_eval = storyboard_eval.to_dict()
```

Delete `cross_stage_grade` from the result dict (line 289):
```python
        # DELETE: result["cross_stage_grade"] = state.cross_stage_grade
```

Update the `get_pipeline_data` method (lines 498-500):

```python
            "outline_eval": state.outline_eval,
            "storyboard_eval": state.storyboard_eval,
```

Remove `"cross_stage_grade"` from the dict.

- [ ] **Step 3: Update run_with_gate to pass outline for storyboard eval**

In `quality_gate.py`, update `run_with_gate` so it passes outline when stage is storyboard:

```python
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
```

- [ ] **Step 4: Verify imports work**

Run: `cd backend && python -c "from app.services.orchestrator import Orchestrator; print('OK')"`

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/state.py backend/app/services/orchestrator.py backend/app/services/quality_gate.py
git commit -m "refactor: grade → eval in state/orchestrator, delete cross_stage_grade, pass outline to storyboard eval"
```

---

### Task 4: Rename main.py + llm_config.json

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/config/llm_config.json`

- [ ] **Step 1: Rename grade refs in main.py**

At lines 881-883, replace:

```python
                "outline_grade": state.outline_grade,
                "storyboard_grade": state.storyboard_grade,
                "cross_stage_grade": state.cross_stage_grade,
```

with:

```python
                "outline_eval": state.outline_eval,
                "storyboard_eval": state.storyboard_eval,
```

- [ ] **Step 2: Rename llm_config.json route key**

In `backend/config/llm_config.json`, line 8:

Replace `"storyboard.qg_gut_check"` with `"storyboard.qg_eval_gut"`.

Also rename `"eval.judge"` (line 20) to `"offline_bench.judge"`.

- [ ] **Step 3: Verify backend starts**

Run: `cd backend && source venv/bin/activate && timeout 5 python -c "from app.main import app; print('OK')" 2>&1 | head -5`

Expected: `OK` (or import chain completes without error)

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py backend/config/llm_config.json
git commit -m "refactor: grade → eval in main.py, update llm_config route keys"
```

---

### Task 5: Rename frontend — QualityScore + StageContent + types

**Files:**
- Modify: `frontend/src/components/QualityScore.tsx`
- Modify: `frontend/src/components/StageContent.tsx`
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`
- Modify: `frontend/src/components/OutlineBuilder/types.ts`
- Modify: `frontend/src/components/DraftBuilder/DraftBuilder.tsx`
- Modify: `frontend/src/components/DraftBuilder/UserView/UserView.tsx`
- Modify: `frontend/src/components/DraftBuilder/types.ts`

- [ ] **Step 1: Rename QualityScore.tsx**

Replace `GradeResult` → `QualityEvalResult` (lines 16, 45):

```typescript
export interface QualityEvalResult {
  passed: boolean;
  gut: GutScore;
  dimensions: DimensionScore[] | null;
  composite_score: number;
  attempt: number;
  total_attempts: number;
}
```

```typescript
export function QualityScore({ eval: evalResult }: { eval: QualityEvalResult }) {
```

Replace all `grade.` → `evalResult.` inside the component (lines 57-58, 61, 63, 81-82, 86, 90, 92, 103, 109).

- [ ] **Step 2: Rename StageContent.tsx**

Replace all occurrences:
- `GradeResult` → `QualityEvalResult` (import at line 14)
- `outlineGrade` → `outlineEval` (lines 548, 466, 576, 982)
- `storyboardGrade` → `storyboardEval` (lines 549, 577, 779, 810, 1000)
- `crossStageGrade` → delete entirely (lines 550, 578, 780, 811, 1001)
- `setOutlineGrade` → `setOutlineEval`
- `setStoryboardGrade` → `setStoryboardEval`
- `setCrossStageGrade` → delete
- `outline_grade` (API field name) → `outline_eval` (lines 466, 576)
- `storyboard_grade` → `storyboard_eval` (lines 577, 779, 810)
- `cross_stage_grade` → delete (lines 578, 780, 811)

Update prop passing:
- `outlineGrade={outlineGrade}` → `outlineEval={outlineEval}` (line 982)
- `storyboardGrade={storyboardGrade}` → `storyboardEval={storyboardEval}` (line 1000)
- `crossStageGrade={crossStageGrade}` → delete (line 1001)

- [ ] **Step 3: Rename OutlineBuilder types + component**

In `frontend/src/components/OutlineBuilder/types.ts` line 64:
```typescript
  outlineEval?: import("../QualityScore").QualityEvalResult | null;
```

In `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`:
- Line 41: `outlineEval = null,`
- Line 263: `{outlineEval && <QualityScore eval={outlineEval} />}`

- [ ] **Step 4: Rename DraftBuilder types + components**

In `frontend/src/components/DraftBuilder/types.ts`:

Lines 75-76 and 92-93 — in both `DraftBuilderProps` and `UserViewProps`:
```typescript
  storyboardEval?: import("../QualityScore").QualityEvalResult | null;
```

Delete `crossStageGrade` / `crossStageEval` lines entirely from both interfaces.

In `frontend/src/components/DraftBuilder/DraftBuilder.tsx`:
- Line 14: `storyboardEval,`
- Delete line 15 (`crossStageGrade`)
- Line 25: `storyboardEval={storyboardEval}`
- Delete line 26 (`crossStageGrade`)

In `frontend/src/components/DraftBuilder/UserView/UserView.tsx`:
- Line 19: `storyboardEval,`
- Line 157: `{storyboardEval && <QualityScore eval={storyboardEval} />}`

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -20`

Expected: Build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/QualityScore.tsx frontend/src/components/StageContent.tsx frontend/src/components/OutlineBuilder/ frontend/src/components/DraftBuilder/
git commit -m "refactor: GradeResult → QualityEvalResult, grade → eval across frontend"
```

---

### Task 6: Rename dev-time eval → offline_prompt_bench

**Files:**
- Rename: `backend/app/services/eval_batch.py` → `backend/app/services/offline_prompt_bench.py`
- Rename: `backend/app/services/eval_gold_set.py` → `backend/app/services/offline_prompt_bench_gold.py`
- Rename: `backend/app/test/test_eval_batch.py` → `backend/app/test/test_offline_prompt_bench.py`
- Rename: `backend/app/test/test_eval_ingestion.py` → `backend/app/test/test_offline_prompt_bench_ingestion.py`
- Rename: `prompts/archive/EVAL_JUDGE_PROMPT.md` → `prompts/archive/OFFLINE_BENCH_JUDGE.md`
- Rename: `frontend/src/components/admin/eval-components.tsx` → `frontend/src/components/admin/bench-components.tsx`
- Rename: `frontend/src/components/admin/GoldSetEval.tsx` → `frontend/src/components/admin/GoldSetBench.tsx`
- Modify: `frontend/src/components/admin/BatchDiffs.tsx` (internal var rename)
- Modify: `backend/app/main.py` (update imports + endpoint paths)
- Modify: `frontend/src/App.tsx` (update imports + routes)

- [ ] **Step 1: Rename backend files**

```bash
cd backend/app/services
git mv eval_batch.py offline_prompt_bench.py
git mv eval_gold_set.py offline_prompt_bench_gold.py
cd ../test
git mv test_eval_batch.py test_offline_prompt_bench.py
git mv test_eval_ingestion.py test_offline_prompt_bench_ingestion.py
```

- [ ] **Step 2: Update imports inside renamed files**

In `offline_prompt_bench.py`, line 13-20 — update the import:

```python
from app.services.offline_prompt_bench_gold import (
    GOLD_SETS_DIR,
    get_current_prompt_versions,
    gold_outline_to_director_text,
    list_gold_sets,
    load_gold_set,
    run_eval,
    get_cached_eval,
    _save_cache,
)
```

In `test_offline_prompt_bench.py`, update imports:
```python
from app.services.offline_prompt_bench import _parse_duration_midpoint
# and
from app.services.offline_prompt_bench import compute_batch_report, GOLD_SETS_DIR
from app.services import offline_prompt_bench_gold
import app.services.offline_prompt_bench as opb
```

In `test_offline_prompt_bench_ingestion.py`, update imports:
```python
from app.services.offline_prompt_bench_gold import _strip_sponsor_sections
# etc.
```

- [ ] **Step 3: Update main.py imports + endpoint paths**

In `backend/app/main.py`, update all eval imports (lines 2026, 2043, 2078, 2148, 2160, 2185, 2192):

Replace `from app.services.eval_gold_set import` → `from app.services.offline_prompt_bench_gold import`
Replace `from app.services.eval_batch import` → `from app.services.offline_prompt_bench import`

Rename endpoint paths:
- `"/api/eval/gold-sets"` → `"/api/offline-prompt-bench/gold-sets"`
- `"/api/eval/models"` → `"/api/offline-prompt-bench/models"`
- `"/api/eval/gold-set/{name}"` → `"/api/offline-prompt-bench/gold-set/{name}"`
- `"/api/eval/gold-set/{name}/status"` → `"/api/offline-prompt-bench/gold-set/{name}/status"`
- `"/api/eval/gold-set/ingest"` → `"/api/offline-prompt-bench/gold-set/ingest"`
- `"/api/eval/batch"` → `"/api/offline-prompt-bench/batch"`
- `"/api/eval/batch/status"` → `"/api/offline-prompt-bench/batch/status"`
- `"/api/eval/batch/report"` → `"/api/offline-prompt-bench/batch/report"`

- [ ] **Step 4: Rename frontend files + update imports**

```bash
cd frontend/src/components/admin
git mv eval-components.tsx bench-components.tsx
git mv GoldSetEval.tsx GoldSetBench.tsx
```

In `BatchDiffs.tsx` line 11: update import path:
```typescript
} from "./bench-components";
```

In `BatchDiffs.tsx`, rename internal `judge` variable → `benchResult` (lines 40, 46-49, 72, 77).

In `GoldSetBench.tsx` line 15: update import path:
```typescript
} from "./bench-components";
```

In `GoldSetBench.tsx` line 57: rename export:
```typescript
export default function GoldSetBench() {
```

In `App.tsx` lines 19-20: update imports:
```typescript
import GoldSetBench from "@/components/admin/GoldSetBench";
import BatchDiffs from "@/components/admin/BatchDiffs";
```

In `App.tsx` lines 111-112: update routes:
```tsx
<Route path="/admin/prompt-bench" element={<GoldSetBench />} />
<Route path="/admin/prompt-bench/diffs" element={<BatchDiffs />} />
```

Update API URLs in `GoldSetBench.tsx` and `BatchDiffs.tsx`: replace `/api/eval/` → `/api/offline-prompt-bench/`.

- [ ] **Step 5: Rename prompt file**

```bash
git mv prompts/archive/EVAL_JUDGE_PROMPT.md prompts/archive/OFFLINE_BENCH_JUDGE.md
```

Update the reference in `offline_prompt_bench.py` line 35:
```python
def _load_judge_prompt() -> str:
    path = _PROMPTS_DIR / "archive" / "OFFLINE_BENCH_JUDGE.md"
    return path.read_text()
```

- [ ] **Step 6: Verify backend + frontend**

```bash
cd backend && python -c "from app.services.offline_prompt_bench import get_batch_status; print('OK')"
cd frontend && npm run build 2>&1 | tail -5
```

Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename eval framework → offline_prompt_bench across backend + frontend"
```

---

## Phase 2: quality_log Table

### Task 7: Add QualityLog SQLAlchemy model

**Files:**
- Modify: `backend/app/db/models.py` (add QualityLog model)

- [ ] **Step 1: Add the QualityLog model**

Add to end of `backend/app/db/models.py`:

```python
class QualityLog(Base):
    __tablename__ = "quality_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Text, nullable=False, index=True)
    event = Column(Text, nullable=False, index=True)
    stage = Column(Text, nullable=False)
    scope = Column(Text, nullable=True)
    attempt = Column(Integer, nullable=True)
    model = Column(Text, nullable=True)
    prompt_ref = Column(Text, nullable=True)
    context = Column(Text, nullable=True)
    raw_response = Column(Text, nullable=True)
    parsed_output = Column(Text, nullable=True)
    scores = Column(Text, nullable=True)
    instruction = Column(Text, nullable=True)
    before_content = Column(Text, nullable=True)
    after_content = Column(Text, nullable=True)
    parent_id = Column(Integer, ForeignKey("quality_log.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 2: Verify model loads**

Run: `cd backend && python -c "from app.db.models import QualityLog; print('table:', QualityLog.__tablename__)"`

Expected: `table: quality_log`

- [ ] **Step 3: Commit**

```bash
git add backend/app/db/models.py
git commit -m "feat: add QualityLog SQLAlchemy model"
```

---

### Task 8: Create quality_log writer module

**Files:**
- Create: `backend/app/infra/quality_log.py`

- [ ] **Step 1: Write the quality_log writer**

Create `backend/app/infra/quality_log.py`:

```python
"""
Quality Log — write-only module for production quality observability.

Logs 4 event types: generate, eval, override, approve.
Each log_* method returns the row ID for parent_id chaining.
"""

import json
import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent.parent.parent / "data" / "plotline.db"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS quality_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT NOT NULL,
    event           TEXT NOT NULL,
    stage           TEXT NOT NULL,
    scope           TEXT,
    attempt         INTEGER,
    model           TEXT,
    prompt_ref      TEXT,
    context         TEXT,
    raw_response    TEXT,
    parsed_output   TEXT,
    scores          TEXT,
    instruction     TEXT,
    before_content  TEXT,
    after_content   TEXT,
    parent_id       INTEGER REFERENCES quality_log(id),
    created_at      REAL NOT NULL DEFAULT (unixepoch('subsec'))
);
"""

_CREATE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_qlog_project ON quality_log(project_id);",
    "CREATE INDEX IF NOT EXISTS ix_qlog_event ON quality_log(event);",
]


class QualityLog:
    def __init__(self, db_path: Path = _DB_PATH):
        self._db_path = db_path
        self._ensure_table()

    def _ensure_table(self):
        conn = sqlite3.connect(self._db_path)
        try:
            conn.execute(_CREATE_TABLE)
            for idx in _CREATE_INDEXES:
                conn.execute(idx)
            conn.commit()
        finally:
            conn.close()

    def _insert(self, **fields) -> int:
        cols = list(fields.keys())
        placeholders = ", ".join(["?"] * len(cols))
        col_names = ", ".join(cols)
        values = [
            json.dumps(v) if isinstance(v, (dict, list)) else v
            for v in fields.values()
        ]
        conn = sqlite3.connect(self._db_path)
        try:
            cursor = conn.execute(
                f"INSERT INTO quality_log ({col_names}) VALUES ({placeholders})",
                values,
            )
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def log_generate(
        self,
        project_id: str,
        stage: str,
        scope: str,
        attempt: int,
        model: str,
        prompt_ref: str,
        context: str,
        raw_response: str,
        parsed_output=None,
        parent_id: int = None,
    ) -> int:
        return self._insert(
            project_id=project_id,
            event="generate",
            stage=stage,
            scope=scope,
            attempt=attempt,
            model=model,
            prompt_ref=prompt_ref,
            context=context,
            raw_response=raw_response,
            parsed_output=parsed_output,
            parent_id=parent_id,
        )

    def log_eval(
        self,
        project_id: str,
        stage: str,
        scope: str,
        model: str,
        prompt_ref: str,
        context: str,
        raw_response: str,
        scores=None,
        parent_id: int = None,
    ) -> int:
        return self._insert(
            project_id=project_id,
            event="eval",
            stage=stage,
            scope=scope,
            model=model,
            prompt_ref=prompt_ref,
            context=context,
            raw_response=raw_response,
            scores=scores,
            parent_id=parent_id,
        )

    def log_override(
        self,
        project_id: str,
        stage: str,
        scope: str,
        instruction: str = None,
        before_content: str = None,
        after_content: str = None,
        parent_id: int = None,
    ) -> int:
        return self._insert(
            project_id=project_id,
            event="override",
            stage=stage,
            scope=scope,
            instruction=instruction,
            before_content=before_content,
            after_content=after_content,
            parent_id=parent_id,
        )

    def log_approve(
        self,
        project_id: str,
        stage: str,
        scope: str = "full",
        parent_id: int = None,
    ) -> int:
        return self._insert(
            project_id=project_id,
            event="approve",
            stage=stage,
            scope=scope,
            parent_id=parent_id,
        )


# Singleton
qlog = QualityLog()
```

- [ ] **Step 2: Verify writer works**

Run: `cd backend && python -c "from app.infra.quality_log import qlog; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/infra/quality_log.py
git commit -m "feat: add quality_log writer module with 4 event methods"
```

---

### Task 9: Write tests for quality_log writer

**Files:**
- Create: `backend/app/test/test_quality_log.py`

- [ ] **Step 1: Write the tests**

Create `backend/app/test/test_quality_log.py`:

```python
import json
import sqlite3
import tempfile
from pathlib import Path

import pytest

from app.infra.quality_log import QualityLog


@pytest.fixture
def qlog(tmp_path):
    db_path = tmp_path / "test.db"
    return QualityLog(db_path=db_path)


def _query(qlog, sql, params=()):
    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def test_log_generate_returns_id(qlog):
    row_id = qlog.log_generate(
        project_id="p1",
        stage="outline",
        scope="full",
        attempt=1,
        model="gpt-4o",
        prompt_ref="storyboard_director_prompt_v0324",
        context="brief fields here",
        raw_response="outline text",
        parsed_output={"sections": []},
    )
    assert row_id == 1
    rows = _query(qlog, "SELECT * FROM quality_log WHERE id = ?", (row_id,))
    assert len(rows) == 1
    assert rows[0]["event"] == "generate"
    assert rows[0]["attempt"] == 1
    assert json.loads(rows[0]["parsed_output"]) == {"sections": []}


def test_log_eval_with_scores(qlog):
    gen_id = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="ref", context="ctx", raw_response="resp",
    )
    eval_id = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT",
        context="brief + outline", raw_response="judge response",
        scores={"composite": 7.8, "gut": {"score": 8.0}},
        parent_id=gen_id,
    )
    assert eval_id == 2
    rows = _query(qlog, "SELECT * FROM quality_log WHERE id = ?", (eval_id,))
    assert rows[0]["parent_id"] == gen_id
    assert json.loads(rows[0]["scores"])["composite"] == 7.8


def test_log_override(qlog):
    row_id = qlog.log_override(
        project_id="p1", stage="outline", scope="section:3",
        instruction="argument too weak",
        before_content="old text", after_content="new text",
    )
    rows = _query(qlog, "SELECT * FROM quality_log WHERE id = ?", (row_id,))
    assert rows[0]["event"] == "override"
    assert rows[0]["before_content"] == "old text"
    assert rows[0]["model"] is None


def test_log_approve(qlog):
    row_id = qlog.log_approve(project_id="p1", stage="outline")
    rows = _query(qlog, "SELECT * FROM quality_log WHERE id = ?", (row_id,))
    assert rows[0]["event"] == "approve"
    assert rows[0]["scope"] == "full"


def test_causal_chain(qlog):
    g1 = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="ref", context="ctx", raw_response="v1",
    )
    e1 = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="ref", context="ctx", raw_response="resp",
        scores={"composite": 6.2}, parent_id=g1,
    )
    g2 = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="ref", context="ctx + feedback",
        raw_response="v2", parent_id=e1,
    )
    e2 = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="ref", context="ctx", raw_response="resp",
        scores={"composite": 7.8}, parent_id=g2,
    )
    chain = _query(qlog, "SELECT id, event, parent_id FROM quality_log WHERE project_id = ? ORDER BY id", ("p1",))
    assert len(chain) == 4
    assert chain[0]["parent_id"] is None
    assert chain[1]["parent_id"] == g1
    assert chain[2]["parent_id"] == e1
    assert chain[3]["parent_id"] == g2
```

- [ ] **Step 2: Run tests**

Run: `cd backend && python -m pytest app/test/test_quality_log.py -v`

Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/app/test/test_quality_log.py
git commit -m "test: add quality_log writer tests with causal chain verification"
```

---

### Task 10: Add quality_log API endpoints

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add the two API endpoints**

Add to `backend/app/main.py` (after the existing endpoints, before the offline-prompt-bench section):

```python
# ---------------------------------------------------------------------------
# Quality Log API
# ---------------------------------------------------------------------------

@app.get("/api/quality-log/{project_id}")
async def get_quality_log(project_id: str):
    """Get the full causal chain for a project."""
    import sqlite3
    from app.infra.quality_log import qlog

    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM quality_log WHERE project_id = ? ORDER BY id",
        (project_id,),
    ).fetchall()
    conn.close()

    entries = []
    for r in rows:
        entry = dict(r)
        for json_field in ("parsed_output", "scores"):
            if entry.get(json_field):
                try:
                    entry[json_field] = json.loads(entry[json_field])
                except (json.JSONDecodeError, TypeError):
                    pass
        entries.append(entry)

    return {"project_id": project_id, "entries": entries}


@app.get("/api/quality-log/stats/overrides")
async def get_override_stats():
    """Get override hotspots: stage x scope x count."""
    import sqlite3
    from app.infra.quality_log import qlog

    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT stage, scope, COUNT(*) as count "
        "FROM quality_log WHERE event = 'override' "
        "GROUP BY stage, scope ORDER BY count DESC",
    ).fetchall()
    conn.close()

    return {"overrides": [dict(r) for r in rows]}
```

- [ ] **Step 2: Verify endpoints load**

Run: `cd backend && python -c "from app.main import app; routes = [r.path for r in app.routes]; assert '/api/quality-log/{project_id}' in routes; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: add quality-log API endpoints (project chain + override stats)"
```

---

### Task 11: Wire emit points — orchestrator.py (generate events)

**Files:**
- Modify: `backend/app/services/orchestrator.py`

- [ ] **Step 1: Add generate event logging to gate1 approve handler**

In the `_handle_gate1_approve` method (and both brief_approve handlers), after the quality gate runs, add logging. Find the pattern (appears 3 times — lines ~206, ~770, ~845):

```python
        screen_outline, outline_eval = await self.quality_gate.run_with_gate(
            agent=self.agents["director"],
            state=state,
            stage="outline",
        )
        state.screen_outline = screen_outline
        state.outline_eval = outline_eval.to_dict()
```

After each of these blocks, add:

```python
        from app.infra.quality_log import qlog
        qlog.log_generate(
            project_id=state.project_id,
            stage="outline",
            scope="full",
            attempt=outline_eval.attempt,
            model=self.quality_gate.model,
            prompt_ref=self.agents["director"].prompt_file,
            context=str(state.story_brief),
            raw_response=str(screen_outline),
            parsed_output=screen_outline if isinstance(screen_outline, (dict, list)) else None,
        )
```

- [ ] **Step 2: Add generate event logging to gate2 approve handler**

In `_handle_gate2_approve`, after the writer quality gate runs (~line 264):

```python
        storyboard, storyboard_eval = await self.quality_gate.run_with_gate(
            agent=self.agents["writer"],
            state=state,
            stage="storyboard",
            outline_for_cross_stage=state.screen_outline,
        )
```

After this block, add:

```python
        from app.infra.quality_log import qlog
        qlog.log_generate(
            project_id=state.project_id,
            stage="storyboard",
            scope="full",
            attempt=storyboard_eval.attempt,
            model=self.quality_gate.model,
            prompt_ref=self.agents["writer"].prompt_file,
            context=f"brief: {state.story_brief}\noutline: {state.screen_outline}",
            raw_response=str(storyboard),
            parsed_output=storyboard if isinstance(storyboard, (dict, list)) else None,
        )
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/orchestrator.py
git commit -m "feat: emit quality_log generate events from orchestrator"
```

---

### Task 12: Wire emit points — quality_gate.py (eval events)

**Files:**
- Modify: `backend/app/services/quality_gate.py`

- [ ] **Step 1: Add eval event logging after evaluate()**

In the `evaluate` method, before the final return, log the eval event:

```python
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/quality_gate.py
git commit -m "feat: emit quality_log eval events from quality_gate"
```

---

### Task 13: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest app/test/ -v 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Start backend and verify health**

```bash
cd backend && source venv/bin/activate && timeout 10 uvicorn app.main:app --port 8001 &
sleep 3
curl -s localhost:8001/health
curl -s localhost:8001/api/quality-log/test-project | python3 -m json.tool
kill %1
```

Expected: health OK, quality-log returns `{"project_id": "test-project", "entries": []}`.

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
# If clean, no commit needed
```

# Batch Gold Set Evaluation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add batch evaluation, LLM-as-judge quality assessment, gold set ingestion, and aggregate reporting to the existing single-video eval system.

**Architecture:** Extends `eval_gold_set.py` with ingestion, LLM judge, and batch runner. New batch API endpoints follow the existing background-job + polling pattern. Frontend adds tabs (Single/Batch) to the eval page and a separate Batch Diffs page for per-project deep dive.

**Tech Stack:** FastAPI (backend), React + Tailwind + shadcn/ui (frontend), OpenAI GPT-4o (LLM judge), existing agent pipeline.

**Spec:** `docs/superpowers/specs/2026-03-10-batch-gold-set-eval-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `backend/app/services/eval_gold_set.py` | Gold set loading, eval runner, analysis, cache | Modify: add `ingest_gold_set()`, `auto_compute_meta()`, cache invalidation (`force` param, prompt version tracking) |
| `backend/app/services/eval_batch.py` | Batch runner, batch report, LLM judge | Create: `run_batch_eval()`, `compute_batch_report()`, `run_llm_judge_outline()`, `run_llm_judge_storyboard()` |
| `backend/app/main.py` | API endpoints | Modify: add `/api/eval/gold-set/ingest`, `/api/eval/batch`, `/api/eval/batch/status`, `/api/eval/batch/report` |
| `prompts/EVAL_JUDGE_PROMPT.md` | LLM-as-judge system prompt | Create |
| `backend/app/test/test_eval_ingestion.py` | Tests for ingestion + meta + cache | Create |
| `backend/app/test/test_eval_batch.py` | Tests for batch report aggregation | Create |
| `frontend/src/components/admin/GoldSetEval.tsx` | Eval page with Single/Batch tabs | Modify: add tabs, gold set dropdown, batch tab UI |
| `frontend/src/components/admin/BatchDiffs.tsx` | Per-project foldable diffs page | Create |
| `frontend/src/components/admin/eval-components.ts` | Shared types + subcomponents extracted from GoldSetEval | Create |
| `frontend/src/App.tsx` | Routing | Modify: add `/admin/gold-set-eval/diffs` route |

---

## Chunk 1: Backend — Ingestion & Cache Invalidation

### Task 1: Cache invalidation — store prompt versions in cached eval

**Files:**
- Modify: `backend/app/services/eval_gold_set.py`

- [ ] **Step 1: Add `get_current_prompt_versions()` helper**

After line 36 (after FILLER_PHRASES), add:

```python
def get_current_prompt_versions() -> dict:
    """Return current prompt filenames used by Director and Writer."""
    from app.services.agents.storyboard_director import StoryboardDirector
    from app.services.agents.storyboard_writer import StoryboardWriter
    return {
        "director": StoryboardDirector.prompt_file,
        "writer": StoryboardWriter.prompt_file,
    }
```

- [ ] **Step 2: Update `run_eval()` — add `force` param and store prompt versions**

Change signature from `def run_eval(name: str) -> dict:` to:

```python
def run_eval(name: str, force: bool = False) -> dict:
    """Run full gold set evaluation: Director + Writer (both paths).

    If force=False, returns cached result if cache exists and prompt
    versions match current prompts. Otherwise re-runs.
    """
    prompt_versions = get_current_prompt_versions()

    # Check cache validity
    if not force:
        cached = get_cached_eval(name)
        if cached and cached.get("prompt_versions") == prompt_versions:
            return cached

    gold = load_gold_set(name)
    story_brief = brief_to_story_brief(gold["brief"])
    gold_outline_text = gold_outline_to_director_text(gold["outline"])

    director_output = _run_director(story_brief)
    writer_output_b = _run_writer(gold_outline_text, story_brief)
    writer_output_a = _run_writer(director_output, story_brief)

    analysis = compute_analysis(gold, director_output, writer_output_b, writer_output_a)

    result = {
        "gold_set_name": name,
        "timestamp": datetime.now().isoformat(),
        "prompt_versions": prompt_versions,
        "gold": gold,
        "director_output": director_output,
        "writer_output_path_b": writer_output_b,
        "writer_output_path_a": writer_output_a,
        "analysis": analysis,
    }

    _save_cache(name, result)
    return result
```

- [ ] **Step 3: Update existing single-eval endpoint to preserve always-re-run behavior**

The existing `POST /api/eval/gold-set/{name}` endpoint always re-runs. With the new cache-aware `run_eval()`, it would silently return cached results. Update the endpoint in `main.py` to pass `force=True`:

In the `_run` closure inside `run_gold_set_eval()`, change:
```python
result = eval_gold_set.run_eval(name)
```
to:
```python
result = eval_gold_set.run_eval(name, force=True)
```

This preserves existing behavior: clicking "Run Eval" on the Single tab always re-runs.

- [ ] **Step 4: Verify backend still starts**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -c "from app.services.eval_gold_set import run_eval, get_current_prompt_versions; print(get_current_prompt_versions())"`

Expected: prints `{'director': 'storyboard_director_prompt_v0309.md', 'writer': 'storyboard_writer_prompt_v0309.md'}`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/eval_gold_set.py backend/app/main.py
git commit -m "feat(eval): add cache invalidation with prompt version tracking"
```

---

### Task 2: Ingestion helpers

**Files:**
- Modify: `backend/app/services/eval_gold_set.py`
- Create: `backend/app/test/test_eval_ingestion.py`

- [ ] **Step 1: Write tests for ingestion helpers**

```python
# backend/app/test/test_eval_ingestion.py
"""Tests for gold set ingestion helpers."""
import pytest


def test_strip_sponsor_sections():
    from app.services.eval_gold_set import _strip_sponsor_sections

    outline = [
        {"section_number": 1, "purpose": "Introduce topic", "duration_sec": 60},
        {"section_number": 2, "purpose": "Main content", "duration_sec": 120},
        {"section_number": 3, "purpose": "Sponsor integration and pitch", "duration_sec": 45},
        {"section_number": 4, "purpose": "Conclusion", "duration_sec": 30},
    ]
    storyboard = [
        {"screen_number": 1, "section_number": 1, "voiceover_text": "hello"},
        {"screen_number": 2, "section_number": 2, "voiceover_text": "content"},
        {"screen_number": 3, "section_number": 3, "voiceover_text": "sponsor"},
        {"screen_number": 4, "section_number": 4, "voiceover_text": "bye"},
    ]
    new_outline, new_sb = _strip_sponsor_sections(outline, storyboard)
    assert len(new_outline) == 3
    assert all(s["purpose"] != "Sponsor integration and pitch" for s in new_outline)
    assert len(new_sb) == 3
    # Check renumbered
    assert [s["section_number"] for s in new_outline] == [1, 2, 3]
    assert [s["screen_number"] for s in new_sb] == [1, 2, 3]


def test_strip_sponsor_cta_keywords():
    from app.services.eval_gold_set import _strip_sponsor_sections

    cases = [
        {"section_number": 1, "purpose": "CTA and call to action", "duration_sec": 20},
        {"section_number": 2, "purpose": "Ad placement for NordVPN", "duration_sec": 30},
        {"section_number": 3, "purpose": "Real content here", "duration_sec": 60},
    ]
    result, _ = _strip_sponsor_sections(cases, [])
    assert len(result) == 1
    assert result[0]["purpose"] == "Real content here"


def test_auto_compute_meta_short_linear_story():
    from app.services.eval_gold_set import auto_compute_meta

    outline = [
        {
            "section_number": 1,
            "section_title": "The Max Planck Story",
            "purpose": "Introduce through a narrative anecdote",
            "entry_assumption": "Viewer wants tips",
            "exit_state": "Viewer curious",
        },
        {
            "section_number": 2,
            "section_title": "The Technique",
            "purpose": "Explain method",
            "entry_assumption": "Viewer curious from story",
            "exit_state": "Viewer knows steps",
        },
    ]
    meta = auto_compute_meta(outline, 300)
    assert meta["duration_bucket"] == "short"
    assert meta["narrative_opening"] == "story_hook"
    # structure requires LLM — skip in unit test


def test_auto_compute_meta_medium_problem():
    from app.services.eval_gold_set import auto_compute_meta

    outline = [
        {
            "section_number": 1,
            "section_title": "The Problem with SEO",
            "purpose": "Present the challenge most beginners face",
            "entry_assumption": "...",
            "exit_state": "...",
        },
    ]
    meta = auto_compute_meta(outline, 800)
    assert meta["duration_bucket"] == "medium"
    assert meta["narrative_opening"] == "problem_statement"


def test_auto_compute_meta_long_direct():
    from app.services.eval_gold_set import auto_compute_meta

    outline = [
        {
            "section_number": 1,
            "section_title": "Introduction to Productivity Systems",
            "purpose": "Framework overview",
            "entry_assumption": "...",
            "exit_state": "...",
        },
    ]
    meta = auto_compute_meta(outline, 1500)
    assert meta["duration_bucket"] == "long"
    assert meta["narrative_opening"] == "direct_framework"


def test_slugify():
    from app.services.eval_gold_set import _slugify

    assert _slugify("How to Study Way More Effectively | The Feynman Technique") == "how_to_study_way_more_effectively_the_feynman_technique"
    assert _slugify("Ali Abdaal's Top 10 Tips!") == "ali_abdaals_top_10_tips"
    assert _slugify("  spaces  and---dashes  ") == "spaces_and_dashes"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -m pytest app/test/test_eval_ingestion.py -v`

Expected: ImportError — functions don't exist yet.

- [ ] **Step 3: Implement ingestion helpers**

Add to `eval_gold_set.py` after the cache section (~line 383), before `run_eval()`:

```python
# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

_SPONSOR_KEYWORDS = ["sponsor", "pitch", "ad ", "cta", "call to action", "advertisement"]


def _strip_sponsor_sections(outline: list, storyboard: list) -> tuple[list, list]:
    """Remove sponsor/CTA sections and their screens, renumber sequentially."""
    kept_section_nums = set()
    new_outline = []
    for s in outline:
        purpose_lower = s.get("purpose", "").lower()
        if any(kw in purpose_lower for kw in _SPONSOR_KEYWORDS):
            continue
        kept_section_nums.add(s["section_number"])
        new_outline.append(s)

    # Renumber sections
    for i, s in enumerate(new_outline, 1):
        s["section_number"] = i

    # Filter and renumber screens
    new_sb = [s for s in storyboard if s.get("section_number") in kept_section_nums]
    # Remap section numbers
    old_to_new = {}
    for i, orig_num in enumerate(sorted(kept_section_nums), 1):
        old_to_new[orig_num] = i
    for s in new_sb:
        s["section_number"] = old_to_new[s["section_number"]]
    for i, s in enumerate(new_sb, 1):
        s["screen_number"] = i

    return new_outline, new_sb


def _slugify(title: str) -> str:
    """Convert video title to directory-safe slug."""
    slug = title.lower().strip()
    slug = re.sub(r"[^\w\s]", "", slug)  # remove non-alphanumeric
    slug = re.sub(r"\s+", "_", slug)     # spaces to underscores
    slug = re.sub(r"_+", "_", slug)      # collapse multiple underscores
    return slug.strip("_")


def auto_compute_meta(outline: list, total_duration_sec: int) -> dict:
    """Auto-compute meta fields from outline data.

    - duration_bucket: deterministic from total_duration_sec
    - narrative_opening: keyword heuristic on Section 1
    - structure: defaults to 'linear' (LLM inference deferred to batch)
    """
    # Duration bucket
    if total_duration_sec < 600:
        bucket = "short"
    elif total_duration_sec < 1200:
        bucket = "medium"
    else:
        bucket = "long"

    # Narrative opening — keyword heuristic on Section 1
    opening = "direct_framework"
    if outline:
        s1 = outline[0]
        text = (s1.get("section_title", "") + " " + s1.get("purpose", "")).lower()
        story_keywords = ["story", "anecdote", "tale", "narrative", "parable", "once upon"]
        problem_keywords = ["problem", "challenge", "mistake", "struggle", "failing", "wrong"]
        if any(kw in text for kw in story_keywords):
            opening = "story_hook"
        elif any(kw in text for kw in problem_keywords):
            opening = "problem_statement"

    return {
        "duration_bucket": bucket,
        "structure": "linear",  # Default; LLM inference added in batch
        "narrative_opening": opening,
    }


def ingest_gold_set(raw_json: dict) -> dict:
    """Process raw Gemini JSON into a gold standard file.

    1. Strip sponsor/CTA sections
    2. Recompute total_duration_sec
    3. Renumber sections and screens
    4. Auto-compute meta
    5. Slugify title for directory name
    6. Save to data/gold_sets/{slug}/gold_standard.json
    """
    brief = raw_json["brief"]
    outline = raw_json["outline"]
    storyboard = raw_json["storyboard"]

    # Strip sponsor sections
    outline, storyboard = _strip_sponsor_sections(outline, storyboard)

    # Recompute duration
    total_duration = sum(s.get("duration_sec", 0) for s in outline)
    brief["total_duration_sec"] = total_duration

    # Auto-compute meta
    meta = auto_compute_meta(outline, total_duration)

    # Build gold set
    gold_set = {
        "meta": meta,
        "brief": brief,
        "outline": outline,
        "storyboard": storyboard,
    }

    # Save
    title = brief.get("video_title", "untitled")
    slug = _slugify(title)
    save_dir = GOLD_SETS_DIR / slug
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / "gold_standard.json"
    save_path.write_text(json.dumps(gold_set, indent=2, ensure_ascii=False))

    return {"slug": slug, "gold_set": gold_set}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -m pytest app/test/test_eval_ingestion.py -v`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/eval_gold_set.py backend/app/test/test_eval_ingestion.py
git commit -m "feat(eval): add gold set ingestion with sponsor stripping and meta computation"
```

---

### Task 3: Ingestion API endpoint

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add ingestion endpoint**

After the existing eval endpoints in `main.py` (~line 2154), add:

```python
@app.post("/api/eval/gold-set/ingest")
async def ingest_gold_set_endpoint(request: Request):
    """Ingest raw Gemini JSON as a new gold set."""
    try:
        raw_json = await request.json()
    except Exception:
        return JSONResponse({"success": False, "detail": "Invalid JSON"}, status_code=400)

    required = ["brief", "outline", "storyboard"]
    for field in required:
        if field not in raw_json:
            return JSONResponse(
                {"success": False, "detail": f"Missing required field: {field}"},
                status_code=400,
            )

    try:
        from app.services.eval_gold_set import ingest_gold_set
        result = ingest_gold_set(raw_json)
        return {"success": True, "slug": result["slug"], "gold_set": result["gold_set"]}
    except Exception as e:
        return JSONResponse({"success": False, "detail": str(e)}, status_code=500)
```

- [ ] **Step 2: Verify backend starts and endpoint exists**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && timeout 5 uvicorn app.main:app --port 8001 2>&1 | head -5`

Check that no import errors occur.

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(eval): add POST /api/eval/gold-set/ingest endpoint"
```

---

### Task 4: Fix existing Feynman gold set

**Files:**
- Modify: `data/gold_sets/feynman_technique/gold_standard.json`

- [ ] **Step 1: Run ingestion on existing gold set to add meta and strip sponsors**

Write a one-off script that loads the existing gold set, runs it through `_strip_sponsor_sections` and `auto_compute_meta`, and saves back:

```python
# Run from backend directory with venv active:
import json, sys
sys.path.insert(0, '.')
from app.services.eval_gold_set import _strip_sponsor_sections, auto_compute_meta, GOLD_SETS_DIR

path = GOLD_SETS_DIR / "feynman_technique" / "gold_standard.json"
gold = json.loads(path.read_text())

outline, storyboard = _strip_sponsor_sections(gold["outline"], gold["storyboard"])
total_dur = sum(s.get("duration_sec", 0) for s in outline)
gold["brief"]["total_duration_sec"] = total_dur
gold["outline"] = outline
gold["storyboard"] = storyboard
gold["meta"] = auto_compute_meta(outline, total_dur)

path.write_text(json.dumps(gold, indent=2, ensure_ascii=False))
print(f"Updated: {len(outline)} sections, {len(storyboard)} screens, {total_dur}s, meta={gold['meta']}")
```

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -c "<script above>"`

Expected: Sponsor section stripped, duration recomputed, meta added.

- [ ] **Step 2: Delete stale cached eval**

```bash
rm -f data/gold_sets/feynman_technique/cached_eval.json
```

- [ ] **Step 3: Commit**

```bash
git add data/gold_sets/feynman_technique/gold_standard.json
git commit -m "fix(eval): strip sponsor section from Feynman gold set, add meta"
```

---

## Chunk 2: Backend — LLM Judge & Batch

### Task 5: LLM-as-judge prompt

**Files:**
- Create: `prompts/EVAL_JUDGE_PROMPT.md`

- [ ] **Step 1: Create the judge prompt**

```markdown
# Evaluation Judge

You are an expert evaluator comparing AI-generated content against gold standard reference content for educational/knowledge-sharing YouTube videos.

You will be given a GOLD standard (human-crafted reference) and an AI output. Your job is to identify specific quality issues in the AI output by comparing it against the gold standard.

## Evaluation Mode

You will evaluate one of two content types per call:

### When evaluating OUTLINE quality, assess these 5 dimensions:

1. **flow_coherence** — Do sections connect logically? Does the exit state of section N naturally lead to the entry assumption of section N+1? Look for abrupt jumps, missing bridges between ideas, or circular reasoning.
   - Example tags: `abrupt_transition`, `missing_bridge`, `circular_flow`

2. **talking_point_specificity** — Are talking points concrete and actionable, or are they vague platitudes that could apply to any topic? Compare specificity level against the gold standard.
   - Example tags: `vague_platitude`, `no_actionable_detail`

3. **evidence_relevance** — Are the suggested evidence areas and research queries actually relevant to the claims being made? Would they strengthen the argument?
   - Example tags: `irrelevant_evidence`, `missing_key_evidence`

4. **brief_alignment** — Does the outline serve the brief's `viewer_outcome` and `selected_angle`? Has the AI drifted to a related but different topic?
   - Example tags: `drifted_from_angle`, `outcome_not_served`

5. **section_necessity** — Does every section earn its place? Could any sections be merged without losing value? Are there filler sections that don't advance the viewer toward the outcome?
   - Example tags: `redundant_section`, `filler_section`

### When evaluating STORYBOARD quality, assess these 4 dimensions:

1. **context_rot** — Does the voiceover text say something without actually conveying substance? Sentences that sound meaningful but are empty elaboration.
   - Example tags: `empty_elaboration`, `says_nothing`

2. **generic_rewrite** — Did the AI flatten specific, concrete gold content into generic language? Compare the AI voiceover against the gold — did specific examples, numbers, or references get replaced with vague generalities?
   - Example tags: `lost_specificity`, `generic_replacement`

3. **factual_invention** — Did the AI fabricate facts, statistics, quotes, or claims that are NOT present in the gold standard or the brief? This is a serious quality issue.
   - Example tags: `invented_stat`, `fabricated_claim`

4. **redundancy** — Do multiple screens repeat substantially the same point? Look for the same idea restated in different words across screens.
   - Example tags: `repeated_point`, `duplicate_content`

## Output Format

Return ONLY valid JSON matching this structure. For each dimension, provide:
- `tags`: array of issue tags found (empty array if no issues)
- `notes`: brief explanation of the issue (empty string if no issues)

You may use the example tags above OR create new descriptive tags that fit the dimension. Tags should be `snake_case`, 2-4 words.

```json
{
  "outline_quality": {
    "flow_coherence": { "tags": [], "notes": "" },
    "talking_point_specificity": { "tags": [], "notes": "" },
    "evidence_relevance": { "tags": [], "notes": "" },
    "brief_alignment": { "tags": [], "notes": "" },
    "section_necessity": { "tags": [], "notes": "" }
  }
}
```

Or for storyboard evaluation:

```json
{
  "storyboard_quality": {
    "context_rot": { "tags": [], "notes": "" },
    "generic_rewrite": { "tags": [], "notes": "" },
    "factual_invention": { "tags": [], "notes": "" },
    "redundancy": { "tags": [], "notes": "" }
  }
}
```

## Rules

- Only flag issues you are confident about. When in doubt, leave tags empty.
- Compare against the GOLD standard, not against an abstract ideal.
- Be specific in notes — reference section/screen numbers.
- Do NOT invent issues that don't exist. Empty tags arrays are perfectly fine.
```

- [ ] **Step 2: Commit**

```bash
git add prompts/EVAL_JUDGE_PROMPT.md
git commit -m "feat(eval): add LLM-as-judge evaluation prompt"
```

---

### Task 6: LLM-as-judge functions

**Files:**
- Create: `backend/app/services/eval_batch.py`

- [ ] **Step 1: Create eval_batch.py with LLM judge functions**

```python
"""
Batch evaluation: LLM-as-judge, batch runner, aggregate report.

Depends on eval_gold_set.py for per-video eval and data loading.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.services.eval_gold_set import (
    GOLD_SETS_DIR,
    get_current_prompt_versions,
    gold_outline_to_director_text,
    list_gold_sets,
    load_gold_set,
    run_eval,
    get_cached_eval,
)

BATCH_REPORT_PATH = GOLD_SETS_DIR / "batch_report.json"

# Resolve prompt path (same approach as BaseAgent)
_PROMPTS_DIR = Path(__file__).parent.parent.parent.parent / "prompts"


# ---------------------------------------------------------------------------
# LLM-as-Judge
# ---------------------------------------------------------------------------

def _load_judge_prompt() -> str:
    path = _PROMPTS_DIR / "EVAL_JUDGE_PROMPT.md"
    return path.read_text()


def _get_llm_model() -> str:
    """Read primary model from llm_config.json."""
    config_path = Path(__file__).parent.parent.parent / "config" / "llm_config.json"
    try:
        config = json.loads(config_path.read_text())
        return config["config_list"][0]["model"]
    except Exception:
        return "gpt-4o"  # fallback


def _call_judge_llm(system_prompt: str, user_prompt: str) -> dict:
    """Call LLM for judge evaluation, return parsed JSON."""
    from openai import OpenAI
    import os

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model=_get_llm_model(),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.1,
        max_tokens=2000,
    )
    text = response.choices[0].message.content.strip()
    # Extract JSON from potential markdown blocks
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    return json.loads(text)


def run_llm_judge_outline(gold: dict, ai_director_output: str) -> dict:
    """Judge AI outline quality against gold standard.

    Input: gold brief + gold outline + AI outline.
    Returns: {"outline_quality": {dimension: {tags: [], notes: ""}}}
    """
    system_prompt = _load_judge_prompt()
    gold_brief_str = json.dumps(gold["brief"], indent=2, ensure_ascii=False)
    gold_outline_str = json.dumps(gold["outline"], indent=2, ensure_ascii=False)

    user_prompt = f"""## Evaluation Mode: OUTLINE

## Gold Brief
{gold_brief_str}

## Gold Outline (reference)
{gold_outline_str}

## AI Outline (to evaluate)
{ai_director_output}

Evaluate the AI outline against the gold outline across all 5 outline quality dimensions. Return JSON."""

    try:
        return _call_judge_llm(system_prompt, user_prompt)
    except Exception as e:
        # Return empty result on failure rather than crashing batch
        return {
            "outline_quality": {
                dim: {"tags": [], "notes": f"Judge error: {e}"}
                for dim in ["flow_coherence", "talking_point_specificity",
                           "evidence_relevance", "brief_alignment", "section_necessity"]
            }
        }


def run_llm_judge_storyboard(gold: dict, ai_storyboard: list) -> dict:
    """Judge AI storyboard quality against gold standard.

    Input: gold brief + gold outline (context) + gold storyboard + AI storyboard.
    Returns: {"storyboard_quality": {dimension: {tags: [], notes: ""}}}
    """
    system_prompt = _load_judge_prompt()
    gold_brief_str = json.dumps(gold["brief"], indent=2, ensure_ascii=False)
    gold_outline_str = json.dumps(gold["outline"], indent=2, ensure_ascii=False)
    gold_sb_str = json.dumps(gold["storyboard"], indent=2, ensure_ascii=False)
    ai_sb_str = json.dumps(ai_storyboard, indent=2, ensure_ascii=False)

    user_prompt = f"""## Evaluation Mode: STORYBOARD

## Gold Brief (context)
{gold_brief_str}

## Gold Outline (context)
{gold_outline_str}

## Gold Storyboard (reference)
{gold_sb_str}

## AI Storyboard (to evaluate)
{ai_sb_str}

Evaluate the AI storyboard against the gold storyboard across all 4 storyboard quality dimensions. Return JSON."""

    try:
        return _call_judge_llm(system_prompt, user_prompt)
    except Exception as e:
        return {
            "storyboard_quality": {
                dim: {"tags": [], "notes": f"Judge error: {e}"}
                for dim in ["context_rot", "generic_rewrite",
                           "factual_invention", "redundancy"]
            }
        }


# ---------------------------------------------------------------------------
# Batch Runner
# ---------------------------------------------------------------------------

# In-memory batch job state
_batch_job: dict = {"status": "idle", "completed": 0, "total": 0,
                    "started_at": None, "error": None}


def get_batch_status() -> dict:
    return dict(_batch_job)


def run_batch_eval(names: Optional[list[str]] = None, force: bool = False):
    """Run eval on multiple gold sets sequentially.

    Updates _batch_job status as it progresses.
    After all evals complete, runs LLM judge on each and computes batch report.
    """
    global _batch_job

    if names is None:
        names = list_gold_sets()

    _batch_job = {
        "status": "running",
        "completed": 0,
        "total": len(names),
        "started_at": datetime.now().isoformat(),
        "error": None,
    }

    completed_names = []
    failed_names = []

    for name in names:
        try:
            # Run per-video eval (respects cache unless force)
            run_eval(name, force=force)

            # Run LLM judge on the cached result
            cached = get_cached_eval(name)
            if cached and "judge" not in cached:
                gold = load_gold_set(name)
                judge_outline = run_llm_judge_outline(
                    gold, cached.get("director_output", "")
                )
                judge_storyboard = run_llm_judge_storyboard(
                    gold, cached.get("writer_output_path_a", [])
                )
                cached["judge"] = {
                    **judge_outline,
                    **judge_storyboard,
                }
                # Re-save cache with judge results
                from app.services.eval_gold_set import _save_cache
                _save_cache(name, cached)

            completed_names.append(name)
        except Exception as e:
            failed_names.append({"name": name, "error": str(e)})

        _batch_job["completed"] = len(completed_names) + len(failed_names)

    # Compute aggregate report
    try:
        report = compute_batch_report(completed_names, failed_names)
        BATCH_REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    except Exception as e:
        _batch_job = {"status": "error", "completed": _batch_job["completed"],
                      "total": _batch_job["total"], "started_at": _batch_job["started_at"],
                      "error": f"Report generation failed: {e}"}
        return

    _batch_job["status"] = "done"


# ---------------------------------------------------------------------------
# Batch Report
# ---------------------------------------------------------------------------

def compute_batch_report(completed_names: list[str],
                         failed_names: list[dict]) -> dict:
    """Aggregate per-video results into a batch report."""
    prompt_versions = get_current_prompt_versions()

    # Collect per-video stats
    outline_stats = {"section_count_gold": [], "section_count_ai": [],
                     "duration_overshoot_pct": []}
    sb_stats = {"screen_count_gold": [], "screen_count_ai": [],
                "avg_wps_gold": [], "avg_wps_ai": [],
                "duration_acc_pct": []}
    tag_freq: dict = {"outline": {}, "storyboard": {}}

    for name in completed_names:
        cached = get_cached_eval(name)
        if not cached or not cached.get("analysis"):
            continue
        analysis = cached["analysis"]

        # Outline stats
        d = analysis.get("director", {})
        sc = d.get("section_count", {})
        outline_stats["section_count_gold"].append(sc.get("gold", 0))
        outline_stats["section_count_ai"].append(sc.get("ai", 0))
        gold_dur = d.get("gold_duration_sec", 0)
        if gold_dur > 0:
            # Parse AI duration estimate midpoint
            ai_est = d.get("ai_duration_estimate", "0:00-0:00")
            ai_secs = _parse_duration_midpoint(ai_est)
            overshoot = ((ai_secs - gold_dur) / gold_dur) * 100
            outline_stats["duration_overshoot_pct"].append(round(overshoot, 1))

        # Storyboard stats (use path_b for primary comparison)
        wb = analysis.get("writer_path_b", {})
        wsc = wb.get("screen_count", {})
        sb_stats["screen_count_gold"].append(wsc.get("gold", 0))
        sb_stats["screen_count_ai"].append(wsc.get("ai", 0))
        wps = wb.get("avg_words_per_screen", {})
        sb_stats["avg_wps_gold"].append(wps.get("gold", 0))
        sb_stats["avg_wps_ai"].append(wps.get("ai", 0))
        ai_dur = wb.get("ai_total_duration_sec", 0)
        if gold_dur > 0 and ai_dur > 0:
            dur_acc = ((ai_dur - gold_dur) / gold_dur) * 100
            sb_stats["duration_acc_pct"].append(round(dur_acc, 1))

        # Quality tags from judge
        judge = cached.get("judge", {})
        for layer_key, layer_name in [("outline_quality", "outline"),
                                       ("storyboard_quality", "storyboard")]:
            layer = judge.get(layer_key, {})
            for dim_data in layer.values():
                for tag in dim_data.get("tags", []):
                    if tag not in tag_freq[layer_name]:
                        tag_freq[layer_name][tag] = {"count": 0, "videos": []}
                    tag_freq[layer_name][tag]["count"] += 1
                    tag_freq[layer_name][tag]["videos"].append(name)

    def _avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else 0

    report = {
        "timestamp": datetime.now().isoformat(),
        "prompt_versions": prompt_versions,
        "gold_sets_run": completed_names,
        "videos_completed": len(completed_names),
        "videos_failed": len(failed_names),
        "failed_details": failed_names,
        "descriptive_stats": {
            "outline": {
                "section_count": {
                    "gold_avg": _avg(outline_stats["section_count_gold"]),
                    "ai_avg": _avg(outline_stats["section_count_ai"]),
                },
                "duration_overshoot_pct": {
                    "avg": _avg(outline_stats["duration_overshoot_pct"]),
                },
            },
            "storyboard": {
                "screen_count": {
                    "gold_avg": _avg(sb_stats["screen_count_gold"]),
                    "ai_avg": _avg(sb_stats["screen_count_ai"]),
                },
                "avg_words_per_screen": {
                    "gold_avg": _avg(sb_stats["avg_wps_gold"]),
                    "ai_avg": _avg(sb_stats["avg_wps_ai"]),
                },
                "total_duration_accuracy_pct": {
                    "avg": _avg(sb_stats["duration_acc_pct"]),
                },
            },
        },
        "tag_frequency": tag_freq,
        "history": [],
    }

    # Append to history from existing report
    if BATCH_REPORT_PATH.exists():
        try:
            old = json.loads(BATCH_REPORT_PATH.read_text())
            report["history"] = old.get("history", [])
        except Exception:
            pass

    # Add current run to history
    total_outline_tags = sum(v["count"] for v in tag_freq.get("outline", {}).values())
    total_sb_tags = sum(v["count"] for v in tag_freq.get("storyboard", {}).values())
    top_tags = sorted(
        [(f"{t}:{d['count']}", d["count"])
         for layer in tag_freq.values() for t, d in layer.items()],
        key=lambda x: -x[1]
    )[:5]
    report["history"].append({
        "timestamp": report["timestamp"],
        "prompt_versions": prompt_versions,
        "top_tags": [t[0] for t in top_tags],
        "total_tag_count": {"outline": total_outline_tags, "storyboard": total_sb_tags},
    })

    return report


def _parse_duration_midpoint(duration_str: str) -> int:
    """Parse 'M:SS–M:SS' and return midpoint in seconds."""
    import re
    parts = re.split(r"[—–\-]", duration_str)
    secs = []
    for p in parts:
        p = p.strip()
        if ":" in p:
            pieces = p.split(":")
            try:
                secs.append(int(pieces[0]) * 60 + int(pieces[1]))
            except ValueError:
                pass
        else:
            try:
                secs.append(int(float(p)))
            except ValueError:
                pass
    if not secs:
        return 0
    return sum(secs) // len(secs)


def get_batch_report() -> Optional[dict]:
    """Load latest batch report if it exists."""
    if BATCH_REPORT_PATH.exists():
        return json.loads(BATCH_REPORT_PATH.read_text())
    return None
```

- [ ] **Step 2: Verify import works**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -c "from app.services.eval_batch import get_batch_status; print(get_batch_status())"`

Expected: `{'status': 'idle', 'completed': 0, 'total': 0, 'started_at': None, 'error': None}`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/eval_batch.py
git commit -m "feat(eval): add LLM-as-judge and batch runner with report aggregation"
```

---

### Task 7: Batch report aggregation tests

**Files:**
- Create: `backend/app/test/test_eval_batch.py`

- [ ] **Step 1: Write tests for batch report computation**

```python
# backend/app/test/test_eval_batch.py
"""Tests for batch report aggregation (no LLM calls)."""


def test_parse_duration_midpoint():
    from app.services.eval_batch import _parse_duration_midpoint

    assert _parse_duration_midpoint("1:30–2:00") == 105  # (90+120)/2
    assert _parse_duration_midpoint("3:00") == 180
    assert _parse_duration_midpoint("0:45–1:15") == 60  # (45+75)/2
    assert _parse_duration_midpoint("") == 0
    assert _parse_duration_midpoint("bad") == 0


def test_compute_batch_report_empty():
    from app.services.eval_batch import compute_batch_report

    report = compute_batch_report([], [])
    assert report["videos_completed"] == 0
    assert report["videos_failed"] == 0
    assert report["descriptive_stats"]["outline"]["section_count"]["gold_avg"] == 0


def test_compute_batch_report_with_data(tmp_path, monkeypatch):
    """Test aggregation with mocked cached eval data."""
    import json
    from app.services.eval_batch import compute_batch_report, GOLD_SETS_DIR
    from app.services import eval_gold_set

    # Create fake gold set dirs with cached evals
    fake_dir = tmp_path / "gold_sets"
    for name in ["video_a", "video_b"]:
        d = fake_dir / name
        d.mkdir(parents=True)
        cached = {
            "analysis": {
                "director": {
                    "section_count": {"gold": 5, "ai": 4},
                    "ai_duration_estimate": "5:00–6:00",
                    "gold_duration_sec": 300,
                },
                "writer_path_b": {
                    "screen_count": {"gold": 10, "ai": 12},
                    "avg_words_per_screen": {"gold": 100, "ai": 50},
                    "ai_total_duration_sec": 280,
                },
            },
            "judge": {
                "outline_quality": {
                    "flow_coherence": {"tags": ["abrupt_transition"], "notes": "test"},
                    "brief_alignment": {"tags": [], "notes": ""},
                },
                "storyboard_quality": {
                    "context_rot": {"tags": ["empty_elaboration"], "notes": "test"},
                },
            },
        }
        (d / "cached_eval.json").write_text(json.dumps(cached))

    # Monkeypatch GOLD_SETS_DIR and get_cached_eval
    monkeypatch.setattr(eval_gold_set, "GOLD_SETS_DIR", fake_dir)
    import app.services.eval_batch as eb
    monkeypatch.setattr(eb, "GOLD_SETS_DIR", fake_dir)
    monkeypatch.setattr(eb, "BATCH_REPORT_PATH", fake_dir / "batch_report.json")

    original_get_cached = eval_gold_set.get_cached_eval
    def mock_get_cached(name):
        p = fake_dir / name / "cached_eval.json"
        if p.exists():
            return json.loads(p.read_text())
        return None
    monkeypatch.setattr(eb, "get_cached_eval", mock_get_cached)

    report = compute_batch_report(["video_a", "video_b"], [])

    assert report["videos_completed"] == 2
    assert report["descriptive_stats"]["outline"]["section_count"]["gold_avg"] == 5.0
    assert report["descriptive_stats"]["outline"]["section_count"]["ai_avg"] == 4.0
    assert report["descriptive_stats"]["storyboard"]["screen_count"]["gold_avg"] == 10.0
    # Tag frequency
    assert report["tag_frequency"]["outline"]["abrupt_transition"]["count"] == 2
    assert report["tag_frequency"]["storyboard"]["empty_elaboration"]["count"] == 2
    assert len(report["tag_frequency"]["outline"]["abrupt_transition"]["videos"]) == 2
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && python -m pytest app/test/test_eval_batch.py -v`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/app/test/test_eval_batch.py
git commit -m "test(eval): add batch report aggregation tests"
```

---

### Task 8: Batch API endpoints

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add batch endpoints**

After the ingestion endpoint in `main.py`, add:

```python
# --- Batch eval endpoints ---

@app.post("/api/eval/batch")
async def start_batch_eval(request: Request):
    """Kick off batch evaluation in background."""
    from app.services.eval_batch import get_batch_status, run_batch_eval
    import asyncio

    status = get_batch_status()
    if status["status"] == "running":
        return {"success": True, "message": "Batch already running", "status": status}

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass  # empty body = run all

    names = body.get("names", None)  # None = all gold sets
    force = body.get("force", False)

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, lambda: run_batch_eval(names=names, force=force))

    return {"success": True, "message": "Batch eval started"}


@app.get("/api/eval/batch/status")
async def batch_eval_status():
    """Poll batch eval progress."""
    from app.services.eval_batch import get_batch_status
    return get_batch_status()


@app.get("/api/eval/batch/report")
async def batch_eval_report():
    """Return latest batch report."""
    from app.services.eval_batch import get_batch_report
    report = get_batch_report()
    if report is None:
        return {"success": False, "detail": "No batch report available"}
    return {"success": True, "report": report}
```

- [ ] **Step 2: Verify backend starts**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && timeout 5 uvicorn app.main:app --port 8001 2>&1 | head -5`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(eval): add batch eval API endpoints (POST /batch, GET /status, GET /report)"
```

---

## Chunk 3: Frontend — Tabs, Batch View & Diffs Page

### Task 9: Extract shared components from GoldSetEval

The current `GoldSetEval.tsx` has `MetricCard`, `ScreenCard`, `SectionDiff`, `StoryboardDiff` as inline subcomponents. Extract them to a shared file so `BatchDiffs.tsx` can reuse them.

**Files:**
- Create: `frontend/src/components/admin/eval-components.tsx`
- Modify: `frontend/src/components/admin/GoldSetEval.tsx`

- [ ] **Step 1: Create eval-components.tsx**

Move the type definitions (lines 10-82) and subcomponents (`MetricCard`, `ScreenCard`, `SectionDiff`, `StoryboardDiff` — lines 84-258) from `GoldSetEval.tsx` into a new file. Export them all.

```tsx
// frontend/src/components/admin/eval-components.tsx
import { Badge } from "@/components/ui/badge";

// ============================================================================
// Types
// ============================================================================

export interface GoldScreen {
  screen_number: number;
  section_number: number;
  screen_type: string;
  voiceover_text: string;
  visual_direction: string[];
  action_notes: string;
}

export interface AIScreen extends GoldScreen {
  duration?: number;
  on_screen_visual?: string;
}

export interface GoldSection {
  section_number: number;
  section_title: string;
  purpose: string;
  entry_assumption: string;
  exit_state: string;
  misconception_to_preempt: string | null;
  duration_sec: number;
  talking_points: string[];
  evidence_used: string[] | null;
  visual_intent: string[];
}

export interface WriterAnalysis {
  screen_count: { gold: number; ai: number };
  total_words: { gold: number; ai: number };
  avg_words_per_screen: { gold: number; ai: number };
  screen_types: { gold: Record<string, number>; ai: Record<string, number> };
  filler_phrases: string[];
  ai_total_duration_sec: number;
}

export interface Analysis {
  director: {
    section_count: { gold: number; ai: number };
    ai_sections: {
      section_number: number;
      title: string;
      purpose: string;
      entry_assumption: string;
      exit_state: string;
      misconception_to_preempt: string;
      duration_str: string;
      talking_points: string[];
      evidence_needed: string[];
      visual_intent: string[];
    }[];
    ai_duration_estimate: string;
    gold_duration_sec: number;
  };
  writer_path_b: WriterAnalysis;
  writer_path_a: WriterAnalysis;
  summary: string[];
}

export interface EvalData {
  gold_set_name: string;
  timestamp?: string;
  prompt_versions?: { director: string; writer: string };
  gold: {
    brief: Record<string, unknown>;
    outline: GoldSection[];
    storyboard: GoldScreen[];
  };
  director_output?: string;
  writer_output_path_b?: AIScreen[];
  writer_output_path_a?: AIScreen[];
  analysis?: Analysis;
  judge?: {
    outline_quality?: Record<string, { tags: string[]; notes: string }>;
    storyboard_quality?: Record<string, { tags: string[]; notes: string }>;
  };
}

// ============================================================================
// Subcomponents
// ============================================================================

export function MetricCard({ label, gold, ai, unit = "" }: { label: string; gold: number | string; ai: number | string; unit?: string }) {
  const goldNum = typeof gold === "number" ? gold : parseFloat(String(gold));
  const aiNum = typeof ai === "number" ? ai : parseFloat(String(ai));
  const diff = !isNaN(goldNum) && !isNaN(aiNum) ? aiNum - goldNum : null;
  const pct = diff !== null && goldNum !== 0 ? Math.round((diff / goldNum) * 100) : null;

  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-baseline gap-3">
        <span className="text-sm">
          <span className="text-muted-foreground">Gold:</span>{" "}
          <span className="font-mono font-medium">{gold}{unit}</span>
        </span>
        <span className="text-sm">
          <span className="text-muted-foreground">AI:</span>{" "}
          <span className="font-mono font-medium">{ai}{unit}</span>
        </span>
        {pct !== null && (
          <Badge variant={Math.abs(pct) > 30 ? "destructive" : "secondary"} className="text-xs">
            {pct > 0 ? "+" : ""}{pct}%
          </Badge>
        )}
      </div>
    </div>
  );
}

export function ScreenCard({ screen, label }: { screen: GoldScreen | AIScreen; label: "GOLD" | "AI" }) {
  const words = screen.voiceover_text?.split(/\s+/).length || 0;
  const duration = "duration" in screen ? (screen as AIScreen).duration : null;

  return (
    <div className={`border rounded-lg p-3 ${label === "GOLD" ? "border-emerald-500/30 bg-emerald-500/5" : "border-blue-500/30 bg-blue-500/5"}`}>
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="text-xs">{label}</Badge>
        <Badge variant="secondary" className="text-xs">{screen.screen_type}</Badge>
        <span className="text-xs text-muted-foreground">{words} words</span>
        {duration && <span className="text-xs text-muted-foreground">{duration}s</span>}
      </div>
      <p className="text-sm mb-2 leading-relaxed">{screen.voiceover_text}</p>
      {screen.visual_direction?.length > 0 && (
        <div className="text-xs text-muted-foreground mt-1">
          <span className="font-medium">Visual:</span>
          <ul className="list-disc list-inside mt-0.5">
            {screen.visual_direction.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
      )}
      {screen.action_notes && (
        <div className="text-xs text-muted-foreground mt-1">
          <span className="font-medium">Notes:</span> {screen.action_notes}
        </div>
      )}
    </div>
  );
}

export function SectionDiff({ gold, aiSections }: { gold: GoldSection[]; aiSections: Analysis["director"]["ai_sections"] }) {
  const maxLen = Math.max(gold.length, aiSections.length);
  return (
    <div className="space-y-4">
      {Array.from({ length: maxLen }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          {/* Gold */}
          <div className={`border rounded-lg p-3 ${i < gold.length ? "border-emerald-500/30 bg-emerald-500/5" : "border-dashed border-muted"}`}>
            {i < gold.length ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">GOLD</Badge>
                  <span className="font-medium text-sm">Section {gold[i].section_number} — {gold[i].section_title}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1"><b>Purpose:</b> {gold[i].purpose}</p>
                <p className="text-xs text-muted-foreground mb-1"><b>Duration:</b> {gold[i].duration_sec}s</p>
                <p className="text-xs text-muted-foreground mb-1"><b>Entry:</b> {gold[i].entry_assumption}</p>
                <p className="text-xs text-muted-foreground mb-1"><b>Exit:</b> {gold[i].exit_state}</p>
                <div className="text-xs text-muted-foreground">
                  <b>Talking points:</b>
                  <ul className="list-disc list-inside">
                    {gold[i].talking_points.map((tp, j) => <li key={j}>{tp}</li>)}
                  </ul>
                </div>
                {gold[i].evidence_used && (
                  <div className="text-xs text-muted-foreground mt-1">
                    <b>Evidence:</b>
                    <ul className="list-disc list-inside">
                      {gold[i].evidence_used!.map((ev, j) => <li key={j}>{ev}</li>)}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic">No gold section</span>
            )}
          </div>
          {/* AI */}
          <div className={`border rounded-lg p-3 ${i < aiSections.length ? "border-blue-500/30 bg-blue-500/5" : "border-dashed border-muted"}`}>
            {i < aiSections.length ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">AI</Badge>
                  <span className="font-medium text-sm">Section {aiSections[i].section_number} — {aiSections[i].title}</span>
                </div>
                {aiSections[i].purpose && <p className="text-xs text-muted-foreground mb-1"><b>Purpose:</b> {aiSections[i].purpose}</p>}
                <p className="text-xs text-muted-foreground mb-1"><b>Duration:</b> {aiSections[i].duration_str}</p>
                {aiSections[i].entry_assumption && <p className="text-xs text-muted-foreground mb-1"><b>Entry:</b> {aiSections[i].entry_assumption}</p>}
                {aiSections[i].exit_state && <p className="text-xs text-muted-foreground mb-1"><b>Exit:</b> {aiSections[i].exit_state}</p>}
                {aiSections[i].misconception_to_preempt && aiSections[i].misconception_to_preempt.toLowerCase() !== "none" && (
                  <p className="text-xs text-muted-foreground mb-1"><b>Misconception:</b> {aiSections[i].misconception_to_preempt}</p>
                )}
                {aiSections[i].talking_points.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <b>Talking points:</b>
                    <ul className="list-disc list-inside">
                      {aiSections[i].talking_points.map((tp, j) => <li key={j}>{tp}</li>)}
                    </ul>
                  </div>
                )}
                {aiSections[i].evidence_needed.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    <b>Evidence needed:</b>
                    <ul className="list-disc list-inside">
                      {aiSections[i].evidence_needed.map((ev, j) => <li key={j}>{ev}</li>)}
                    </ul>
                  </div>
                )}
                {aiSections[i].visual_intent.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    <b>Visual intent:</b>
                    <ul className="list-disc list-inside">
                      {aiSections[i].visual_intent.map((vi, j) => <li key={j}>{vi}</li>)}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic">No AI section</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StoryboardDiff({ gold, ai, pathLabel }: { gold: GoldScreen[]; ai: AIScreen[]; pathLabel: string }) {
  const maxLen = Math.max(gold.length, ai.length);
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">{pathLabel}</h4>
      {Array.from({ length: maxLen }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <div>
            {i < gold.length ? (
              <ScreenCard screen={gold[i]} label="GOLD" />
            ) : (
              <div className="border border-dashed rounded-lg p-3 text-xs text-muted-foreground italic">No gold screen</div>
            )}
          </div>
          <div>
            {i < ai.length ? (
              <ScreenCard screen={ai[i]} label="AI" />
            ) : (
              <div className="border border-dashed rounded-lg p-3 text-xs text-muted-foreground italic">No AI screen</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update GoldSetEval.tsx to import from eval-components**

Replace lines 1-258 (types + subcomponents) with imports:

```tsx
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Clock, Film, BarChart3, AlertTriangle } from "lucide-react";
import {
  MetricCard,
  SectionDiff,
  StoryboardDiff,
  type EvalData,
  type Analysis,
} from "./eval-components";
```

Keep the main `GoldSetEval` component (lines 260-548) as-is.

- [ ] **Step 3: Verify frontend builds**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/eval-components.tsx frontend/src/components/admin/GoldSetEval.tsx
git commit -m "refactor(eval): extract shared types and components to eval-components.tsx"
```

---

### Task 10: Add tabs and gold set dropdown to GoldSetEval

**Files:**
- Modify: `frontend/src/components/admin/GoldSetEval.tsx`

- [ ] **Step 1: Add tab state, gold set list, and batch state**

Add state variables and fetch logic at the top of the `GoldSetEval` component:

```tsx
export default function GoldSetEval() {
  // Tab state
  const [activeTab, setActiveTab] = useState<"single" | "batch">(() => {
    return window.location.hash === "#batch" ? "batch" : "single";
  });

  // Single tab state
  const [goldSets, setGoldSets] = useState<string[]>([]);
  const [goldSetName, setGoldSetName] = useState("feynman_technique");
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  // Update hash on tab change
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  // Fetch gold set list
  useEffect(() => {
    fetch("/api/eval/gold-sets")
      .then(r => r.json())
      .then(j => {
        if (j.gold_sets) setGoldSets(j.gold_sets);
      })
      .catch(() => {});
  }, []);

  // ... existing fetchCached, runEval (update to use goldSetName from state) ...
```

- [ ] **Step 2: Add tab toggle and dropdown to render**

Replace the header section to include tabs and a gold set dropdown:

```tsx
return (
  <div className="max-w-7xl mx-auto p-6 space-y-8">
    {/* Tab Toggle */}
    <div className="flex items-center gap-1 border rounded-lg p-1 w-fit bg-muted/30">
      <button
        onClick={() => setActiveTab("single")}
        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
          activeTab === "single" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Single
      </button>
      <button
        onClick={() => setActiveTab("batch")}
        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
          activeTab === "batch" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Batch
      </button>
    </div>

    {activeTab === "single" && (
      <>
        {/* Header with dropdown */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Gold Set Evaluation</h1>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={goldSetName}
                onChange={e => setGoldSetName(e.target.value)}
                className="text-sm border rounded px-2 py-1 bg-background"
              >
                {goldSets.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data?.timestamp && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(data.timestamp).toLocaleString()}
                {isCached && <Badge variant="secondary" className="text-xs ml-1">cached</Badge>}
              </span>
            )}
            <Button onClick={runEval} disabled={running} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
              {running ? "Running (~90s)..." : "Run Eval"}
            </Button>
          </div>
        </div>

        {/* ... rest of existing single eval content ... */}
      </>
    )}

    {activeTab === "batch" && <BatchTab />}
  </div>
);
```

- [ ] **Step 3: Add `BatchTab` component inline**

Add after the `GoldSetEval` component in the same file:

Note: `GoldSetEval.tsx` needs `Link` imported from `react-router-dom`:

```tsx
import { Link } from "react-router-dom";
```

```tsx
function BatchTab() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    fetch("/api/eval/batch/report")
      .then(r => r.json())
      .then(j => { if (j.success) setReport(j.report); })
      .catch(() => {});
  }, []);

  const runBatch = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/eval/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json();
      if (!json.success) { setError(json.detail || "Failed to start"); setRunning(false); return; }

      const poll = setInterval(async () => {
        try {
          const sr = await fetch("/api/eval/batch/status");
          const sj = await sr.json();
          setProgress({ completed: sj.completed || 0, total: sj.total || 0 });
          if (sj.status === "done") {
            clearInterval(poll);
            setRunning(false);
            const rr = await fetch("/api/eval/batch/report");
            const rj = await rr.json();
            if (rj.success) setReport(rj.report);
          } else if (sj.status === "error") {
            clearInterval(poll);
            setRunning(false);
            setError(sj.error || "Batch failed");
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e) { setError(String(e)); setRunning(false); }
  }, []);

  const stats = report?.descriptive_stats as Record<string, Record<string, Record<string, number>>> | undefined;
  const tagFreq = report?.tag_frequency as Record<string, Record<string, { count: number; videos: string[] }>> | undefined;
  const history = report?.history as { timestamp: string; prompt_versions: Record<string, string>; top_tags: string[]; total_tag_count: Record<string, number> }[] | undefined;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Batch Evaluation</h1>
          {report && (
            <p className="text-xs text-muted-foreground mt-1">
              Last run: {new Date(report.timestamp as string).toLocaleString()} | Prompts: {(report.prompt_versions as Record<string, string>)?.director}, {(report.prompt_versions as Record<string, string>)?.writer}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <span className="text-sm text-muted-foreground">
              {progress.completed}/{progress.total} running...
            </span>
          )}
          <Button onClick={runBatch} disabled={running} size="sm">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
            {running ? "Running..." : "Run Batch"}
          </Button>
          {report && (
            <Link to="/admin/gold-set-eval/diffs" className="text-sm text-blue-600 hover:underline">
              View Diffs →
            </Link>
          )}
        </div>
      </div>

      {error && <Card className="p-4 border-destructive"><p className="text-destructive">{error}</p></Card>}

      {!report && !running && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No batch results yet. Click "Run Batch" to evaluate all gold sets.</p>
        </Card>
      )}

      {report && stats && (
        <>
          {/* Descriptive Stats */}
          <section>
            <h2 className="text-lg font-medium mb-3">Descriptive Stats</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Outline (gold outline vs AI outline)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Sections" gold={stats.outline?.section_count?.gold_avg ?? 0} ai={stats.outline?.section_count?.ai_avg ?? 0} />
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Duration Overshoot</div>
                    <span className="font-mono font-medium text-sm">
                      avg {stats.outline?.duration_overshoot_pct?.avg > 0 ? "+" : ""}{stats.outline?.duration_overshoot_pct?.avg ?? 0}%
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Storyboard (gold storyboard vs AI storyboard)</h3>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Screens" gold={stats.storyboard?.screen_count?.gold_avg ?? 0} ai={stats.storyboard?.screen_count?.ai_avg ?? 0} />
                  <MetricCard label="Words/Screen" gold={stats.storyboard?.avg_words_per_screen?.gold_avg ?? 0} ai={stats.storyboard?.avg_words_per_screen?.ai_avg ?? 0} />
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Duration Accuracy</div>
                    <span className="font-mono font-medium text-sm">
                      avg {stats.storyboard?.total_duration_accuracy_pct?.avg > 0 ? "+" : ""}{stats.storyboard?.total_duration_accuracy_pct?.avg ?? 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Quality Tags */}
          {tagFreq && (
            <section>
              <h2 className="text-lg font-medium mb-3">Quality Tags</h2>
              {(["outline", "storyboard"] as const).map(layer => {
                const tags = tagFreq[layer];
                if (!tags || Object.keys(tags).length === 0) return null;
                const sorted = Object.entries(tags).sort((a, b) => b[1].count - a[1].count);
                const total = report.videos_completed as number;
                return (
                  <div key={layer} className="mb-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 capitalize">{layer}</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50"><tr>
                          <th className="text-left px-3 py-2 font-medium">Tag</th>
                          <th className="text-left px-3 py-2 font-medium">Count</th>
                          <th className="text-left px-3 py-2 font-medium">Videos</th>
                        </tr></thead>
                        <tbody>
                          {sorted.map(([tag, data]) => (
                            <tr key={tag} className="border-t">
                              <td className="px-3 py-2 font-mono text-xs">{tag}</td>
                              <td className="px-3 py-2">
                                <Badge variant={data.count >= 3 ? "destructive" : "secondary"} className="text-xs">
                                  {data.count}/{total}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{data.videos.join(", ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Run History */}
          {history && history.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">Run History</h2>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Prompts</th>
                    <th className="text-left px-3 py-2 font-medium">Outline Tags</th>
                    <th className="text-left px-3 py-2 font-medium">SB Tags</th>
                  </tr></thead>
                  <tbody>
                    {[...history].reverse().map((h, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-xs">{new Date(h.timestamp).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-xs font-mono">{h.prompt_versions.director?.replace("storyboard_director_prompt_", "dir_")}, {h.prompt_versions.writer?.replace("storyboard_writer_prompt_", "wr_")}</td>
                        <td className="px-3 py-2 text-xs">{h.total_tag_count.outline}</td>
                        <td className="px-3 py-2 text-xs">{h.total_tag_count.storyboard}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/GoldSetEval.tsx
git commit -m "feat(eval): add Single/Batch tabs, gold set dropdown, batch tab with stats+tags+history"
```

---

### Task 11: Batch Diffs page

**Files:**
- Create: `frontend/src/components/admin/BatchDiffs.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create BatchDiffs component**

```tsx
// frontend/src/components/admin/BatchDiffs.tsx
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ChevronRight, ChevronDown, ArrowLeft } from "lucide-react";
import {
  MetricCard,
  SectionDiff,
  StoryboardDiff,
  type EvalData,
} from "./eval-components";

interface BatchReport {
  gold_sets_run: string[];
  videos_completed: number;
}

interface DiffRowProps {
  name: string;
}

function DiffRow({ name }: DiffRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    if (!expanded && !data) {
      setLoading(true);
      fetch(`/api/eval/gold-set/${name}`)
        .then(r => r.json())
        .then(j => { if (j.success) setData(j.data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    setExpanded(!expanded);
  };

  const analysis = data?.analysis;
  const judge = data?.judge;

  // Summary stats for collapsed view
  const secGold = analysis?.director.section_count.gold ?? "?";
  const secAi = analysis?.director.section_count.ai ?? "?";
  const scrGold = analysis?.writer_path_b.screen_count.gold ?? "?";
  const scrAi = analysis?.writer_path_b.screen_count.ai ?? "?";
  const tagCount = judge
    ? Object.values(judge.outline_quality ?? {}).reduce((s, d) => s + (d.tags?.length ?? 0), 0) +
      Object.values(judge.storyboard_quality ?? {}).reduce((s, d) => s + (d.tags?.length ?? 0), 0)
    : 0;

  return (
    <div className="border rounded-lg">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-medium text-sm flex-1">{name}</span>
        {data && (
          <span className="text-xs text-muted-foreground font-mono">
            Sec: {secGold}→{secAi}  Scr: {scrGold}→{scrAi}  Tags: {tagCount}
          </span>
        )}
        {!data && !loading && <span className="text-xs text-muted-foreground">Click to load</span>}
        {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
      </button>

      {expanded && data && (
        <div className="px-4 pb-4 space-y-6 border-t">
          {/* Quality Tags */}
          {judge && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Quality Tags</h3>
              <div className="space-y-2">
                {(["outline_quality", "storyboard_quality"] as const).map(layerKey => {
                  const layer = judge[layerKey];
                  if (!layer) return null;
                  const hasTags = Object.values(layer).some(d => d.tags?.length > 0);
                  if (!hasTags) return null;
                  return (
                    <div key={layerKey}>
                      <span className="text-xs font-medium text-muted-foreground capitalize">
                        {layerKey.replace("_quality", "")}
                      </span>
                      {Object.entries(layer).map(([dim, d]) => {
                        if (!d.tags?.length) return null;
                        return (
                          <div key={dim} className="ml-2 mt-1">
                            <span className="text-xs">
                              <span className="font-mono">{dim}</span>:{" "}
                              {d.tags.map((t, i) => (
                                <Badge key={i} variant="destructive" className="text-xs mr-1">{t}</Badge>
                              ))}
                            </span>
                            {d.notes && <p className="text-xs text-muted-foreground ml-2 mt-0.5">"{d.notes}"</p>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Outline Diff */}
          {analysis && (
            <div>
              <h3 className="text-sm font-medium mb-2">Outline — Gold vs AI</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <MetricCard label="Sections" gold={analysis.director.section_count.gold} ai={analysis.director.section_count.ai} />
                <MetricCard label="Total Duration" gold={`${analysis.director.gold_duration_sec}s`} ai={analysis.director.ai_duration_estimate} />
                <MetricCard
                  label="Talking Points"
                  gold={data.gold.outline.reduce((s, sec) => s + sec.talking_points.length, 0)}
                  ai={analysis.director.ai_sections.reduce((s, sec) => s + sec.talking_points.length, 0)}
                />
              </div>
              <SectionDiff gold={data.gold.outline} aiSections={analysis.director.ai_sections} />
            </div>
          )}

          {/* Storyboard Diff */}
          {data.writer_output_path_b && analysis && (
            <div>
              <h3 className="text-sm font-medium mb-2">Storyboard — Gold vs AI</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <MetricCard label="Screens" gold={analysis.writer_path_b.screen_count.gold} ai={analysis.writer_path_b.screen_count.ai} />
                <MetricCard label="Avg Words/Screen" gold={analysis.writer_path_b.avg_words_per_screen.gold} ai={analysis.writer_path_b.avg_words_per_screen.ai} />
                <MetricCard label="Total Words" gold={analysis.writer_path_b.total_words.gold} ai={analysis.writer_path_b.total_words.ai} />
              </div>
              <StoryboardDiff gold={data.gold.storyboard} ai={data.writer_output_path_b} pathLabel="Gold Outline → Writer" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BatchDiffs() {
  const [report, setReport] = useState<BatchReport | null>(null);

  useEffect(() => {
    fetch("/api/eval/batch/report")
      .then(r => r.json())
      .then(j => { if (j.success) setReport(j.report); })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/admin/gold-set-eval#batch" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Batch
        </Link>
        <h1 className="text-2xl font-semibold">
          Batch Diffs — {report?.videos_completed ?? 0} gold sets
        </h1>
      </div>

      {!report && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No batch report found. Run a batch evaluation first.</p>
        </Card>
      )}

      {report && (
        <div className="space-y-2">
          {report.gold_sets_run.map(name => (
            <DiffRow key={name} name={name} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

Add import and route:

```tsx
// After existing import
import BatchDiffs from "@/components/admin/BatchDiffs";

// Add route after the gold-set-eval route (line 109):
<Route path="/admin/gold-set-eval/diffs" element={<BatchDiffs />} />
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/BatchDiffs.tsx frontend/src/App.tsx
git commit -m "feat(eval): add Batch Diffs page with foldable per-project comparisons"
```

---

### Task 12: Smoke test the full flow

- [ ] **Step 1: Start backend**

```bash
cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8001
```

- [ ] **Step 2: Start frontend**

```bash
cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run dev
```

- [ ] **Step 3: Manual verification**

1. Navigate to `/admin/gold-set-eval` — verify tabs appear (Single / Batch)
2. Single tab: verify dropdown shows `feynman_technique`, existing eval page works
3. Batch tab: verify "No batch results yet" empty state
4. Click "Run Batch" — verify progress updates, results load when done
5. Click "View Diffs →" — verify navigates to `/admin/gold-set-eval/diffs`
6. Expand a gold set row — verify outline diff and storyboard diff load
7. Verify quality tags render if judge ran

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(eval): complete batch gold set evaluation system"
```

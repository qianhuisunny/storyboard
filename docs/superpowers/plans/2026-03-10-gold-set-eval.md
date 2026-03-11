# Gold Set Evaluation Tool — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Dev tool to run Director/Writer against gold standard videos and display comparison results with cached outputs.

**Architecture:** Backend util runs agents, caches results as JSON. Two API endpoints (GET cached, POST re-run). Frontend page under /admin shows raw outputs → diff → analysis.

**Tech Stack:** FastAPI, React + Tailwind + shadcn/ui, existing agent classes.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `backend/app/services/eval_gold_set.py` | Util: run agents, compute analysis, cache results |
| `backend/app/main.py` | Two endpoints: GET + POST `/api/eval/gold-set/{name}` |
| `frontend/src/components/admin/GoldSetEval.tsx` | Eval page: raw outputs, diff, analysis |
| `frontend/src/App.tsx` | Add route `/admin/gold-set-eval` |
| `data/gold_sets/{name}/gold_standard.json` | Gold standard data (already exists) |
| `data/gold_sets/{name}/cached_eval.json` | Cached eval result |

---

## Chunk 1: Backend Util + Endpoints

### Task 1: Backend util — `eval_gold_set.py`

**Files:**
- Create: `backend/app/services/eval_gold_set.py`
- Read: `data/gold_sets/eval_gold_set.py` (existing CLI script to refactor from)

- [ ] **Step 1: Create `eval_gold_set.py` with core functions**

Functions:
- `load_gold_set(name) -> dict` — loads gold_standard.json
- `brief_to_story_brief(brief) -> dict` — converts gold brief format to agent format
- `gold_outline_to_director_text(outline) -> str` — converts gold outline to Director plain text
- `run_eval(name) -> dict` — runs Director + Writer (both paths), returns full result
- `get_cached_eval(name) -> dict | None` — returns cached result if exists
- `compute_analysis(gold, director_output, writer_output_b, writer_output_a) -> dict` — deterministic analysis

Return schema:
```json
{
  "gold_set_name": "feynman_technique",
  "timestamp": "2026-03-10T20:50:49",
  "gold": { "brief": {...}, "outline": [...], "storyboard": [...] },
  "director_output": "Section 1 — ...",
  "writer_output_path_b": [...],
  "writer_output_path_a": [...],
  "analysis": {
    "director": {
      "section_count": { "gold": 6, "ai": 5 },
      "total_duration": { "gold_sec": 361, "ai_estimate": "10:30-13:00" },
      "talking_point_specificity": "low",
      "evidence_specificity": "low",
      "has_narrative_hook": false,
      "filler_sections": ["Section 3"]
    },
    "writer_path_b": {
      "screen_count": { "gold": 7, "ai": 18 },
      "avg_words_per_screen": { "gold": 175, "ai": 37 },
      "total_words": { "gold": 1230, "ai": 677 },
      "screen_type_distribution": { "gold": {...}, "ai": {...} },
      "filler_phrases_found": ["Let's explore..."],
      "duration_total": { "gold_sec": 361, "ai_sec": 361 }
    },
    "writer_path_a": { ... same shape ... },
    "summary": [
      "Director ignores duration constraint (10+ min vs 6 min target)",
      "Writer screens too thin (37 words avg vs 175 gold avg)",
      "..."
    ]
  }
}
```

- [ ] **Step 2: Implement caching** — save to `data/gold_sets/{name}/cached_eval.json`, load on GET

- [ ] **Step 3: Commit**

### Task 2: API endpoints in main.py

**Files:**
- Modify: `backend/app/main.py` (add 2 endpoints at bottom)

- [ ] **Step 1: Add GET endpoint** — `GET /api/eval/gold-set/{name}` returns cached result or 404
- [ ] **Step 2: Add POST endpoint** — `POST /api/eval/gold-set/{name}` runs eval, caches, returns result
- [ ] **Step 3: Commit**

---

## Chunk 2: Frontend Page

### Task 3: GoldSetEval page

**Files:**
- Create: `frontend/src/components/admin/GoldSetEval.tsx`
- Modify: `frontend/src/App.tsx` (add route)

Layout (vertical scroll):
1. Header: gold set name + "Re-run" button + timestamp of last run
2. **Director Output** — raw text in monospace pre block
3. **Writer Output (Path B)** — screen cards (screen_type badge, voiceover, visual_direction, action_notes, duration)
4. **Outline Diff** — side-by-side: gold sections left, AI sections right, section by section
5. **Storyboard Diff** — side-by-side: gold screens left, AI screens right, screen by screen
6. **Analysis** — metrics cards + summary bullets

- [ ] **Step 1: Create GoldSetEval.tsx** with data fetching (GET on load, POST on re-run button)
- [ ] **Step 2: Section 1+2 — Raw Director + Writer outputs**
- [ ] **Step 3: Section 3 — Outline diff (side by side)**
- [ ] **Step 4: Section 4 — Storyboard diff (side by side)**
- [ ] **Step 5: Section 5 — Analysis section**
- [ ] **Step 6: Add route in App.tsx + nav link in header**
- [ ] **Step 7: Commit**

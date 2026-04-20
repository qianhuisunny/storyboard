# Plotline — AI-Powered Storyboard Creation Platform

Plotline transforms briefs and documents into structured, production-ready video storyboards through a multi-agent AI pipeline with human-in-the-loop quality gates.

Users upload a brief → a 3-round guided interview extracts intent, audience, and content spine → AI generates a section-level outline → quality gate scores and optionally retries → AI expands into screen-by-screen storyboard with voiceover, visual direction, and timing → user refines via direct editing.

## What It Does

- **3-round guided briefing** — structured interview that extracts topic, audience, POV, talking points, and content spine. No blank-page problem.
- **Multi-agent pipeline** — BriefBuilder → StoryboardDirector → QualityGate → StoryboardWriter → QualityGate. Each agent has a dedicated prompt and a single responsibility.
- **Quality gate with auto-retry** — LLM-based evaluation scores outlines and storyboards on 6 dimensions (flow coherence, specificity retention, source fidelity, etc.). Below 7.0/10 triggers automatic retry with targeted feedback.
- **Duration alignment** — DurationCalculator computes spoken duration from word count (130 wpm + screen-type complexity buffer). Writer retry loop ensures total duration stays within 10% of brief target. Overlong voiceovers are auto-split at sentence boundaries.
- **Human-in-the-loop gating** — approve, edit, or send back at every stage. Outline and storyboard are fully editable before moving forward.
- **Quality log** — every generation, evaluation, override, and approval is logged with causal chains (parent_id linking generate → eval → retry → approve).

## Architecture

```
Frontend (React/Vite :3000)
  ↓ /api proxy
Backend (FastAPI :8001)
  ↓
Orchestrator → State Machine (18 event handlers, SQLite-backed)
  ├── BriefBuilder (3-round guided interview, LLM on round 3 only)
  ├── StoryboardDirector (section-level outline with duration budgets)
  ├── QualityGate (6-dimension LLM evaluation, auto-retry)
  ├── StoryboardWriter (screen-by-screen expansion, duration retry loop)
  └── DurationCalculator (deterministic: word_count / 2.2 wps + buffer)
  ↓
SQLite (projects, pipeline_states, stage_snapshots, uploads, quality_log)
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, Clerk auth |
| Backend | FastAPI, Python 3.10, SQLAlchemy async + aiosqlite |
| AI | OpenAI GPT-4o (all agents + quality gate) |
| Persistence | SQLite — projects, pipeline state, stage snapshots, quality log |
| Deployment | Fly.io (separate backend + frontend services) |

## Agent Pipeline

```
BriefBuilder         → structures creative brief from 3-round interview
      ↓ brief
StoryboardDirector   → section-level outline with duration budgets, talking points
      ↓ outline
      [QualityGate]  → 6-dimension eval (flow, sharpness, evidence, alignment, necessity, completeness)
      ↓ graded outline
StoryboardWriter     → screen-by-screen voiceover, visual direction, action notes
      ↓ storyboard
      [QualityGate]  → 6-dimension eval (progression, context rot, specificity, fidelity, redundancy, handoff)
      ↓ final storyboard
```

Each agent has a matching prompt file in `prompts/` and inherits from `BaseAgent` (prompt loading, LLM calls, JSON extraction).

## Pipeline State Machine

```
intake → brief_round1 → brief_round2 → brief_round3 → brief_review
  → gate1 (brief locked) → outline → gate2 (outline locked)
  → write → review → done
```

Events: `submit_knowledge_share`, `round1_confirm`, `round2_confirm`, `round3_confirm`, `brief_approve`, `approve`, `edit`, `refine_outline`, `regenerate_section`, `restart`.

## Quick Start

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

App at `http://localhost:3000`, API proxied to `:8001`.

### Environment Variables

Create `backend/.env`:
```env
OPENAI_API_KEY=sk-proj-...
```

### Tests
```bash
cd backend
source venv/bin/activate
python -m pytest app/test/ -v --ignore=app/test/test_models.py
```

54 tests covering: golden path, state transitions, field writeback regressions, quality gate, quality log causal chains, duration matrix (10 timing scenarios), outline contract validation.

## Project Structure

```
├── frontend/src/
│   ├── components/        # Stage components (BriefBuilder, OutlineBuilder, DraftBuilder, ReviewBuilder)
│   ├── hooks/             # useAnalytics, useProjectState
│   └── components/admin/  # AdminDashboard, DriftDetailPage, PromptBench
├── backend/app/
│   ├── main.py            # FastAPI endpoints (~30 routes)
│   ├── services/
│   │   ├── agents/        # BriefBuilder, StoryboardDirector, StoryboardWriter, DurationCalculator
│   │   ├── orchestrator.py # Pipeline coordinator (18 event handlers)
│   │   ├── state.py       # State machine + SQLite persistence
│   │   └── quality_gate.py # LLM-based evaluation with retry
│   ├── infra/
│   │   └── quality_log.py # Event logging (generate, eval, override, approve)
│   ├── db/                # SQLAlchemy models + async engine
│   └── test/              # 54 tests (pytest + pytest-asyncio)
├── prompts/               # System prompts for each agent (versioned, ~7k lines)
├── data/                  # SQLite DB + uploads (gitignored)
└── CLAUDE.md              # Operating manual for AI-assisted development
```

## Codebase Stats

- ~20k lines TypeScript/React (107 files)
- ~16k lines Python (backend)
- ~7k lines prompt engineering (versioned .md files)
- ~2.4k lines tests (54 tests)
- 3+ months of development

## Deployment

```bash
fly deploy --config fly.backend.toml     # backend
cd frontend && npm run build
fly deploy --config fly.frontend.toml    # frontend (nginx)
```

## Validation

- Demo to 30+ decision makers at CEdMA (March 2026) — vision resonated, 2 very excited
- 4 instructional designer user tests — each session led to 1 day of fixes
- 1 ID said they would buy a subscription

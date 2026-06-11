# Plotline — AI-Powered Storyboard & Video Creation Pipeline

Plotline transforms briefs and documents into structured, production-ready video storyboards — and renders them into finished videos. A multi-agent AI pipeline handles everything from content extraction to screen-by-screen storyboarding to video generation with multiple providers.

## What It Does

**Storyboard Generation**
- 3-round guided briefing extracts topic, audience, POV, talking points, and content spine
- Multi-agent pipeline: BriefBuilder → StoryboardDirector → QualityGate → StoryboardWriter → QualityGate
- Quality gate auto-retry: LLM scores on 6 dimensions, retries below 7.0/10
- Duration alignment: word count → spoken duration calculation with auto-split for overlong voiceovers
- Human-in-the-loop gating at every stage — approve, edit, or send back

**Video Generation**
- Storyboard → finished video with narration, visuals, and timed text overlays
- 3 render paths by screen type: talking head (avatar), slides (data visualization), stock video (B-roll)
- 2 talking-head providers: HeyGen Photo Avatar (lip-synced) or Seedance 2.0 (reference-to-video)
- Keyframe overlay system: timed text/icon overlays (stat, callout, quote, label, divider) composited via Remotion
- LLM-driven keyframe auto-generation from voiceover scripts
- Consistent narration voice across all panel types (OpenAI TTS)

## Architecture

```
Frontend (React/Vite :3000)
  ↓ /api proxy
Backend (FastAPI :8001)
  ├── Orchestrator → State Machine (18 event handlers, SQLite-backed)
  │   ├── BriefBuilder (3-round guided interview, LLM on round 3 only)
  │   ├── StoryboardDirector (section-level outline with duration budgets)
  │   ├── QualityGate (6-dimension LLM evaluation, auto-retry)
  │   ├── StoryboardWriter (screen-by-screen expansion, duration retry loop)
  │   └── DurationCalculator (deterministic: word_count / 2.2 wps + buffer)
  │
  └── Video Pipeline (python -m video generate)
      ├── TTS: OpenAI tts-1-hd for all panels
      ├── Keyframe Generator: LLM auto-generates overlay timing
      ├── TALKING_HEAD → HeyGen or Seedance 2.0 (configurable)
      ├── SLIDES → LLM template mapping → Remotion CLI render
      ├── STOCK_VIDEO → LLM → Pexels search → ffmpeg overlay
      ├── Keyframe Overlay → Remotion KeyframeOverlay composition
      └── Stitcher → ffmpeg normalize + concat → final.mp4
  ↓
SQLite (projects, pipeline_states, stage_snapshots, uploads, quality_log)
LLM Gateway (cost tracking, model routing via config/llm_config.json)
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, Clerk auth |
| Backend | FastAPI, Python 3.10, SQLAlchemy async + aiosqlite |
| AI | OpenAI GPT-4o (agents, quality gate, keyframe gen, template mapping) |
| Video | Remotion 4.x (slides + overlays), ffmpeg (stitching), OpenAI TTS |
| Video Providers | HeyGen (avatar lip sync), Seedance 2.0 / BytePlus ARK (AI video), Pexels (stock footage) |
| Infra | LLM Gateway (unified routing, cost logging, model switching) |
| Persistence | SQLite |
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

## Video Pipeline

```
storyboard.json
  ↓
[1] Parse panels → classify by screen_type
  ↓
[2] OpenAI TTS → consistent narrator voice for all panels
  ↓
[2.5] Auto-generate keyframe overlays (LLM, optional)
  ↓
[3] Render per panel:
    TALKING_HEAD → HeyGen lip sync (default) or Seedance reference-to-video
    SLIDES       → LLM picks Remotion template → Whisper alignment → render
    STOCK_VIDEO  → LLM query → Pexels search → download → ffmpeg overlay
  ↓
[3.5] Keyframe overlay post-processing (Remotion, optional)
    Base video + keyframes → stat/callout/quote/label/divider overlays
  ↓
[4] Stitch → normalize all clips to 1920x1080 25fps → concat → final.mp4
```

```bash
cd backend && source venv/bin/activate
python -m video generate --storyboard path/to/storyboard.json
python -m video generate --storyboard path/to/storyboard.json --enable-keyframe-overlay
python -m video generate --storyboard path/to/storyboard.json --talking-head-provider seedance --seedance-ref-image ref.png
```

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
OPENAI_API_KEY=sk-proj-...    # Required: agents, quality gate, TTS, keyframe gen
HEYGEN_API_KEY=...            # Optional: talking-head avatar generation
PEXEL_API_KEY=...             # Optional: stock video search
ARK_API_KEY=...               # Optional: Seedance 2.0 video generation
```

### Tests
```bash
cd backend
source venv/bin/activate
python -m pytest app/test/ -v --ignore=app/test/test_models.py
```

## Project Structure

```
├── frontend/src/
│   ├── components/           # Stage components (BriefBuilder, OutlineBuilder, DraftBuilder, ReviewBuilder)
│   ├── hooks/                # useAnalytics, useProjectState
│   └── components/admin/     # AdminDashboard, DriftDetailPage, PromptBench
├── backend/app/
│   ├── main.py               # FastAPI endpoints (~30 routes)
│   ├── services/
│   │   ├── agents/           # BriefBuilder, StoryboardDirector, StoryboardWriter
│   │   ├── orchestrator.py   # Pipeline coordinator (18 event handlers)
│   │   ├── state.py          # State machine + SQLite persistence
│   │   ├── quality_gate.py   # LLM-based evaluation with retry
│   │   └── video/
│   │       ├── pipeline.py   # Video generation orchestrator
│   │       ├── heygen.py     # HeyGen Photo Avatar client
│   │       ├── seedance.py   # Seedance 2.0 / BytePlus ARK client
│   │       ├── slides.py     # LLM template mapping + Remotion render
│   │       ├── stock_video.py # Pexels search + ffmpeg overlay
│   │       ├── overlay.py    # Keyframe overlay via Remotion
│   │       ├── keyframe_generator.py  # LLM keyframe auto-generation
│   │       ├── tts.py        # OpenAI TTS
│   │       ├── stitcher.py   # ffmpeg normalize + concat
│   │       ├── transcribe.py # Whisper word-level timestamps
│   │       └── remotion/src/ # React overlay components (Stat, Callout, Quote, Label, Divider)
│   ├── infra/
│   │   ├── llm_gateway.py    # Unified LLM router (cost tracking, model switching)
│   │   └── quality_log.py    # Event logging (generate, eval, override, approve)
│   ├── db/                   # SQLAlchemy models + async engine
│   └── test/                 # 54 tests
├── prompts/                  # System prompts for each agent (versioned)
├── config/
│   └── llm_config.json       # Model routing rules per category.label
├── data/                     # SQLite DB + uploads (gitignored)
└── CLAUDE.md                 # Operating manual for AI-assisted development
```

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

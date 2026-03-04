# CLAUDE.md — Plotline Operating Manual

> This file governs how Claude Code operates in this repository.
> Read this **before** doing anything.

---

## Identity

**Plotline** — AI-powered storyboard creation platform.
Users upload briefs/docs → multi-agent pipeline generates structured storyboards → users refine via chat.

## Pre-load
Please check progress.md for progress before start new session
Please always load lessons.md for previous errors
---

## Architecture at a Glance

```
User → Frontend (React/Vite :3000)
         ↓ /api proxy
       Backend (FastAPI :8001)
         ↓
       Orchestrator → Agent Pipeline
         ├── TopicResearcher
         ├── BriefBuilder  
         ├── StoryboardDirector
         ├── StoryboardWriter
         └── ImageResearcher
         ↓
       data/project_{id}/  (persisted JSON → migrating to Postgres)
```

### Key Directories

| Path | Purpose |
|------|---------|
| `frontend/src/components/` | React components (stages: BriefBuilder, OutlineBuilder, DraftBuilder, ReviewBuilder) |
| `backend/app/services/agents/` | Multi-agent system — each agent has a matching prompt in `prompts/` |
| `backend/app/services/orchestrator.py` | Pipeline coordinator — controls agent sequencing and state |
| `backend/app/services/state.py` | State machine for the storyboard creation flow |
| `backend/app/services/chatbot.py` | Chat assistant — direct OpenAI calls for sidebar refinement |
| `backend/config/llm_config.json` | Model selection and parameters |
| `prompts/` | System prompts for each agent (first-class, edit carefully) |
| `data/` | User-generated project data (gitignored, except `data/example/`) |

---

## Critical Rules

### ⛔ Never Do
- **Never commit `.env` files** — they contain API keys (OpenAI, Gemini, Google CSE)
- **Never delete `data/example/`** — it's the reference fixture for testing
- **Never change the port proxy without updating both sides** — frontend proxies `/api` → backend; mismatches break everything
- **Never install packages globally** — use `venv/` for Python, `npm` for frontend

### ⚠️ Be Careful
- **Agent changes are coupled** — modifying one agent's output schema likely breaks the next agent's input expectations. Trace the full pipeline: TopicResearcher → BriefBuilder → Director → Writer → DurationCalc → ImageResearcher
- **State machine transitions** — `state.py` controls flow. Changing states requires updating both backend transitions AND frontend `StageNavigation.tsx`
- **Timeout handling** — AI generation can take 2+ minutes. Don't reduce timeouts without testing
- **Data schema changes** — any change to project/story JSON schema must be backwards-compatible with existing projects in `data/`
- **Prompt changes** — any change to any files under `/prompts` directory should be using a different versioning, for example, `storyboard_direcotr_prompt_V0303` indicating today's date.

### ✅ Always Do
- **Run the backend with venv activated**: `cd backend && source venv/bin/activate`
- **Check `llm_config.json`** before changing model behavior — configuration lives there, not in code
- **Match prompt files to agent files** — every `backend/app/services/agents/*.py` has a corresponding `prompts/*.md`
- **Test with `data/example/`** before testing with live generation

---

## Task Lifecycle

### 1. Understand the Task
- Read this file and `PRD.md` for context
- Check `.taskmaster/` for existing task breakdown if using Task Master
- Identify which layer the task touches: frontend only, backend only, agent pipeline, or full-stack

### 2. Create a Branch
```bash
git checkout -b feature/task-description
```

### 3. Implement
- Work in the appropriate directory (don't scatter changes)
- If touching agents: trace the full pipeline input/output chain before coding
- If touching frontend stages: check corresponding backend endpoint + state machine

### 4. Test Before Committing
```bash
# Backend
cd backend
source venv/bin/activate
python -m pytest app/test/ -v          # unit tests
uvicorn app.main:app --port 8001       # manual smoke test

# Frontend  
cd frontend
npm run dev                             # visual verification
npm run build                           # catch TypeScript errors
```

### 5. Commit with Context
```bash
git add -A
git commit -m "feat(agents): add fallback for empty researcher results

- Added null check in TopicResearcher output
- Updated BriefBuilder to handle missing context gracefully  
- Tested with data/example/ fixture"
```

### 6. Merge to Main
```bash
git fetch origin && git rebase origin/main
# If conflicts: resolve, then git rebase --continue
git checkout main && git merge feature/task-description
git push origin main
```

### 7. Log Lessons (Optional)
If you hit a non-obvious issue, append to `PROGRESS.md`:
```markdown
## [Date] — Issue Description
**Problem**: What broke
**Root Cause**: Why it broke  
**Fix**: What solved it
**Prevention**: How to avoid it next time
```

---

## Development Quick Start

### Backend
```bash
cd backend
python3 -m venv venv          # first time only
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install                    # first time only
npm run dev                    # starts on :3000, proxies /api → :8001
```

### Both (typical dev session)
Terminal 1: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8001`
Terminal 2: `cd frontend && npm run dev`

---

## API Surface (Key Endpoints)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/create-project` | Initialize new storyboard project |
| `GET` | `/api/project/{id}` | Fetch project + stories |
| `GET` | `/api/projects?user_id=` | List all projects for a user |
| `POST` | `/api/project/{id}/start` | Start pipeline with intake form |
| `POST` | `/api/project/{id}/event` | Process state machine event (approve/reject/refine) |
| `GET` | `/api/project/{id}/pipeline-state` | Get current pipeline phase + data |
| `POST` | `/api/project/{id}/stages` | Auto-save stage data |
| `GET` | `/api/project/{id}/stages` | Load stage data |
| `POST` | `/api/chat` | Send message to AI chatbot |
| `POST` | `/api/chat/save` | Persist chat history |
| `GET` | `/api/chat/history/{id}` | Load chat history |
| `POST` | `/api/search/images` | Google image search with filters |
| `GET` | `/health` | Health check |

---

## Agent Pipeline Reference

The storyboard generation pipeline runs sequentially. Each agent consumes the previous agent's output:

```
TopicResearcher    → researches the topic from user input
      ↓ research_context
BriefBuilder       → structures a creative brief  
      ↓ brief
StoryboardDirector → determines scene structure and flow
      ↓ outline
StoryboardWriter   → writes detailed screen-by-screen content
      ↓ draft_screens
DurationCalculator → calculates timing (word_count / 130 * 60s)
      ↓ timed_screens  
ImageResearcher    → finds/suggests images for each screen
      ↓ final_storyboard
```

**Prompt ↔ Agent mapping:**

| Agent File | Prompt File |
|-----------|------------|
| `agents/topic_researcher.py` | `prompts/TOPIC_RESEARCHER_SYSTEM_PROMPT.md` |
| `agents/brief_builder.py` | `prompts/BRIEF_BUILDER_SYSTEM_PROMPT.md` |
| `agents/storyboard_director.py` | `prompts/storyboard_director_prompt.md` |
| `agents/storyboard_writer.py` | `prompts/storyboard_writer_prompt_2.md` |
| `agents/duration_calculator.py` | `prompts/duration_calculator_prompt.md` |
| `agents/image_researcher.py` | `prompts/image_researcher_prompt_1.md` |

---

## Environment Variables

### Backend (`backend/.env`)
```env
OPENAI_API_KEY=sk-proj-...        # OpenAI (primary LLM)
GEMINI_API_KEY=AIzaSy...          # Google Gemini (secondary)
GOOGLE_CSE_API_KEY=AIzaSy...      # Google Custom Search (images)
SEARCH_ENGINE_ID=671cee...        # Custom Search Engine ID
```

Never commit these. They're in `.gitignore`.

---

## Deployment

Deployed on **Fly.io** with separate services:
- `fly.backend.toml` → backend service
- `fly.frontend.toml` → frontend service (nginx serving built React)

```bash
# Deploy backend
fly deploy --config fly.backend.toml

# Deploy frontend  
cd frontend && npm run build
fly deploy --config fly.frontend.toml
```

---

## Known Gotchas

1. **Port mismatch**: `vite.config.ts` proxies to port 8000 but backend runs on 8001. Either update the proxy or run backend on 8000.
2. **Generation timeout**: Agent pipeline requests can take 2+ minutes. Frontend has loading states for this — don't reduce the timeout.
3. **JSON extraction**: AI responses sometimes return malformed JSON. `utils/json_extractor.py` handles cleanup — if you see parsing errors, check there first.
4. **Image search rate limits**: Google CSE has daily quotas. The `image_search.py` utility handles failures gracefully but you'll get empty results when rate-limited.
5. **Two schema versions**: Legacy projects use `on_screen_visual_keywords` (string), new pipeline uses `visual_direction` (array). Both schemas coexist until schema unification is complete (task 102).
6. **Data is still local JSON**: All persistence currently writes to `data/project_{id}/`. DB migration is planned — see `RESTRUCTURE_PLAN.md` and task 103-105. Don't build new features on top of JSON file I/O.

---

## Lessons Management

The `lessons.markdown` file captures learnings from our collaboration. Follow these rules:

### 1. Update on Request
When the user asks to update `lessons.markdown`, do so immediately.

### 2. Summarize Before Commits
Before each commit or at the end of a working session, summarize the current conversation into `lessons.markdown`:
- What approaches/solutions were presented
- What the user corrected or redirected
- Key decisions made and their rationale
- Patterns to follow or avoid in the future

### 3. Reference in Planning & Execution
When planning or executing tasks:
- Read `lessons.markdown` first to understand past learnings
- Apply relevant lessons to avoid repeating mistakes
- Check if similar issues have been solved before

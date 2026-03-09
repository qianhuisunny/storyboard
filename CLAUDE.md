# CLAUDE.md — Plotline Operating Manual

> This file governs how Claude Code operates in this repository.
> Read this **before** doing anything.

---

## Thinking Principles

请使用第一性原理思考。你不能总是假设我非常清楚自己想要什么和该怎么得到。请保持审慎，从原始需求和问题出发，如果动机和目标不清晰，停下来和我讨论。如果目标清晰但是路径不是最短，告诉我，并且建议更好的办法。

---

## Identity

**Plotline** — AI-powered storyboard creation platform.
Users upload briefs/docs → multi-agent pipeline generates structured storyboards → users refine via chat.

## Pre-load
Please check PROGRESS.md for progress before starting a new session.

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
         └── StoryboardWriter
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
- **Agent changes are coupled** — modifying one agent's output schema likely breaks the next agent's input expectations. Trace the full pipeline: TopicResearcher → BriefBuilder → Director → Writer
- **State machine transitions** — `state.py` controls flow. Changing states requires updating both backend transitions AND frontend `StageNavigation.tsx`
- **Timeout handling** — AI generation can take 2+ minutes. Don't reduce timeouts without testing
- **Data schema changes** — any change to project/story JSON schema must be backwards-compatible with existing projects in `data/`
- **Prompt changes** — any change to any files under `/prompts` directory should be using a different versioning, for example, `storyboard_direcotr_prompt_V0303` indicating today's date.
- **API-Agent method coupling** — when writing endpoints in `main.py` that call agent methods, VERIFY the method exists in the agent class first. Don't assume methods exist. Read the agent file and check available methods before calling them.

### ✅ Always Do
- **Run the backend with venv activated**: `cd backend && source venv/bin/activate`
- **Check `llm_config.json`** before changing model behavior — configuration lives there, not in code
- **Match prompt files to agent files** — every `backend/app/services/agents/*.py` has a corresponding `prompts/*.md`
- **Test with `data/example/`** before testing with live generation
- **Verify API-to-Agent wiring** — after adding/modifying endpoints in `main.py` that call agent methods, test them with curl or Playwright to confirm the methods exist and work

### 📝 When Rewriting Code or Prompts
- **Delete old before adding new** — When rewriting a file, first identify and remove ALL outdated content. Don't add new content on top of old content. Read the full file, identify what's obsolete, delete it, then write the new version.
- **Trace the data flow first** — Before writing, map out: What does this component receive? → What does it produce? → Who consumes it? → What do they do with it?

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
StoryboardWriter   → writes detailed screen-by-screen content (includes duration calculation + placeholder images)
      ↓ final_storyboard
```

Note: Duration calculation (word_count / 130 * 60s) is now a utility function, not a separate agent.

**Prompt ↔ Agent mapping:**

| Agent File | Prompt File |
|-----------|------------|
| `agents/topic_researcher.py` | `prompts/TOPIC_RESEARCHER_SYSTEM_PROMPT.md` |
| `agents/brief_builder.py` | `prompts/BRIEF_BUILDER_SYSTEM_PROMPT.md` |
| `agents/storyboard_director.py` | `prompts/storyboard_director_prompt_v0311.md` |
| `agents/storyboard_writer.py` | `prompts/storyboard_writer_prompt_2.md` |

### Agent Structure Pattern

To add or modify an agent, you need to touch these 4 files:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Agent file** | `backend/app/services/agents/xx_agent.py` | Inherits from `BaseAgent`, sets `prompt_file`, implements `run()` |
| **Prompt file** | `prompts/XX_PROMPT.md` | System prompt loaded automatically via `prompt_file` attribute |
| **Export** | `backend/app/services/agents/__init__.py` | Add to imports and `__all__` list |
| **Registration** | `backend/app/services/orchestrator.py` | Add to `self.agents` dict + create handler |

**Minimal agent template:**
```python
# backend/app/services/agents/my_agent.py
from .base import BaseAgent

class MyAgent(BaseAgent):
    prompt_file = "MY_AGENT_PROMPT.md"  # auto-loads from /prompts/

    def run(self, state, **kwargs):
        response = self.call_llm(user_prompt)
        return self._extract_json(response)
```

**BaseAgent provides:**
- `self.call_llm(user_prompt, model, temperature, max_tokens)` — makes OpenAI API call with system prompt
- `self._extract_json(response)` — parses JSON from LLM response (handles markdown blocks)
- `self._validate_required_fields(data, required_fields)` — validates dict fields

**Note:** `DurationCalculator` is a utility function (no LLM calls), not an agent — it doesn't inherit from `BaseAgent`.

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

## Lessons Learned

### 2026-03-06: Verify API endpoints call methods that exist

**Context:** `main.py` had endpoints (`/research/angle`, `/research/run`) calling `TopicResearcher.calculate_angle()` and `TopicResearcher.run_with_angle()` — but these methods didn't exist. The agent had completely different methods (`generate_perspectives()`, `generate_talking_points()`, etc.). This was never caught because the endpoints weren't tested after being written.

**Root Cause:**
- API layer (main.py) and service layer (topic_researcher.py) were developed separately
- Method names in main.py were aspirational (what *should* exist) vs actual implementation
- No integration test or manual verification after writing the endpoints

**Lesson:**
- Before calling `agent.method()` in main.py, READ the agent file and verify the method exists
- After adding any endpoint that calls agent methods, TEST IT immediately (curl, Playwright, or Python script)
- When an agent's API changes, grep for all callers in main.py and update them
- Don't write endpoints assuming methods will be added later — implement the agent method first

---

### 2026-03-06: Don't duplicate system prompt content in function prompts

**Problem:** Agent functions included inline prompts with principles, formulas, examples, and output formats already defined in the system prompt file. LLM received the same instructions twice.

**Lesson:**
- System prompt = HOW (principles, formats, examples)
- Function prompt = WHAT (contextual data only)
- Reference the system prompt phase: `"Follow Phase 1 principles in your system prompt"`
- Never repeat system prompt content in function prompts

---

### 2026-03-06: React useEffect polling — don't put tracking state in dependencies

**Problem:** Processing log polling showed duplicate entries (e.g., `generate_perspectives` appeared 7 times). The `lastLogId` state was in the useEffect dependency array, causing a cascade: poll → update lastLogId → trigger useEffect → poll again.

**Lesson:**
- For values only used *inside* the effect (not for deciding *whether* to run), use `useRef` instead of `useState`
- Only include dependencies that should restart/stop the effect (e.g., `isActive`, `projectId`)
- Polling pattern: `useRef` for cursor/offset tracking, `useState` only for data to display

```tsx
// ❌ BAD: lastLogId in deps causes infinite re-triggers
const [lastLogId, setLastLogId] = useState(null);
useEffect(() => { ... }, [lastLogId]);

// ✅ GOOD: ref doesn't trigger re-renders
const lastLogIdRef = useRef(null);
useEffect(() => { ... }, [projectId, isActive]);
```

---

### 2026-03-03: Clean up dead code immediately

**Context:** When modifying `brief_builder.py` to make Rounds 1-2 return fields without LLM calls, I left `_call_llm_for_round1` and `_call_llm_for_round2` methods in the file even though they were no longer used.

**Lesson:**
- When removing a code path, immediately identify and remove all code that was only serving that path
- Don't leave orphaned methods/functions - they create confusion about what's actually used
- Proactively identify and flag dead/legacy code when reading a file, don't wait for the user to notice

---

### 2026-03-07: Frontend-backend state synchronization is critical

**Problem:** User clicked "Approve & Continue to Outline" but got error: `Invalid event 'brief_approve' for phase 'outline'`. The backend had already moved to `outline` phase, but frontend was still showing the approve button.

**Lesson:**
- Always fetch `/pipeline-state` on page load and check current phase
- Disable/hide actions that are no longer valid for the current backend phase
- Add state like `isBriefAlreadyApproved` to prevent showing stale action buttons
- Don't trust frontend-only state for multi-stage workflows — backend is source of truth

---

### 2026-03-07: React useState doesn't re-initialize when props change

**Problem:** `KnowledgeShareBriefBuilder` mounted with `currentRound=1`, then parent set `initialRound="review"` after async fetch, but `currentRound` stayed at `1` showing editable form instead of review.

**Root Cause:**
```tsx
const [currentRound, setCurrentRound] = useState(initialRound); // Only runs on MOUNT
```

**Lesson:**
- `useState(prop)` only uses the prop value on initial mount
- Add useEffect to sync state when props change:
```tsx
useEffect(() => {
  if (initialRound !== currentRound) setCurrentRound(initialRound);
}, [initialRound]);
```

---

### 2026-03-07: Don't return early without completing state updates

**Problem:** Initialization detected "project past brief stage" and returned early, but fields never got populated:
```tsx
if (stateData.phase === "outline") {
  console.log("Past brief stage");
  return; // BUG: briefFields never set!
}
```

**Lesson:**
- Before any early return, ensure all necessary state is set
- Pattern: set state THEN return
```tsx
if (stateData.phase === "outline") {
  setKnowledgeShareFields(briefFields); // Set first!
  setIsBriefAlreadyApproved(true);
  return;
}
```

---

### 2026-03-07: Navigate to appropriate stage, not saved stage

**Problem:** Opening a project where Stage 1 was "approved" still showed Stage 1 instead of navigating to Stage 2.

**Lesson:**
- When restoring project state, check if `currentStageId` points to an already-completed stage
- Auto-navigate to the first incomplete stage:
```tsx
if (currentStatus?.status === "approved") {
  const firstIncomplete = stages.find(s => s.status !== "approved");
  if (firstIncomplete) setCurrentStageId(firstIncomplete.id);
}
```

---

### 2026-03-07: Check prompts for duplicate and conflicting instructions

**Problem:** `storyboard_director_prompt.md` had the same instructions written twice — Output Schema appeared twice, Step 4/5 had redundant guidance, Voiceover Guidelines and Final Checklist were duplicated. This wastes tokens and can confuse the LLM with potentially conflicting wording.

**Lesson:**
- Before editing prompts, read the ENTIRE file and identify duplicate sections
- When creating prompts, use clear section headers and don't repeat content
- Periodically audit prompts for bloat — streamline to single source of truth
- Use versioned prompt files (e.g., `_v0307.md`) when making significant changes

---

### 2026-03-07: Verify backend health after making changes

**Problem:** After updating the storyboard director prompt file, the backend crashed because `storyboard_writer_prompt_2.md` was missing. I didn't notice until the user tried to load "My Projects" and it hung.

**Lesson:**
- After making backend-related changes (especially prompt files), run: `curl localhost:8001/health`
- If the health check fails or times out, check the backend logs immediately
- Don't assume the backend is still running just because it was running before

---

### 2026-03-07: Verify all required prompt files exist

**Problem:** The `storyboard_writer.py` agent referenced `storyboard_writer_prompt_2.md`, but this file was missing from the prompts directory. The backend crashed on startup.

**Lesson:**
- When touching the agent/prompt system, verify all `prompt_file` references resolve to actual files
- Quick check: `grep -r "prompt_file" backend/app/services/agents/` then verify each file exists
- If a prompt file is deleted/renamed, update all agent references

---

### 2026-03-07: Trace full data flow when fixing display issues

**Problem:** Input tab showed "No data" even after fixing `previousStageOutput` to use `humanVersion`. Missed that `research_details` needed to flow through: Backend API → StageLayout → StageContent → OutlineBuilder → InputView.

**Lesson:**
- When fixing data display issues, map the entire flow: Source (API) → Intermediate components → Destination (UI)
- Check each link in the chain: Is the data being passed? Is the prop defined? Is the component using it?
- Don't assume fixing one link fixes the whole chain

---

### 2026-03-08: Separate orthogonal concepts — screen_type vs narrative_role

**Problem:** `ScreenType` conflated two orthogonal dimensions: visual format (slides, stock_footage) and story function (hook, cta). `cta` was in screen_type but it's a narrative function — a CTA screen could visually be slides or stock_footage.

**Lesson:**
- When a type enum mixes concerns, split into orthogonal fields
- `screen_type` = what the viewer sees (7 visual formats)
- `narrative_role` = what the screen does in the story (hook, body sections, takeaway, cta)
- Semi-structured approach: fixed skeleton (hook/takeaway/cta) + free-form body sections named from brief's `core_talking_points`
- When removing a value from a type enum (like `cta`), add legacy mapping: if `screen_type === "cta"`, set `screen_type = "slides"` and `narrative_role = "cta"`

---

### 2026-03-08: Don't let LLMs compute what can be computed deterministically

**Problem:** The Director LLM was asked to output `target_duration_sec` for each screen, but duration is deterministic: word_count / speaking_rate + complexity_buffer. LLMs are unreliable at arithmetic.

**Lesson:**
- If a value can be computed from other fields (word count → duration), compute it server-side
- Remove computation instructions from LLM prompts — fewer fields = fewer errors
- Use utility classes like `DurationCalculator` for deterministic post-processing
- LLM outputs only what requires judgment (narrative structure, voiceover text, screen type)

---

### 2026-03-08: Global renames — use sed, verify edge cases

**Problem:** Renaming `target_duration_sec` → `duration` across 21+ files. After sed, found `story.duration || story.Duration || story.duration` — a tautological duplicate from the rename.

**Lesson:**
- After global sed renames, grep for the new name and check for duplicates/tautologies
- Watch for `old_name || legacy_fallback || old_name` patterns that become `new_name || legacy_fallback || new_name`
- Run `npm run build` after frontend renames to catch TypeScript errors immediately

---

### 2026-03-08: UI design — use subtle accents, not heavy colored backgrounds

**Problem:** Used full colored backgrounds (bg-blue-50, bg-green-50) for grouped section headers. Looked garish and noisy — user referenced SessionLab's clean workshop planning UI.

**Lesson:**
- For grouping/categorization, prefer subtle left-border accents (`border-l-4 border-l-violet-400`) over full background colors
- Keep group headers minimal: chevron + label + metadata, no colored backgrounds
- Use muted/foreground text colors, not colored text
- Reference professional tools (SessionLab, Notion, Linear) for design patterns, not dashboards

---

### 2026-03-08: Status messages should be lightweight, not full chat bubbles

**Problem:** Research Chat rendered every status update ("Searching...", "Analyzing...") as a full chat bubble with "Research Assistant" label, avatar, and timestamp. Made the UI noisy and hard to scan.

**Lesson:**
- Status/progress messages should be lightweight inline lines: icon + short text, no bubble wrapper
- Only final "result" messages (perspectives, talking points) deserve full bubble treatment
- Reference: design tools show streaming status as stacked lines ("Searching for inspiration: all styles", "Exploring 4 designs")
- Use the ChatMessage `type` field to conditionally render: `"status"` → inline line, `"system"` → full bubble

---

### 2026-03-08: Make AI-generated options editable, not just accept/reject

**Problem:** Perspective angle selector showed 3 AI-generated options as read-only clickable cards. Users could only accept one as-is or write a fully custom angle from scratch — no middle ground.

**Lesson:**
- When presenting AI-generated suggestions (angles, talking points, outlines), make the text editable inline
- Users often want to tweak an AI suggestion rather than accept verbatim or start over
- Pattern: editable textarea pre-filled with AI text + "Use this" button per option
- Don't force binary accept/reject on AI output — let users refine in-place

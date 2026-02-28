# PROGRESS.md — Lessons Learned

> Append non-obvious issues and solutions here so they don't get lost.
> Claude Code: check this file before debugging recurring issues.

---

## 2026-02-22 — CLAUDE.md and AGENTS.md were hardlinked
**Problem**: Writing to AGENTS.md also overwrote CLAUDE.md — both files shared the same inode (hardlink, not copy).
**Root Cause**: At some point `cp -l` or a similar operation linked them instead of duplicating.
**Fix**: Moved AGENTS.md to break the link, then recreated CLAUDE.md fresh.
**Prevention**: Don't create multiple copies of operating docs. One source of truth: `CLAUDE.md`.

## 2026-02-22 — Langflow removal
**Problem**: chatbot.py was entirely a Langflow HTTP client (API URL construction, x-api-key headers, Langflow-specific response parsing). Dead code since the multi-agent pipeline replaced it.
**Root Cause**: Original hackathon used Langflow as AI backend. Never cleaned up after switching to direct OpenAI.
**Fix**: Rewrote chatbot.py as a simple OpenAI chat wrapper. Kept ChatRequest/ChatResponse/ChatMessage models so main.py imports didn't break. Deleted langflow_env/ and AGENTS.md.
**Prevention**: When replacing a major dependency, grep the entire repo and clean up in the same PR.

## 2026-02-22 — Two competing screen schemas
**Problem**: `json_extractor.py` and `storyboard_writer.py` define different screen schemas. Legacy uses `on_screen_visual_keywords` (string), new pipeline uses `visual_direction` (array).
**Root Cause**: StoryboardWriter was built as a new agent without updating the extractor's validation model.
**Fix**: Pending — task 102 will create one canonical `StoryboardScreen` in `models/screen.py`.
**Prevention**: All Pydantic models should live in `models/`, not inline in utility files.

## 2026-02-22 — DB migration approach simplified
**Problem**: Originally planned a 7-phase dual-write migration with gradual cutover.
**Root Cause**: Overcomplicated — Plotline is pre-launch with zero live users.
**Fix**: Simplified to two steps: (1) migration script maps existing JSON → Postgres, verify then delete, (2) all new projects write to DB directly.
**Prevention**: Match infrastructure complexity to actual deployment context. Pre-launch ≠ production.

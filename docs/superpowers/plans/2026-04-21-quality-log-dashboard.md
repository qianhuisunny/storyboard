# Quality Log Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-project quality log visualization dashboard showing causal chains of generate → eval → override → approve events as a vertical timeline with a metadata detail panel.

**Architecture:** Backend seed script inserts realistic fixture data into the `quality_log` SQLite table. A new backend endpoint returns entries grouped into causal chains. A new React page renders chains as collapsible timeline nodes; clicking a node shows full metadata in a right-side panel. Scores use number + color (green/yellow/red).

**Tech Stack:** Python (seed script, FastAPI endpoint), React + TypeScript + Tailwind + shadcn/ui (Card, Badge, ScrollArea, Accordion), Lucide icons.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `backend/scripts/seed_quality_log.py` | Insert realistic fixture chains into quality_log table |
| `backend/app/main.py` | New endpoint: `/api/quality-log/{project_id}/chains` — returns entries grouped into causal chains |
| `backend/app/test/test_quality_log_chains.py` | Tests for the chain-grouping logic |
| `frontend/src/components/admin/QualityLogDashboard.tsx` | Main page: timeline + detail panel layout |
| `frontend/src/components/admin/quality-log/ChainTimeline.tsx` | Vertical timeline rendering collapsible chains |
| `frontend/src/components/admin/quality-log/EventNode.tsx` | Single event node in the timeline (icon, label, summary) |
| `frontend/src/components/admin/quality-log/EventDetail.tsx` | Right-side detail panel for selected event |
| `frontend/src/components/admin/quality-log/ScoreDisplay.tsx` | Number + color badge for eval scores |
| `frontend/src/App.tsx` | Add route `/admin/quality-log/:projectId` |

---

### Task 1: Seed Script — Realistic Fixture Data

**Files:**
- Create: `backend/scripts/seed_quality_log.py`

This script inserts two complete pipeline runs for a fixture project, covering the full range of events: a retry chain (generate → eval fail → generate retry → eval pass → approve) and a clean pass chain, plus an override event.

- [ ] **Step 1: Create the seed script**

```python
"""Seed quality_log with realistic fixture data for dashboard development."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from app.infra.quality_log import QualityLog

FIXTURE_PROJECT = "fixture-quality-dash-001"

OUTLINE_SCORES_FAIL = {
    "passed": False,
    "gut": {"score": 5.5, "feedback": "Structure is too linear, no narrative tension"},
    "dimensions": [
        {"dimension": "narrative_structure", "score": 5.0, "feedback": "Flat progression"},
        {"dimension": "audience_alignment", "score": 6.0, "feedback": "Mostly on target"},
        {"dimension": "content_coverage", "score": 7.0, "feedback": "Good breadth"},
        {"dimension": "visual_potential", "score": 5.5, "feedback": "Mostly talking head"},
        {"dimension": "pacing", "score": 6.0, "feedback": "Uneven section lengths"},
    ],
    "composite_score": 5.9,
    "attempt": 1,
    "total_attempts": 2,
}

OUTLINE_SCORES_PASS = {
    "passed": True,
    "gut": {"score": 8.0, "feedback": "Strong hook, clear arc, good visual variety"},
    "dimensions": [
        {"dimension": "narrative_structure", "score": 8.5, "feedback": "Clear problem-solution arc"},
        {"dimension": "audience_alignment", "score": 7.5, "feedback": "Well-targeted"},
        {"dimension": "content_coverage", "score": 8.0, "feedback": "Comprehensive"},
        {"dimension": "visual_potential", "score": 7.0, "feedback": "Good mix of screen types"},
        {"dimension": "pacing", "score": 8.0, "feedback": "Well-balanced sections"},
    ],
    "composite_score": 7.8,
    "attempt": 2,
    "total_attempts": 2,
}

STORYBOARD_SCORES = {
    "passed": True,
    "gut": {"score": 7.5, "feedback": "Solid storyboard, voiceover flows naturally"},
    "dimensions": [
        {"dimension": "voiceover_quality", "score": 8.0, "feedback": "Conversational tone"},
        {"dimension": "visual_direction", "score": 7.0, "feedback": "Clear direction"},
        {"dimension": "content_accuracy", "score": 8.5, "feedback": "Faithful to outline"},
        {"dimension": "screen_transitions", "score": 7.0, "feedback": "Mostly smooth"},
        {"dimension": "duration_balance", "score": 7.5, "feedback": "Good distribution"},
    ],
    "composite_score": 7.6,
    "attempt": 1,
    "total_attempts": 1,
}


def seed(db_path=None):
    kwargs = {"db_path": db_path} if db_path else {}
    qlog = QualityLog(**kwargs)

    import sqlite3
    conn = sqlite3.connect(qlog._db_path)
    conn.execute("DELETE FROM quality_log WHERE project_id = ?", (FIXTURE_PROJECT,))
    conn.commit()
    conn.close()

    t = time.time() - 300  # start 5 min ago

    # --- Outline chain: generate(fail) → eval → generate(retry) → eval(pass) → approve ---
    g1 = qlog.log_generate(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context='{"video_type": "knowledge_sharing", "topic": "CLI tools every developer needs", "audience": "junior developers", "tone": "casual, encouraging"}',
        raw_response='{"sections": [{"title": "Hook: The Terminal Is Your Friend", "screens": 2}, {"title": "Section 1: Navigation Basics", "screens": 3}]}',
        parsed_output={"sections": [{"title": "Hook: The Terminal Is Your Friend", "screens": 2}, {"title": "Section 1: Navigation Basics", "screens": 3}]},
    )

    e1 = qlog.log_eval(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context="brief + outline attempt 1",
        raw_response='{"gut_score": 5.5, "feedback": "Too linear"}',
        scores=OUTLINE_SCORES_FAIL, parent_id=g1,
    )

    g2 = qlog.log_generate(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context='{"video_type": "knowledge_sharing", "topic": "CLI tools every developer needs", "feedback": "Add narrative tension, vary screen types"}',
        raw_response='{"sections": [{"title": "Hook: Why Most Devs Are Slow", "screens": 2}, {"title": "The Problem", "screens": 2}, {"title": "5 Tools That Change Everything", "screens": 4}, {"title": "Takeaway", "screens": 1}]}',
        parsed_output={"sections": [{"title": "Hook: Why Most Devs Are Slow", "screens": 2}, {"title": "The Problem", "screens": 2}, {"title": "5 Tools That Change Everything", "screens": 4}, {"title": "Takeaway", "screens": 1}]},
        parent_id=e1,
    )

    e2 = qlog.log_eval(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context="brief + outline attempt 2",
        raw_response='{"gut_score": 8.0, "feedback": "Strong hook, clear arc"}',
        scores=OUTLINE_SCORES_PASS, parent_id=g2,
    )

    a1 = qlog.log_approve(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full", parent_id=e2,
    )

    # --- Override: user edits section 3 after approval ---
    o1 = qlog.log_override(
        project_id=FIXTURE_PROJECT, stage="outline", scope="section:3",
        instruction="Trim to 3 tools, not 5 — video is already long",
        before_content='{"title": "5 Tools That Change Everything", "screens": 4}',
        after_content='{"title": "3 Tools That Change Everything", "screens": 3}',
        parent_id=a1,
    )

    # --- Storyboard chain: generate → eval(pass) → approve ---
    g3 = qlog.log_generate(
        project_id=FIXTURE_PROJECT, stage="storyboard", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_writer_prompt_v0324.md",
        context="approved outline (9 screens across 4 sections)",
        raw_response="[screen-by-screen storyboard content, 9 screens total]",
        parsed_output={"screens": [{"id": 1, "title": "Hook"}, {"id": 2, "title": "Problem"}]},
    )

    e3 = qlog.log_eval(
        project_id=FIXTURE_PROJECT, stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="STORYBOARD_EVAL_PROMPT.md",
        context="brief + outline + storyboard",
        raw_response='{"gut_score": 7.5, "feedback": "Solid storyboard"}',
        scores=STORYBOARD_SCORES, parent_id=g3,
    )

    a2 = qlog.log_approve(
        project_id=FIXTURE_PROJECT, stage="storyboard", scope="full", parent_id=e3,
    )

    # Backfill created_at to spread events over time
    conn = sqlite3.connect(qlog._db_path)
    rows = conn.execute(
        "SELECT id FROM quality_log WHERE project_id = ? ORDER BY id",
        (FIXTURE_PROJECT,),
    ).fetchall()
    for i, row in enumerate(rows):
        conn.execute(
            "UPDATE quality_log SET created_at = ? WHERE id = ?",
            (t + i * 30, row[0]),
        )
    conn.commit()
    conn.close()

    print(f"Seeded {len(rows)} quality_log entries for project {FIXTURE_PROJECT}")
    return FIXTURE_PROJECT


if __name__ == "__main__":
    seed()
```

- [ ] **Step 2: Run the seed script**

```bash
cd backend && source venv/bin/activate && python scripts/seed_quality_log.py
```

Expected: `Seeded 9 quality_log entries for project fixture-quality-dash-001`

- [ ] **Step 3: Verify with existing endpoint**

```bash
curl -s http://localhost:8001/api/quality-log/fixture-quality-dash-001 | python -m json.tool | head -30
```

Expected: JSON with 9 entries, parent_id chains visible.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/seed_quality_log.py
git commit -m "feat: add quality log seed script for dashboard fixture data"
```

---

### Task 2: Chain-Grouping Endpoint

**Files:**
- Create: `backend/app/test/test_quality_log_chains.py`
- Modify: `backend/app/main.py` (add new endpoint)

The existing `/api/quality-log/{project_id}` returns a flat list. The dashboard needs entries grouped into causal chains. A chain is a tree rooted at an entry with `parent_id=NULL`, with children linked by `parent_id`. Group by stage, then by chain root.

- [ ] **Step 1: Write the test for chain grouping**

Create `backend/app/test/test_quality_log_chains.py`:

```python
import json
import sqlite3
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.infra.quality_log import QualityLog


@pytest.fixture
def seeded_qlog(tmp_path, monkeypatch):
    """Seed a temp DB and patch qlog to use it."""
    db_path = tmp_path / "test.db"
    qlog = QualityLog(db_path=db_path)

    # Outline chain: generate(fail) → eval → generate(pass) → eval → approve
    g1 = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="dir_v0324.md",
        context="brief", raw_response="outline v1",
    )
    e1 = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="EVAL.md",
        context="ctx", raw_response="resp",
        scores={"composite_score": 5.9, "passed": False},
        parent_id=g1,
    )
    g2 = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="dir_v0324.md",
        context="brief+feedback", raw_response="outline v2",
        parent_id=e1,
    )
    e2 = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="EVAL.md",
        context="ctx", raw_response="resp",
        scores={"composite_score": 7.8, "passed": True},
        parent_id=g2,
    )
    a1 = qlog.log_approve(
        project_id="p1", stage="outline", scope="full", parent_id=e2,
    )

    # Storyboard chain: generate → eval → approve
    g3 = qlog.log_generate(
        project_id="p1", stage="storyboard", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="writer_v0324.md",
        context="outline", raw_response="storyboard",
    )
    e3 = qlog.log_eval(
        project_id="p1", stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="SB_EVAL.md",
        context="ctx", raw_response="resp",
        scores={"composite_score": 7.6, "passed": True},
        parent_id=g3,
    )
    a2 = qlog.log_approve(
        project_id="p1", stage="storyboard", scope="full", parent_id=e3,
    )

    monkeypatch.setattr("app.infra.quality_log.qlog", qlog)
    monkeypatch.setattr("app.infra.quality_log._DB_PATH", db_path)
    return qlog


@pytest.mark.asyncio
async def test_chains_endpoint_groups_by_stage(seeded_qlog):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/quality-log/p1/chains")
    assert resp.status_code == 200
    data = resp.json()

    assert data["project_id"] == "p1"
    stages = data["stages"]
    assert len(stages) == 2

    outline_stage = stages[0]
    assert outline_stage["stage"] == "outline"
    assert len(outline_stage["chains"]) == 1

    chain = outline_stage["chains"][0]
    events = chain["events"]
    assert len(events) == 5
    assert events[0]["event"] == "generate"
    assert events[1]["event"] == "eval"
    assert events[2]["event"] == "generate"
    assert events[3]["event"] == "eval"
    assert events[4]["event"] == "approve"

    sb_stage = stages[1]
    assert sb_stage["stage"] == "storyboard"
    assert len(sb_stage["chains"]) == 1
    assert len(sb_stage["chains"][0]["events"]) == 3


@pytest.mark.asyncio
async def test_chains_endpoint_empty_project(seeded_qlog):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/quality-log/nonexistent/chains")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stages"] == []
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && source venv/bin/activate && python -m pytest app/test/test_quality_log_chains.py -v
```

Expected: FAIL — 404 because the endpoint doesn't exist yet.

- [ ] **Step 3: Implement the chains endpoint**

Add to `backend/app/main.py`, after the existing `/api/quality-log/{project_id}` endpoint (around line 1432):

```python
@app.get("/api/quality-log/{project_id}/chains")
async def get_quality_log_chains(project_id: str):
    import sqlite3

    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM quality_log WHERE project_id = ? ORDER BY id",
        (project_id,),
    ).fetchall()
    conn.close()

    entries_by_id: dict[int, dict] = {}
    for r in rows:
        entry = dict(r)
        for json_field in ("parsed_output", "scores"):
            if entry.get(json_field):
                try:
                    entry[json_field] = json.loads(entry[json_field])
                except (json.JSONDecodeError, TypeError):
                    pass
        entries_by_id[entry["id"]] = entry

    # Build chains: find roots (parent_id is NULL), walk children
    children_map: dict[int, list[int]] = {}
    roots: list[int] = []
    for eid, entry in entries_by_id.items():
        pid = entry["parent_id"]
        if pid is None:
            roots.append(eid)
        else:
            children_map.setdefault(pid, []).append(eid)

    def walk_chain(root_id: int) -> list[dict]:
        result = [entries_by_id[root_id]]
        for child_id in children_map.get(root_id, []):
            result.extend(walk_chain(child_id))
        return result

    # Group chains by stage
    stage_chains: dict[str, list[list[dict]]] = {}
    for root_id in roots:
        chain = walk_chain(root_id)
        stage = chain[0]["stage"]
        stage_chains.setdefault(stage, []).append(chain)

    # Preserve pipeline order: outline before storyboard
    stage_order = ["outline", "storyboard"]
    ordered_stages = sorted(
        stage_chains.keys(),
        key=lambda s: stage_order.index(s) if s in stage_order else 999,
    )

    stages = []
    for stage_name in ordered_stages:
        chains = stage_chains[stage_name]
        stages.append({
            "stage": stage_name,
            "chains": [{"root_id": c[0]["id"], "events": c} for c in chains],
        })

    return {"project_id": project_id, "stages": stages}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && source venv/bin/activate && python -m pytest app/test/test_quality_log_chains.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/test/test_quality_log_chains.py backend/app/main.py
git commit -m "feat: add /api/quality-log/{project_id}/chains endpoint with causal chain grouping"
```

---

### Task 3: ScoreDisplay Component

**Files:**
- Create: `frontend/src/components/admin/quality-log/ScoreDisplay.tsx`

Renders a score as a colored number badge. Thresholds: red < 6.0, yellow 6.0–7.0, green > 7.0.

- [ ] **Step 1: Create the component**

```tsx
interface ScoreDisplayProps {
  label: string;
  score: number;
  feedback?: string;
}

const scoreColor = (score: number): string => {
  if (score >= 7.0) return "text-green-700 bg-green-50 border-green-200";
  if (score >= 6.0) return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-red-700 bg-red-50 border-red-200";
};

export function ScoreDisplay({ label, score, feedback }: ScoreDisplayProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-medium tabular-nums ${scoreColor(score)}`}
        >
          {score.toFixed(1)}
        </span>
        {feedback && (
          <span className="text-xs text-muted-foreground max-w-[200px] truncate" title={feedback}>
            {feedback}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors related to ScoreDisplay.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/quality-log/ScoreDisplay.tsx
git commit -m "feat: add ScoreDisplay component with color-coded score badges"
```

---

### Task 4: EventNode Component

**Files:**
- Create: `frontend/src/components/admin/quality-log/EventNode.tsx`

A single event in the timeline. Shows an icon (per event type), event label, stage/scope, timestamp, and a summary line (e.g., score for eval, attempt # for generate).

- [ ] **Step 1: Create the component**

```tsx
import { Zap, ClipboardCheck, PenLine, CheckCircle } from "lucide-react";

export interface QualityLogEntry {
  id: number;
  event: "generate" | "eval" | "override" | "approve";
  stage: string;
  scope: string | null;
  attempt: number | null;
  model: string | null;
  prompt_ref: string | null;
  context: string | null;
  raw_response: string | null;
  parsed_output: unknown;
  scores: {
    passed?: boolean;
    composite_score?: number;
    gut?: { score: number; feedback: string };
    dimensions?: Array<{ dimension: string; score: number; feedback: string }>;
    attempt?: number;
    total_attempts?: number;
  } | null;
  instruction: string | null;
  before_content: string | null;
  after_content: string | null;
  parent_id: number | null;
  created_at: number;
}

const EVENT_CONFIG: Record<
  QualityLogEntry["event"],
  { icon: typeof Zap; label: string; color: string }
> = {
  generate: { icon: Zap, label: "Generate", color: "text-blue-600 bg-blue-50 border-blue-200" },
  eval: { icon: ClipboardCheck, label: "Evaluate", color: "text-violet-600 bg-violet-50 border-violet-200" },
  override: { icon: PenLine, label: "Override", color: "text-amber-600 bg-amber-50 border-amber-200" },
  approve: { icon: CheckCircle, label: "Approve", color: "text-green-600 bg-green-50 border-green-200" },
};

interface EventNodeProps {
  entry: QualityLogEntry;
  isSelected: boolean;
  onClick: () => void;
}

function formatTime(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getSummary(entry: QualityLogEntry): string {
  switch (entry.event) {
    case "generate":
      return `Attempt ${entry.attempt ?? "?"}  ·  ${entry.model ?? ""}`;
    case "eval": {
      const s = entry.scores;
      if (!s) return "";
      const verdict = s.passed ? "PASS" : "FAIL";
      return `${verdict}  ·  ${s.composite_score?.toFixed(1) ?? "—"}`;
    }
    case "override":
      return entry.scope ?? "";
    case "approve":
      return entry.scope === "full" ? "Full stage approved" : (entry.scope ?? "");
  }
}

export function EventNode({ entry, isSelected, onClick }: EventNodeProps) {
  const config = EVENT_CONFIG[entry.event];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        isSelected
          ? "border-foreground/20 bg-muted/60 shadow-sm"
          : "border-transparent hover:bg-muted/40"
      }`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${config.color}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{config.label}</span>
          <span className="text-xs text-muted-foreground">{formatTime(entry.created_at)}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{getSummary(entry)}</p>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/quality-log/EventNode.tsx
git commit -m "feat: add EventNode component for quality log timeline"
```

---

### Task 5: EventDetail Component

**Files:**
- Create: `frontend/src/components/admin/quality-log/EventDetail.tsx`

Right-side panel showing all metadata for the selected event. All fields default-expanded. Uses `ScoreDisplay` for eval scores.

- [ ] **Step 1: Create the component**

```tsx
import { Card } from "@/components/ui/card";
import { ScoreDisplay } from "./ScoreDisplay";
import type { QualityLogEntry } from "./EventNode";

interface EventDetailProps {
  entry: QualityLogEntry;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  return (
    <pre className="max-h-[300px] overflow-auto rounded-md bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
}

function tryPrettyJson(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground w-24">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function GenerateDetail({ entry }: { entry: QualityLogEntry }) {
  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <div className="space-y-1">
          <MetaRow label="Model" value={entry.model} />
          <MetaRow label="Prompt" value={entry.prompt_ref} />
          <MetaRow label="Attempt" value={String(entry.attempt ?? "—")} />
          <MetaRow label="Scope" value={entry.scope} />
        </div>
      </Section>
      <Section title="Context (input)">
        <CodeBlock content={tryPrettyJson(entry.context)} />
      </Section>
      <Section title="Raw Response">
        <CodeBlock content={entry.raw_response ?? "—"} />
      </Section>
      {entry.parsed_output && (
        <Section title="Parsed Output">
          <CodeBlock content={JSON.stringify(entry.parsed_output, null, 2)} />
        </Section>
      )}
    </div>
  );
}

function EvalDetail({ entry }: { entry: QualityLogEntry }) {
  const scores = entry.scores;
  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <div className="space-y-1">
          <MetaRow label="Model" value={entry.model} />
          <MetaRow label="Prompt" value={entry.prompt_ref} />
          <MetaRow label="Scope" value={entry.scope} />
        </div>
      </Section>
      {scores && (
        <Section title="Scores">
          <div className="space-y-0.5">
            {scores.composite_score != null && (
              <ScoreDisplay label="Composite" score={scores.composite_score} />
            )}
            {scores.gut && (
              <ScoreDisplay label="Gut check" score={scores.gut.score} feedback={scores.gut.feedback} />
            )}
            {scores.dimensions?.map((d) => (
              <ScoreDisplay key={d.dimension} label={d.dimension} score={d.score} feedback={d.feedback} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Context (input)">
        <CodeBlock content={tryPrettyJson(entry.context)} />
      </Section>
      <Section title="Raw Response">
        <CodeBlock content={entry.raw_response ?? "—"} />
      </Section>
    </div>
  );
}

function OverrideDetail({ entry }: { entry: QualityLogEntry }) {
  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <MetaRow label="Scope" value={entry.scope} />
      </Section>
      {entry.instruction && (
        <Section title="Instruction">
          <p className="text-sm">{entry.instruction}</p>
        </Section>
      )}
      <Section title="Before">
        <CodeBlock content={tryPrettyJson(entry.before_content)} />
      </Section>
      <Section title="After">
        <CodeBlock content={tryPrettyJson(entry.after_content)} />
      </Section>
    </div>
  );
}

function ApproveDetail({ entry }: { entry: QualityLogEntry }) {
  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <MetaRow label="Scope" value={entry.scope} />
        <MetaRow
          label="Timestamp"
          value={new Date(entry.created_at * 1000).toLocaleString()}
        />
      </Section>
    </div>
  );
}

const DETAIL_RENDERERS: Record<
  QualityLogEntry["event"],
  React.ComponentType<{ entry: QualityLogEntry }>
> = {
  generate: GenerateDetail,
  eval: EvalDetail,
  override: OverrideDetail,
  approve: ApproveDetail,
};

export function EventDetail({ entry }: EventDetailProps) {
  const Renderer = DETAIL_RENDERERS[entry.event];
  return (
    <Card className="p-4">
      <Renderer entry={entry} />
    </Card>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/quality-log/EventDetail.tsx
git commit -m "feat: add EventDetail panel for quality log metadata display"
```

---

### Task 6: ChainTimeline Component

**Files:**
- Create: `frontend/src/components/admin/quality-log/ChainTimeline.tsx`

Renders a list of chains grouped by stage. Each chain is a collapsible section (default expanded) with a vertical connector line between event nodes.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EventNode, type QualityLogEntry } from "./EventNode";

interface Chain {
  root_id: number;
  events: QualityLogEntry[];
}

interface StageGroup {
  stage: string;
  chains: Chain[];
}

interface ChainTimelineProps {
  stages: StageGroup[];
  selectedId: number | null;
  onSelect: (entry: QualityLogEntry) => void;
}

function chainSummary(events: QualityLogEntry[]): string {
  const attempts = events.filter((e) => e.event === "generate").length;
  const lastEval = [...events].reverse().find((e) => e.event === "eval");
  const passed = lastEval?.scores?.passed;
  const score = lastEval?.scores?.composite_score;
  const parts: string[] = [];
  if (attempts > 1) parts.push(`${attempts} attempts`);
  if (score != null) parts.push(`score: ${score.toFixed(1)}`);
  if (passed != null) parts.push(passed ? "passed" : "failed");
  return parts.join("  ·  ");
}

const STAGE_LABELS: Record<string, string> = {
  outline: "Outline (Director)",
  storyboard: "Storyboard (Writer)",
};

export function ChainTimeline({ stages, selectedId, onSelect }: ChainTimelineProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (rootId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {stages.map((sg) => (
        <div key={sg.stage}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {STAGE_LABELS[sg.stage] ?? sg.stage}
          </h3>
          <div className="space-y-3">
            {sg.chains.map((chain) => {
              const isCollapsed = collapsed.has(chain.root_id);
              return (
                <div key={chain.root_id} className="rounded-lg border bg-card">
                  <button
                    onClick={() => toggle(chain.root_id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">
                      Chain #{chain.root_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {chainSummary(chain.events)}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="relative ml-6 border-l border-border pb-2">
                      {chain.events.map((entry) => (
                        <div key={entry.id} className="relative pl-4 -ml-px">
                          <div className="absolute left-0 top-4 h-2 w-2 -translate-x-[5px] rounded-full border-2 border-background bg-border" />
                          <EventNode
                            entry={entry}
                            isSelected={entry.id === selectedId}
                            onClick={() => onSelect(entry)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/quality-log/ChainTimeline.tsx
git commit -m "feat: add ChainTimeline component with collapsible causal chains"
```

---

### Task 7: QualityLogDashboard Page + Route

**Files:**
- Create: `frontend/src/components/admin/QualityLogDashboard.tsx`
- Modify: `frontend/src/App.tsx` (add route + import)

Main page: fetches `/api/quality-log/{projectId}/chains`, renders ChainTimeline on the left (60%) and EventDetail on the right (40%). Includes a project ID input at top.

- [ ] **Step 1: Create the dashboard page**

```tsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { ChainTimeline } from "./quality-log/ChainTimeline";
import { EventDetail } from "./quality-log/EventDetail";
import type { QualityLogEntry } from "./quality-log/EventNode";

interface Chain {
  root_id: number;
  events: QualityLogEntry[];
}

interface StageGroup {
  stage: string;
  chains: Chain[];
}

interface ChainsResponse {
  project_id: string;
  stages: StageGroup[];
}

export function QualityLogDashboard() {
  const { projectId: paramProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [projectInput, setProjectInput] = useState(paramProjectId ?? "");
  const [data, setData] = useState<ChainsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<QualityLogEntry | null>(null);

  const fetchChains = useCallback(async (pid: string) => {
    if (!pid.trim()) return;
    setLoading(true);
    setError(null);
    setSelectedEntry(null);
    try {
      const resp = await fetch(`/api/quality-log/${encodeURIComponent(pid)}/chains`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: ChainsResponse = await resp.json();
      setData(json);
      // Auto-select first event
      if (json.stages.length > 0 && json.stages[0].chains.length > 0) {
        setSelectedEntry(json.stages[0].chains[0].events[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paramProjectId) {
      setProjectInput(paramProjectId);
      fetchChains(paramProjectId);
    }
  }, [paramProjectId, fetchChains]);

  const handleSearch = () => {
    const trimmed = projectInput.trim();
    if (trimmed) {
      navigate(`/admin/quality-log/${encodeURIComponent(trimmed)}`, { replace: true });
    }
  };

  const totalEvents = data?.stages.reduce(
    (sum, s) => sum + s.chains.reduce((cs, c) => cs + c.events.length, 0),
    0,
  ) ?? 0;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/dashboard")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Admin
          </Button>
          <h1 className="text-lg font-semibold">Quality Log</h1>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="text"
              value={projectInput}
              onChange={(e) => setProjectInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Project ID"
              className="h-8 w-64 rounded-md border bg-muted/30 px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button size="sm" variant="outline" onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Timeline */}
        <ScrollArea className="w-[55%] border-r p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
            </div>
          )}
          {!loading && data && data.stages.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No quality log entries for this project.
            </div>
          )}
          {!loading && data && data.stages.length > 0 && (
            <>
              <p className="mb-4 text-xs text-muted-foreground">
                {totalEvents} events across {data.stages.length} stage{data.stages.length > 1 ? "s" : ""}
              </p>
              <ChainTimeline
                stages={data.stages}
                selectedId={selectedEntry?.id ?? null}
                onSelect={setSelectedEntry}
              />
            </>
          )}
        </ScrollArea>

        {/* Right: Detail panel */}
        <ScrollArea className="flex-1 p-4">
          {selectedEntry ? (
            <EventDetail entry={selectedEntry} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select an event to view details
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

export default QualityLogDashboard;
```

- [ ] **Step 2: Add the route to App.tsx**

In `frontend/src/App.tsx`, add the import after the existing admin imports (around line 21):

```tsx
import QualityLogDashboard from "@/components/admin/QualityLogDashboard";
```

Add the route after the existing admin routes (around line 113):

```tsx
<Route path="/admin/quality-log/:projectId?" element={<QualityLogDashboard />} />
```

- [ ] **Step 3: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Verify the full build passes**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/QualityLogDashboard.tsx frontend/src/App.tsx
git commit -m "feat: add QualityLogDashboard page with timeline + detail panel layout"
```

---

### Task 8: End-to-End Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Start the backend and seed fixture data**

```bash
cd backend && source venv/bin/activate && python scripts/seed_quality_log.py && uvicorn app.main:app --reload --port 8001
```

- [ ] **Step 2: Verify the chains API returns correct data**

```bash
curl -s http://localhost:8001/api/quality-log/fixture-quality-dash-001/chains | python -m json.tool | head -40
```

Expected: 2 stages (outline, storyboard), outline has 1 chain with 6 events (including override), storyboard has 1 chain with 3 events.

- [ ] **Step 3: Start the frontend and open the dashboard**

```bash
cd frontend && npm run dev
```

Open browser to `http://localhost:3000/admin/quality-log/fixture-quality-dash-001`.

Verify:
- Two stage sections (Outline, Storyboard) visible in timeline
- Outline chain shows 6 events: generate → eval → generate → eval → approve → override
- Storyboard chain shows 3 events: generate → eval → approve
- Clicking an eval node shows colored scores in the detail panel
- Clicking a generate node shows model, prompt_ref, context, raw_response
- Clicking an override node shows before/after content
- Chain collapse/expand works
- Empty project shows "No quality log entries" message

- [ ] **Step 4: Commit any fixes found during smoke test**

If fixes are needed, commit them individually with descriptive messages.

# Edit Drift Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Track Changes diff views showing how users edit AI-generated outlines and storyboards, accessible from the admin dashboard's Completion Funnel.

**Architecture:** Backend adds one endpoint to fetch all stage snapshots across projects. Frontend adds a diff utility module, a detail page with Track Changes rendering, and clickable funnel bars with accordion summaries. All diffing is computed client-side from existing `aiVersion`/`humanVersion` data.

**Tech Stack:** Python/FastAPI (backend endpoint), TypeScript/React (frontend diff engine + UI)

**Spec:** `docs/superpowers/specs/2026-03-23-edit-drift-tracking.md`

---

### Task 1: Backend endpoint — all stage snapshots

**Files:**
- Modify: `backend/app/db/repository.py:108` (add new method)
- Modify: `backend/app/main.py:1522` (add new endpoint)

- [ ] **Step 1: Add repository method `get_all_stage_snapshots()`**

In `backend/app/db/repository.py`, add after line 114 (after `get_all_snapshots`):

```python
    async def get_all_stage_snapshots(self) -> list[StageSnapshot]:
        """Get all stage snapshots across all projects (for admin drift view)."""
        result = await self.session.execute(
            select(StageSnapshot).where(
                StageSnapshot.stage_id.in_([2, 3])
            ).order_by(StageSnapshot.project_id, StageSnapshot.stage_id)
        )
        return list(result.scalars().all())
```

- [ ] **Step 2: Add admin endpoint `GET /api/admin/stages/all`**

In `backend/app/main.py`, add after the existing admin endpoints (after the field-edits endpoint):

```python
@app.get("/api/admin/stages/all")
async def get_admin_all_stages(
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    """Get all stage snapshots across all projects for drift analysis."""
    if not verify_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    repo = ProjectRepository(db)
    snapshots = await repo.get_all_stage_snapshots()

    # Group by project
    projects_map: dict = {}
    for snap in snapshots:
        pid = snap.project_id
        if pid not in projects_map:
            # Get project name
            project = await repo.get_project(pid)
            projects_map[pid] = {
                "project_id": pid,
                "project_name": project.title if project else pid,
                "created_at": project.created_at.isoformat() if project else None,
                "stages": {},
            }
        projects_map[pid]["stages"][str(snap.stage_id)] = {
            "ai_version": snap.ai_version,
            "human_version": snap.human_version,
        }

    return {"projects": list(projects_map.values())}
```

- [ ] **Step 3: Verify endpoint works**

```bash
cd backend && ./venv/bin/python -c "
from app.main import app
print('Endpoint registered:', any(r.path == '/api/admin/stages/all' for r in app.routes))
"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/db/repository.py backend/app/main.py
git commit -m "feat(backend): add admin endpoint for all stage snapshots"
```

---

### Task 2: Diff utility module

**Files:**
- Create: `frontend/src/components/admin/drift/diffUtils.ts`

- [ ] **Step 1: Create the drift directory**

```bash
mkdir -p frontend/src/components/admin/drift
```

- [ ] **Step 2: Write `diffUtils.ts`**

```typescript
/**
 * Diff utilities for comparing AI-generated vs human-edited content.
 * Pure functions — no React, no side effects.
 */

import { parseOutline } from "@/components/OutlineBuilder/outlineParser";
import type { OutlineSection } from "@/components/OutlineBuilder/types";
import type { ProductionScreen } from "@/components/DraftBuilder/types";
import { getVisualDirectionArray } from "@/components/DraftBuilder/types";

// --- Types ---

export interface FieldDiff {
  field: string;
  status: "modified" | "added" | "removed" | "unchanged";
  aiValue?: string;
  humanValue?: string;
}

export interface SectionDiff {
  label: string;
  fields: FieldDiff[];
}

export interface DiffResult {
  totalFields: number;
  changedFields: number;
  editRate: number;
  sections: SectionDiff[];
}

// --- Outline Diffing ---

const OUTLINE_FIELDS: (keyof OutlineSection)[] = [
  "title",
  "purpose",
  "entryAssumption",
  "exitState",
  "duration",
];

function diffOutlineSections(
  aiSections: OutlineSection[],
  humanSections: OutlineSection[]
): SectionDiff[] {
  const result: SectionDiff[] = [];
  const maxLen = Math.max(aiSections.length, humanSections.length);

  for (let i = 0; i < maxLen; i++) {
    const ai = aiSections[i];
    const human = humanSections[i];
    const fields: FieldDiff[] = [];

    if (ai && !human) {
      // Section removed by human
      for (const key of OUTLINE_FIELDS) {
        fields.push({ field: key, status: "removed", aiValue: String(ai[key] || "") });
      }
      for (const tp of ai.talkingPoints) {
        fields.push({ field: "talking_point", status: "removed", aiValue: tp });
      }
      result.push({ label: `Section ${ai.sectionNumber}: ${ai.title}`, fields });
      continue;
    }

    if (!ai && human) {
      // Section added by human
      for (const key of OUTLINE_FIELDS) {
        fields.push({ field: key, status: "added", humanValue: String(human[key] || "") });
      }
      for (const tp of human.talkingPoints) {
        fields.push({ field: "talking_point", status: "added", humanValue: tp });
      }
      result.push({ label: `Section ${human.sectionNumber}: ${human.title}`, fields });
      continue;
    }

    // Both exist — compare field by field
    for (const key of OUTLINE_FIELDS) {
      const aiVal = String(ai[key] || "");
      const humanVal = String(human[key] || "");
      if (aiVal === humanVal) {
        fields.push({ field: key, status: "unchanged", aiValue: aiVal, humanValue: humanVal });
      } else {
        fields.push({ field: key, status: "modified", aiValue: aiVal, humanValue: humanVal });
      }
    }

    // Compare talking points
    const aiTPs = ai.talkingPoints;
    const humanTPs = human.talkingPoints;
    const maxTP = Math.max(aiTPs.length, humanTPs.length);
    for (let t = 0; t < maxTP; t++) {
      const aiTP = aiTPs[t];
      const humanTP = humanTPs[t];
      if (aiTP && !humanTP) {
        fields.push({ field: "talking_point", status: "removed", aiValue: aiTP });
      } else if (!aiTP && humanTP) {
        fields.push({ field: "talking_point", status: "added", humanValue: humanTP });
      } else if (aiTP === humanTP) {
        fields.push({ field: "talking_point", status: "unchanged", aiValue: aiTP, humanValue: humanTP });
      } else {
        fields.push({ field: "talking_point", status: "modified", aiValue: aiTP, humanValue: humanTP });
      }
    }

    result.push({ label: `Section ${human.sectionNumber}: ${human.title}`, fields });
  }

  return result;
}

export function diffOutline(aiText: string, humanText: string): DiffResult {
  const aiSections = parseOutline(aiText);
  const humanSections = parseOutline(humanText);
  const sections = diffOutlineSections(aiSections, humanSections);

  let totalFields = 0;
  let changedFields = 0;
  for (const s of sections) {
    for (const f of s.fields) {
      totalFields++;
      if (f.status !== "unchanged") changedFields++;
    }
  }

  return {
    totalFields,
    changedFields,
    editRate: totalFields > 0 ? changedFields / totalFields : 0,
    sections,
  };
}

// --- Storyboard Diffing ---

const SCREEN_FIELDS: (keyof ProductionScreen)[] = [
  "screen_type",
  "voiceover_text",
  "on_screen_visual",
];

function normalizeVisualDirection(screen: ProductionScreen): string {
  return getVisualDirectionArray(screen.visual_direction).join("; ");
}

function diffScreens(
  aiScreens: ProductionScreen[],
  humanScreens: ProductionScreen[]
): SectionDiff[] {
  const result: SectionDiff[] = [];
  const maxLen = Math.max(aiScreens.length, humanScreens.length);

  for (let i = 0; i < maxLen; i++) {
    const ai = aiScreens[i];
    const human = humanScreens[i];
    const fields: FieldDiff[] = [];

    if (ai && !human) {
      for (const key of SCREEN_FIELDS) {
        fields.push({ field: key, status: "removed", aiValue: String(ai[key] || "") });
      }
      fields.push({ field: "visual_direction", status: "removed", aiValue: normalizeVisualDirection(ai) });
      fields.push({ field: "duration", status: "removed", aiValue: String(ai.duration) });
      result.push({ label: `Screen ${ai.screen_number}`, fields });
      continue;
    }

    if (!ai && human) {
      for (const key of SCREEN_FIELDS) {
        fields.push({ field: key, status: "added", humanValue: String(human[key] || "") });
      }
      fields.push({ field: "visual_direction", status: "added", humanValue: normalizeVisualDirection(human) });
      fields.push({ field: "duration", status: "added", humanValue: String(human.duration) });
      result.push({ label: `Screen ${human.screen_number}`, fields });
      continue;
    }

    // Both exist — compare
    for (const key of SCREEN_FIELDS) {
      const aiVal = String(ai[key] || "");
      const humanVal = String(human[key] || "");
      if (aiVal === humanVal) {
        fields.push({ field: key, status: "unchanged", aiValue: aiVal, humanValue: humanVal });
      } else {
        fields.push({ field: key, status: "modified", aiValue: aiVal, humanValue: humanVal });
      }
    }

    // visual_direction (normalize to string for comparison)
    const aiVD = normalizeVisualDirection(ai);
    const humanVD = normalizeVisualDirection(human);
    if (aiVD === humanVD) {
      fields.push({ field: "visual_direction", status: "unchanged", aiValue: aiVD, humanValue: humanVD });
    } else {
      fields.push({ field: "visual_direction", status: "modified", aiValue: aiVD, humanValue: humanVD });
    }

    // duration
    const aiDur = String(ai.duration);
    const humanDur = String(human.duration);
    if (aiDur === humanDur) {
      fields.push({ field: "duration", status: "unchanged", aiValue: aiDur, humanValue: humanDur });
    } else {
      fields.push({ field: "duration", status: "modified", aiValue: aiDur, humanValue: humanDur });
    }

    result.push({ label: `Screen ${human.screen_number}`, fields });
  }

  return result;
}

export function diffStoryboard(aiJson: string, humanJson: string): DiffResult {
  let aiScreens: ProductionScreen[] = [];
  let humanScreens: ProductionScreen[] = [];
  try { aiScreens = JSON.parse(aiJson); } catch { /* empty */ }
  try { humanScreens = JSON.parse(humanJson); } catch { /* empty */ }

  const sections = diffScreens(aiScreens, humanScreens);

  let totalFields = 0;
  let changedFields = 0;
  for (const s of sections) {
    for (const f of s.fields) {
      totalFields++;
      if (f.status !== "unchanged") changedFields++;
    }
  }

  return {
    totalFields,
    changedFields,
    editRate: totalFields > 0 ? changedFields / totalFields : 0,
    sections,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/drift/diffUtils.ts
git commit -m "feat(drift): add diff utility for outline and storyboard comparison"
```

---

### Task 3: Detail page — Track Changes view

**Files:**
- Create: `frontend/src/components/admin/drift/DriftDetailPage.tsx`

- [ ] **Step 1: Write `DriftDetailPage.tsx`**

```tsx
/**
 * DriftDetailPage — Track Changes view for AI→Human edits.
 * Route: /admin/drift/:stageName (stageName = "outline" or "storyboard")
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { diffOutline, diffStoryboard } from "./diffUtils";
import type { DiffResult, SectionDiff, FieldDiff } from "./diffUtils";

interface ProjectSnapshot {
  project_id: string;
  project_name: string;
  created_at: string | null;
  stages: Record<string, { ai_version: string | null; human_version: string | null }>;
}

// Stage name → stage_id in StageSnapshot table
const STAGE_MAP: Record<string, { id: number; title: string }> = {
  outline: { id: 2, title: "Outline — Edit Diffs" },
  storyboard: { id: 3, title: "Storyboard Draft — Edit Diffs" },
};

function FieldDiffLine({ diff }: { diff: FieldDiff }) {
  if (diff.status === "unchanged") {
    return (
      <div className="py-1 text-muted-foreground">
        <span className="text-[10px] uppercase text-muted-foreground/60 mr-2">{diff.field}</span>
        {diff.humanValue}
      </div>
    );
  }

  if (diff.status === "removed") {
    return (
      <div className="py-1">
        <span className="text-[10px] uppercase text-muted-foreground/60 mr-2">{diff.field}</span>
        <span className="text-[#A63228] line-through bg-[#FDDDD9] px-0.5 rounded-sm">{diff.aiValue}</span>
        <span className="text-[9px] text-[#A63228] italic ml-1">(removed)</span>
      </div>
    );
  }

  if (diff.status === "added") {
    return (
      <div className="py-1">
        <span className="text-[10px] uppercase text-muted-foreground/60 mr-2">{diff.field}</span>
        <span className="text-[#3A6B47] bg-[#D4EDDA] px-0.5 rounded-sm">{diff.humanValue}</span>
        <span className="text-[9px] text-[#3A6B47] italic ml-1">(added)</span>
      </div>
    );
  }

  // modified
  return (
    <div className="py-1">
      <span className="text-[10px] uppercase text-muted-foreground/60 mr-2">{diff.field}</span>
      <span className="text-[#A63228] line-through bg-[#FDDDD9] px-0.5 rounded-sm">{diff.aiValue}</span>
      {" "}
      <span className="text-[#3A6B47] bg-[#D4EDDA] px-0.5 rounded-sm">{diff.humanValue}</span>
    </div>
  );
}

function SectionBlock({ section }: { section: SectionDiff }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold text-[#7C3AED] uppercase tracking-wide mb-2 pb-1 border-b border-[#F0EEFF]">
        {section.label}
      </div>
      <div className="text-[12.5px] leading-[1.8]">
        {section.fields.map((f, i) => (
          <FieldDiffLine key={i} diff={f} />
        ))}
      </div>
    </div>
  );
}

function ProjectDiffCard({
  project,
  diff,
}: {
  project: ProjectSnapshot;
  diff: DiffResult;
}) {
  const [expanded, setExpanded] = useState(diff.editRate > 0);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-[#f6f6f3] border-b border-border flex justify-between items-center text-left hover:bg-[#f0f0ec] transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-semibold text-sm">{project.project_name}</span>
        </div>
        <span
          className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded",
            diff.editRate > 0.3
              ? "text-[#3A6B47] bg-[#E6F2EB]"
              : diff.editRate > 0
                ? "text-[#946B2D] bg-[#FFF8E7]"
                : "text-muted-foreground bg-muted"
          )}
        >
          {Math.round(diff.editRate * 100)}% edited
        </span>
      </button>
      {expanded && (
        <div className="px-4 py-4">
          {diff.sections.map((section, i) => (
            <SectionBlock key={i} section={section} />
          ))}
        </div>
      )}
    </Card>
  );
}

export default function DriftDetailPage() {
  const { stageName } = useParams<{ stageName: string }>();
  const { user } = useUser();
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stageConfig = STAGE_MAP[stageName || ""];
  const stageId = stageConfig?.id;

  useEffect(() => {
    if (!stageId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/stages/all", {
          headers: { "X-User-Id": user?.id || "" },
        });
        if (!res.ok) throw new Error("Failed to fetch stage data");
        const data = await res.json();
        setProjects(data.projects || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [stageId, user?.id]);

  if (!stageConfig) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-muted-foreground">Unknown stage: {stageName}</p>
          <Link to="/admin/dashboard" className="text-primary mt-2 inline-block">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  // Compute diffs for each project that has data for this stage
  const projectDiffs: { project: ProjectSnapshot; diff: DiffResult }[] = [];
  for (const p of projects) {
    const stage = p.stages[String(stageId)];
    if (!stage?.ai_version) continue;

    const aiVersion = stage.ai_version;
    const humanVersion = stage.human_version || aiVersion; // null humanVersion = no edits

    const diff =
      stageId === 2
        ? diffOutline(aiVersion, humanVersion)
        : diffStoryboard(aiVersion, humanVersion);

    projectDiffs.push({ project: p, diff });
  }

  // Sort by edit rate descending (most edited first)
  projectDiffs.sort((a, b) => b.diff.editRate - a.diff.editRate);

  const avgEditRate =
    projectDiffs.length > 0
      ? projectDiffs.reduce((sum, pd) => sum + pd.diff.editRate, 0) / projectDiffs.length
      : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/dashboard"
              className="flex items-center gap-1 text-sm text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <span className="font-semibold text-lg">{stageConfig.title}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {projectDiffs.length} projects · Avg edit rate: {Math.round(avgEditRate * 100)}%
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-48 mb-2" />
                <div className="h-3 bg-muted rounded w-32" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="p-6 text-center">
            <p className="text-destructive">{error}</p>
          </Card>
        ) : projectDiffs.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">No projects have data for this stage yet.</p>
          </Card>
        ) : (
          projectDiffs.map(({ project, diff }) => (
            <ProjectDiffCard key={project.project_id} project={project} diff={diff} />
          ))
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/drift/DriftDetailPage.tsx
git commit -m "feat(drift): add Track Changes detail page for AI vs human edits"
```

---

### Task 4: Funnel accordion + route wiring

**Files:**
- Modify: `frontend/src/components/admin/AdminDashboard.tsx:220-258`
- Modify: `frontend/src/App.tsx:109`

- [ ] **Step 1: Update funnel in AdminDashboard — add clickable bars with accordion**

In `frontend/src/components/admin/AdminDashboard.tsx`, add the `useNavigate` import and `expandedStage` state.

Change the import line:

```typescript
import { useSearchParams } from "react-router-dom";
```

to:

```typescript
import { useSearchParams, useNavigate } from "react-router-dom";
```

Inside `AdminDashboard()`, after `const setTimeRange = ...`:

```typescript
  const navigate = useNavigate();
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
```

Replace the entire funnel `<div className="space-y-3">` block (lines 219-258, from `<div className="space-y-3">` through its closing `</div>`) with:

```tsx
                <div className="space-y-3">
                  {[
                    { key: 1, label: "Briefing", color: "bg-blue-500", diffable: false },
                    { key: 2, label: "Outline", color: "bg-purple-500", diffable: true, route: "outline" },
                    { key: 3, label: "Evidence Research", color: "bg-green-500", diffable: false },
                    { key: 4, label: "Storyboard Draft", color: "bg-yellow-500", diffable: true, route: "storyboard" },
                    { key: 5, label: "Review & Share", color: "bg-orange-500", diffable: false },
                  ].map(({ key: stage, label, color, diffable, route }) => {
                    const count = data.funnel?.[`stage_${stage}`] || 0;
                    const total = data.total_projects || 1;
                    const percentage = Math.round((count / total) * 100);
                    const dropoff =
                      data.funnel?.dropoff_rates?.[`stage_${stage}`] || 0;
                    const isExpanded = expandedStage === stage;

                    return (
                      <div key={stage}>
                        <div
                          className={cn("space-y-1", diffable && "cursor-pointer")}
                          onClick={() => diffable && setExpandedStage(isExpanded ? null : stage)}
                        >
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1">
                              {diffable && (
                                <span className="text-xs text-muted-foreground">
                                  {isExpanded ? "▼" : "▶"}
                                </span>
                              )}
                              {label}
                            </span>
                            <span className="text-muted-foreground">
                              {count} ({percentage}%)
                              {dropoff > 0 && (
                                <span className="text-destructive ml-2">
                                  -{dropoff}% drop
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="h-6 bg-muted rounded overflow-hidden">
                            <div
                              className={cn("h-full rounded transition-all", color)}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        {/* Accordion panel */}
                        {isExpanded && diffable && (
                          <div className="mt-2 mb-1 bg-[#fafaf8] border border-border rounded-md px-3 py-2.5 flex justify-between items-center">
                            <div className="text-xs text-muted-foreground">
                              <strong className="text-foreground">{count}</strong> projects reached this stage
                              {/* Avg edit rate deferred — requires fetching + diffing all snapshots.
                                  Shown on the detail page header instead. */}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/drift/${route}`);
                              }}
                              className="text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
                            >
                              View all diffs →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
```

- [ ] **Step 2: Add route in `App.tsx`**

In `frontend/src/App.tsx`, add the import at the top:

```typescript
import DriftDetailPage from "@/components/admin/drift/DriftDetailPage";
```

Add the route after the `gold-set-eval/diffs` route (line 111):

```tsx
              <Route path="/admin/drift/:stageName" element={<DriftDetailPage />} />
```

- [ ] **Step 3: Build check**

```bash
cd frontend && npm run build
```

Fix any TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/AdminDashboard.tsx frontend/src/App.tsx
git commit -m "feat(drift): clickable funnel bars with accordion + route to detail page"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Start backend and frontend**

Terminal 1:
```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8001
```

Terminal 2:
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verify endpoint**

```bash
curl -s http://localhost:8001/api/admin/stages/all -H "X-User-Id: test" | python3 -m json.tool | head -20
```

- [ ] **Step 3: Visual check**

1. Open `http://localhost:3000/admin/dashboard`
2. Click the "Outline" funnel bar → verify accordion expands with summary + "View all diffs →"
3. Click "View all diffs →" → verify navigates to `/admin/drift/outline`
4. Verify Track Changes view renders: red strikethrough for AI, green for human, gray for unchanged
5. Click "Storyboard Draft" bar → same flow for `/admin/drift/storyboard`
6. Click "← Dashboard" → returns to dashboard

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(drift): smoke test fixes"
```

# Spec: Edit Drift Tracking

**Date:** 2026-03-23
**Status:** Draft

---

## Problem

There's no systematic way to see how much humans change AI-generated content. The `aiVersion` and `humanVersion` are stored in `StageSnapshot` but never compared. Understanding edit patterns across projects reveals which parts of the AI pipeline produce output closest to what users actually want.

## Solution

Add a Track Changes diff view accessible from the admin dashboard's Completion Funnel. Click a stage bar → see summary stats → navigate to a detail page showing project-by-project inline diffs.

---

## Stage ID Mapping

The app uses 4 stages internally (`StageLayout.tsx`):

| Stage ID | Name | API Name | Has AI→Human diff? |
|----------|------|----------|---------------------|
| 1 | Video Briefing | `brief` | No (user fills, AI generates fields — different flow) |
| 2 | Video Outline | `outline` | **Yes** — AI generates outline text, user edits |
| 3 | Storyboard Draft | `draft` | **Yes** — AI generates screens JSON, user edits |
| 4 | Review and Share | `polish` | No (no AI generation) |

The admin Completion Funnel displays 5 bars (Briefing, Outline, Evidence Research, Storyboard Draft, Review & Share). The funnel's "Outline" maps to `stage_id = 2` and "Storyboard Draft" maps to `stage_id = 3` in `StageSnapshot`.

---

## User Flow

1. Admin opens dashboard → sees Completion Funnel
2. Clicks **Outline** or **Storyboard Draft** bar → accordion expands below with: project count, avg edit rate, "View all diffs →" link
3. Clicks "View all diffs →" → navigates to `/admin/drift/outline` or `/admin/drift/storyboard`
4. Detail page: collapsible project list, each showing Track Changes view of all changed fields

Only Outline and Storyboard Draft bars are clickable — other stages don't have meaningful AI→Human comparisons.

---

## Changes

### 1. Completion Funnel — clickable bars

**File:** `frontend/src/components/admin/AdminDashboard.tsx`

Make Outline and Storyboard Draft funnel bars clickable. On click, toggle an accordion panel below the bar showing:
- `N projects reached this stage`
- `Avg edit rate: X%`
- `View all diffs →` link (navigates to `/admin/drift/:stageName`)

Non-diff stages (Briefing, Evidence Research, Review & Share) remain non-clickable.

### 2. Backend endpoint — all snapshots

**Files:**
- `backend/app/main.py` — new endpoint
- `backend/app/db/repository.py` — new repository method `get_all_stage_snapshots()`

New endpoint: `GET /api/admin/stages/all`

Returns all `StageSnapshot` records across all projects, grouped by project. Admin-only (uses `X-User-Id` header + `verify_admin()`, same as existing admin endpoints). Requires `Depends(get_db)` for async DB session.

Response shape:

```json
{
  "projects": [
    {
      "project_id": "abc123",
      "project_name": "How Attention Mechanisms Work",
      "created_at": "2026-03-18T...",
      "stages": {
        "2": { "ai_version": "...", "human_version": "..." },
        "3": { "ai_version": "...", "human_version": "..." }
      }
    }
  ]
}
```

Only returns stages 2 and 3 (outline and storyboard draft).

### 3. Diff utility — field-level comparison

**File:** `frontend/src/components/admin/drift/diffUtils.ts` (new)

Pure functions that take AI and human versions and produce a flat list of field diffs.

**Outline diffing:**
- Parse both `aiVersion` and `humanVersion` with `parseOutline()` (named export from `OutlineBuilder/outlineParser.ts`)
- Compare sections by index position
- For each section, compare fields: `title`, `purpose`, `entryAssumption`, `exitState`, `duration`, `talkingPoints[]`
- Detect: modified (value changed), added (human added new section/talking point), removed (human deleted), unchanged

**Storyboard diffing:**
- Both versions are JSON arrays of screen objects (`ProductionScreen` from `DraftBuilder/types.ts`)
- Compare screens by `screen_number`
- For each screen, compare fields: `voiceover_text`, `visual_direction` (string | string[]), `on_screen_visual`, `screen_type`, `duration`
- Normalize `visual_direction` to array before comparing (use `getVisualDirectionArray()` from `DraftBuilder/types.ts`)
- Same diff categories: modified, added, removed, unchanged

**Output shape:**

```ts
interface DiffResult {
  totalFields: number;
  changedFields: number;
  editRate: number;          // changedFields / totalFields
  sections: SectionDiff[];   // per-section or per-screen
}

interface SectionDiff {
  label: string;             // "Section 2: Core Mechanism" or "Screen 3"
  fields: FieldDiff[];
}

interface FieldDiff {
  field: string;             // "purpose", "talking_point", "voiceover_text"
  status: "modified" | "added" | "removed" | "unchanged";
  aiValue?: string;          // present for modified and removed
  humanValue?: string;       // present for modified and added
}
```

### 4. Detail page — Track Changes view

**File:** `frontend/src/components/admin/drift/DriftDetailPage.tsx` (new)

Route: `/admin/drift/:stageName` (stageName = "outline" or "storyboard")

**Layout:**
- Header: `← Dashboard` back link + page title ("Outline — Edit Diffs") + summary stats
- Project list: each project is a collapsible section
  - Project header: name + edit rate badge (click to expand/collapse)
  - Body: Track Changes document view

**Track Changes rendering:**
- Section headers in purple (e.g., "Section 2: Core Mechanism")
- Each field on its own line with a field label in small gray text
- Modified fields: ~~red strikethrough~~ for AI original, green highlight for human replacement, shown inline
- Added fields: green highlight with "(added)" annotation
- Removed fields: red strikethrough with "(removed)" annotation
- Unchanged fields: gray text, shown for context

### 5. Router — add drift route

**File:** `frontend/src/App.tsx`

Add route: `/admin/drift/:stageName` → `DriftDetailPage`

---

## What does NOT change

- `StageSnapshot` schema — no new columns or tables
- Auto-save flow — no changes to how `aiVersion`/`humanVersion` are captured
- Existing admin dashboard cards (KPIs, satisfaction ratings) — untouched
- User-facing project workflow — no changes
- Backend agent pipeline — no changes

---

## Edge cases

- **Project with no edits (humanVersion is null):** If `humanVersion` is null, treat as "no user edits" — show with "0% edited" badge, collapsed by default. This is the common case when a user never edited or session crashed before auto-save.
- **Project with no edits (humanVersion equals aiVersion):** Same treatment — "0% edited", collapsed.
- **Project with no storyboard yet:** Stage 3 snapshot doesn't exist → skip project in storyboard diff view.
- **Missing aiVersion:** If `aiVersion` is null (shouldn't happen, but defensive) → skip project entirely.
- **Old projects with legacy data format:** Outline parser already handles backward compat. Storyboard JSON may have `on_screen_visual_keywords` (string) vs `visual_direction` (array) — normalize via `getVisualDirectionArray()` before diffing.

# Backlog — Standardize All UI

## Task: Standardize UI Across All Stages

Audit and normalize all stage panels (BriefBuilder, OutlineBuilder, DraftBuilder, ReviewBuilder) and shared chrome (nav, headers, footers) for visual consistency.

### Requirements
- Audit all stage headers: same font size, weight, spacing, description style, icon usage (or no icons)
- Audit all stage content areas: consistent max-width, padding, left-alignment
- Audit stats/metadata badges: same format everywhere (bg-muted/50 rounded-lg badges vs inline text — pick one)
- Audit typography tokens: text-lg vs text-xl, text-sm vs text-base — unify across siblings
- Audit spacing: consistent py/px on headers, footers, content areas
- Audit action buttons/footers: same position, style, spacing across stages
- Follow design tokens (--text-muted: #626B58, --bg: #FFFFFF, white surfaces, WCAG-compliant)
- Reference CLAUDE.md lessons: "Visual consistency across sibling components", "Layout hierarchy — separate chrome width from content width"
- Document the final token/pattern decisions so future components stay consistent

### Known inconsistencies (from CLAUDE.md lessons)
- Stage headers have inconsistent typography (text-lg vs text-xl)
- Description sizes vary (text-base vs text-sm)
- Icons: some headers have icons, others don't
- Stats format: badges in one place, inline text in another
- Chrome vs content max-width not always separated

### Key files
- `frontend/src/components/BriefBuilder/` — Stage 1
- `frontend/src/components/OutlineBuilder/` — Stage 2
- `frontend/src/components/DraftBuilder/` — Stage 4
- `frontend/src/components/ReviewBuilder/` — Stage 5
- `frontend/src/components/StageContent.tsx` — stage routing
- `frontend/src/components/StageNavigation.tsx` — sidebar nav
- `frontend/src/components/StoryboardLayout.tsx` — main layout wrapper

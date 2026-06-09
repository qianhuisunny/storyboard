# Backlog — Redesign Storyboard Panel

## Task: Redesign Storyboard Draft Panel (Stage 4)

The current storyboard draft panel (DraftBuilder) needs a visual redesign. This is the screen-by-screen production storyboard view where users see voiceover text, visual direction, screen types, and placeholder images.

### Requirements
- Redesign the DraftBuilder panel layout and visual style
- Follow existing design tokens (white bg, WCAG-compliant muted text, clean Scandinavian aesthetic)
- Reference professional tools (Notion, Linear, SessionLab) for design patterns
- Create standalone HTML preview first (`frontend/preview-storyboard-panel.html`) for design iteration before touching React
- Present A/B/C design options for user to choose from
- Must display: screen number, screen type, voiceover text, visual direction, action notes, duration, placeholder images
- Ensure consistency with other stage panels (OutlineBuilder style, same typography/spacing tokens)

### Key files
- `frontend/src/components/DraftBuilder/` — current storyboard draft components
- `frontend/src/components/DraftBuilder/types.ts` — screen types and config
- `frontend/src/components/OutlineBuilder/` — reference for design consistency
- Design tokens in CLAUDE.md (--text-muted: #626B58, --bg: #FFFFFF, etc.)

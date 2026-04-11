# Video Pipeline UI — Design Spec

**Date:** 2026-04-10
**Goal:** Ship a visual inspector for the video generation pipeline so that every pipeline run produces a clickable, self-contained HTML page for reviewing each raw per-panel clip (pre-stitch) alongside its model provenance.

---

## Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Venue (Phase 1) | Standalone HTML written to `output_dir/index.html` | Memory-documented preference: always preview before touching React. Zero frontend/backend changes; each pipeline run is self-contained. |
| Venue (Phase 2, later) | React page inside Plotline frontend | Deferred — sketched only, not implemented in this change. |
| Layout | Player (main) + tile timeline (bottom of left column) + inspector (full-height right sidebar 260px) | Picked variant A during brainstorming visual companion review. |
| Player semantics | Raw clip browser — click tile swaps `<video src>` to `clips/panel_XX.mp4` | User preference: inspect pre-stitch clips one at a time rather than scrub the final stitched MP4. |
| Tile width | Proportional to panel duration via flexbox `flex-grow` (no overflow) | Picked variant B during brainstorming; `flex-grow` (not fixed %) guarantees the 16 tiles always fit inside the container after gap subtraction. |
| Inspector content | Only **Video model** + **Voice model** (two rows, provider naming), plus the panel header | Explicit user direction: remove voiceover script, visual direction, paths, props, words. |
| Voice naming convention | Use provider-native names (`OpenAI tts-1-hd` / `alloy`), no friendly aliases | User direction. |
| Data plumbing | Pipeline writes an enriched `manifest.json` alongside the HTML; HTML fetches it on load | Minimum viable; works over any `python3 -m http.server` session in `output_dir`. |

---

## Layout

```
┌──────────────────────────────────────────┬─────────────────┐
│  [top nav — Plotline · breadcrumb]       │                 │
├──────────────────────────────────────────┤                 │
│                                          │                 │
│         VIDEO PLAYER                     │   INSPECTOR     │
│         (raw clips/panel_XX.mp4)         │   260px         │
│                                          │   full-height   │
│                                          │                 │
├──────────────────────────────────────────┤                 │
│  [timeline with 16 proportional tiles]   │                 │
└──────────────────────────────────────────┴─────────────────┘
```

- Player is a real `<video>` element with native controls.
- Tile widths are `flex-grow: <duration_seconds>` so longer panels take more horizontal space.
- Tile color distinguishes screen type: dark sage for `talking_head`, white for `slides`, mid sage for `stock_video`.
- Clicking a tile: (a) sets the `<video src>` to that panel's `clip_path`, (b) sets the panel as `active` in the timeline, (c) updates the inspector content, (d) autoplays.

## Inspector Content (per panel)

Exactly four elements, in this order:

1. **Panel title row** — `Panel 04` · duration `20.5s`.
2. **Screen-type badge** — `SLIDES` / `TALKING HEAD` / `STOCK VIDEO`.
3. **Video model row** — label + sublabel.
4. **Voice model row** — label + sublabel.

Video model per screen type:

| Screen type | Video model label | Video model sublabel |
|---|---|---|
| `talking_head` | `HeyGen · {avatar_id}` (e.g. `HeyGen · Lisa_public`) | `Photo Avatar · audio-driven` |
| `slides` | `Remotion · {template}` (e.g. `Remotion · SplitComparison`) | `local react renderer` |
| `stock_video` | `Pexels · {pexels_video_id}` | `{pexels_query}` |

Voice model (same for every panel, per current pipeline architecture):

| Label | Sublabel |
|---|---|
| `OpenAI tts-1-hd` | `{config.voice}` (default `alloy`) |

---

## Data Plumbing

The existing pipeline already writes `output_dir/manifest.json` with a `per_panel` array containing `panel_number`, `screen_type`, `voiceover_words`, `duration`, plus per-screen-type metadata (HeyGen video_id, Remotion template, Pexels video_id, etc.). The UI needs two additions per entry:

1. `clip_path`: relative path from `output_dir` to the raw clip (e.g. `"clips/panel_04.mp4"`).
2. `video_model`: a dict `{label: str, sublabel: str}` computed at write time from the screen-type-specific fields already collected.
3. `voice_model`: a dict `{label: str, sublabel: str}` — always OpenAI tts-1-hd + `config.voice`.

Plus two top-level additions to the manifest:

- `total_duration_seconds`: sum of per-panel durations (so the UI doesn't have to recompute).
- `storyboard_title`: the parsed storyboard's `title` (so the top nav breadcrumb is populated).

This is the only backend change. No new services, no new endpoints.

---

## HTML Template

The HTML lives as a static file at `backend/app/services/video/preview_template.html`. The pipeline copies it verbatim into `output_dir/index.html` at the end of a run. The HTML:

- Fetches `./manifest.json` on `DOMContentLoaded` (same-origin relative path).
- Builds the tile strip dynamically from `manifest.per_panel`, applying `flex-grow` equal to each tile's `duration`.
- Installs a click handler on each tile that swaps the player's `src` to `./clips/panel_XX.mp4` and updates the inspector.
- On first load, auto-selects panel 1 so the UI is not empty.
- Is fully self-contained: one file, inline CSS and JS, no external assets except Google Fonts (Fraunces + Nunito — already the Plotline design system).
- Uses the Plotline sage palette (`--sage-1` through `--sage-10`) exactly as defined in `frontend/src/index.css`.

---

## Sample Fixture Generator

For the user to preview the UI without running the real pipeline (which costs ~$0.55/run and ~10 minutes of API time), we ship a generator script — not a committed binary fixture:

- **Script:** `python -m video.preview sample` builds a complete preview at `data/video_output_sample/` containing:
  - `manifest.json` — built from the fields of `tests/fixtures/sample_storyboard.json`, with plausible `video_model` / `voice_model` values.
  - `index.html` — copy of the preview template.
  - `clips/panel_01.mp4 … panel_16.mp4` — 16 symlinks (or copies) to a single `placeholder.mp4` generated on the fly by ffmpeg from a solid dark frame with ~2 seconds of silence.
- **Why generated, not committed:** `data/` is gitignored per `CLAUDE.md`, and binaries bloat the repo. The generator is deterministic and cheap (~1s total).
- **Usage:** The log file for this session includes a one-liner the user can run in the morning to regenerate the sample and open it with `python3 -m http.server` in the fixture directory.

Opening `data/video_output_sample/index.html` in a browser after running the sample script gives a working end-to-end preview of the UI using real panel metadata from the production storyboard.

---

## Testing Strategy

Three layers:

1. **Unit tests (`tests/test_preview.py`)**
   - `build_manifest_entry()` produces correct `video_model`/`voice_model` for each screen type.
   - Given a list of fake panel dicts, `write_preview(output_dir, manifest_dict)` copies the template and writes `manifest.json` atomically.
   - The template file exists and contains a `<script>` block that references `manifest.json` and `clip_path`.

2. **Fixture snapshot** — the `data/video_output_sample/` directory is committed (gitignored rule exception) so any HTML/CSS change is reviewable via `git diff`.

3. **Manual smoke test** — the user runs `python3 -m http.server 8765` in `data/video_output_sample/` and opens `localhost:8765/` in a browser; the log file lists this as the final verification step.

---

## Phase 2 Sketch (NOT implemented in this change)

Once the standalone HTML is approved, port it to a React component:

- New component `frontend/src/components/VideoPreview/VideoPreview.tsx` reusing the same sage-token CSS.
- New backend route `GET /api/video/{project_id}/manifest` returns the same manifest JSON.
- New backend route `GET /api/video/{project_id}/clips/{filename}` streams the mp4 (FastAPI `FileResponse` with range support).
- New row in `StageNavigation.tsx`: a "Video Preview" stage after Review.
- React page uses `useEffect` + `fetch` to get the manifest and `<video>` + click handler exactly as in the standalone.

Not specced in detail here — a separate plan will cover this after Phase 1 ships.

---

## Out of Scope

- Editing panels from the UI (this is read-only).
- Re-rendering individual panels from the UI.
- Cost display in the inspector (could come later if needed).
- Per-tile tooltips on hover.
- A "play all panels in sequence" mode — if the user wants that they watch `final.mp4` directly.

---

## Open Questions

None — all architectural questions were resolved during the visual brainstorming session. The only user-facing uncertainty is whether the Phase 2 React port will ever be scheduled; that decision waits until the user has lived with Phase 1 for a few days.

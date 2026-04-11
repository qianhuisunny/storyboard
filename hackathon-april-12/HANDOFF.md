# Plotline — April 12 Hackathon Handoff

**Branch:** `video_storyboarding`
**Packaged:** 2026-04-11 (overnight session)
**Last shipped final:** `./final.mp4` — 6:23, 16 panels, ~$0.67 to regenerate

This folder is the landing page for the April 12 hackathon snapshot. Everything a fresh pair of eyes needs to understand, play, or regenerate the video lives here or one `cd` away.

> **⚠️ Videos are NOT committed.** The initial push of this branch to GitHub was too large to transmit reliably over SSH (~300 MB of accumulated loose objects, of which the videos alone were ~118 MB). To keep the push under size limits, `final.mp4` and `clips/*.mp4` were excluded from the commit. They still live in the author's local working tree at `hackathon-april-12/final.mp4` + `hackathon-april-12/clips/panel_*.mp4`, but fresh clones will see only `HANDOFF.md`, `storyboard.json`, and `manifest.json`. **Regenerate them via the steps in "How to regenerate" below** — cost ~$0.67, runtime ~12 min.

---

## What's in this folder (after regeneration)

| File | Tracked? | Purpose |
|---|---|---|
| `HANDOFF.md` | ✅ git | You are here |
| `storyboard.json` | ✅ git | The storyboard fixture the pipeline consumed. Copied verbatim from `backend/app/services/video/tests/fixtures/sample_storyboard.json` |
| `manifest.json` | ✅ git | Run manifest from the pipeline — per-panel metadata (template picked, pexels query used, heygen video id, on-screen text, word timings). Copied from `data/video_output/manifest.json` |
| `final.mp4` | ❌ regenerate | Stitched 6:23 video from a full pipeline run (~58 MB). Not in git. |
| `clips/panel_01.mp4 … panel_16.mp4` | ❌ regenerate | Individual pre-stitch panel clips (~60 MB total). Not in git. Regenerate alongside `final.mp4`. |

Architecture + API reference lives in `../docs/april-12-hackathon.md` — keep that one open alongside this note.

---

## Panel breakdown (final render)

| # | Type | Notes |
|---|---|---|
| 1 | talking_head | Opening hook — Lisa_public avatar via HeyGen |
| 2 | slides | |
| 3 | slides | |
| 4 | stock_video | Pexels B-roll + TTS overlay |
| 5 | talking_head | Emphasis beat |
| 6 | stock_video | |
| 7 | stock_video | **NEW** — converted from slides to stock_video+text_overlay ("Career Decisions No Mentor Has Navigated") |
| 8 | slides | |
| 9 | slides | |
| 10 | slides | SplitComparison "Distributed vs. Networked Nodes" — **see Known Issues** |
| 11 | stock_video | **NEW** — converted from slides to stock_video+text_overlay ("Networks and Access") |
| 12 | slides | |
| 13 | slides | |
| 14 | slides | |
| 15 | talking_head | CTA hook |
| 16 | slides | |

Three render paths: talking_head → OpenAI TTS → HeyGen audio-driven avatar. stock_video → Pexels search → ffmpeg overlay with Pillow-rendered title bar. slides → GPT-4o template pick → Whisper word timestamps → Remotion render with per-element fade-ins.

---

## What's new in this commit (since `docs/video-ui-session-2026-04-10.md` closed out)

This single "April 12th hackathon" commit bundles several distinct pieces of work. They're grouped here because the hackathon team pulls the repo once and needs everything in one snapshot.

### 1. Hard 2-second empty-frame rule (`backend/app/services/video/slides.py`)

**What:** `_enforce_max_empty_gap()` replaces the old `_compress_to_early_window()`. Rule: the first element on every slide lands at 0.0s, and each subsequent element lands no more than 2.0s after the previous one. Controlled by `MAX_EMPTY_GAP_SEC = 2.0`. The alignment LLM's absolute timestamps are **overwritten** — only the relative ordering is preserved.

**Why:** Panel 10 in a previous render had 28 seconds of blank "title-only" frame before the first card appeared, because the alignment LLM was semantically faithful (it waited for the narrator to literally say the word) but visually catastrophic on long voiceovers. User codified: *"never have an empty screen for more than 2s"*.

**Blast radius:** Every slide panel's reveal rhythm changes. `_fallback_even_spacing()` was updated to honour the same rule. 65/65 video tests pass.

### 2. Illustrated icons on SplitComparison (`remotion/src/components/SplitComparison.tsx`)

**What:** New `SPLIT_ICON_REGISTRY` with 4 hand-authored pairs in a consistent sage-on-sage style:

| Pair | Left | Right | Semantic contrast |
|---|---|---|---|
| isolated ↔ connected | `distributed-nodes` | `networked-nodes` | fragmented vs. flowing knowledge |
| one ↔ many | `person-single` | `person-group` | individual vs. team |
| fixed ↔ branching | `arrow-linear` | `arrow-branching` | single path vs. multiple options |
| closed ↔ open | `lock-closed` | `lock-open` | blocked vs. open access |

Each icon is a 0-120 viewBox SVG fragment with `currentColor` fills and sage stroke, rendered at 160×160 inside a pale-sage rounded container. No external icon libraries.

**The "vs" separator** between cards now tracks `max(leftOpacity, rightOpacity)` instead of being always-visible — eliminates the "just 'vs' floating alone in the middle of an empty slide" state from earlier renders.

### 3. Slide generator prompt teaches the LLM about icons (`prompts/SLIDE_GENERATOR_PROMPT.md`)

`SplitComparisonProps.left` and `.right` now have an optional `icon?: IconKey` field. The prompt lists all 4 available pairs with a "use when" table, and enforces: **pairs only, never singles, never invent keys**. If no pair fits, LLM omits `icon` entirely and the component falls back to text-only cards.

### 4. Timeline opening-question overlay (`remotion/src/components/Timeline.tsx`)

Optional `openingQuestion` prop: words fade in one-at-a-time synced to Whisper word timestamps, then the whole block fades out at `fadeOutAt` before the timeline events start appearing. When this prop is present the Timeline **suppresses its own title/subtitle** — the question itself IS the framing. `SlideWrapper` now collapses its title block when given an empty title, so the question vertically centers in the full frame.

### 5. Stock video text overlay (`backend/app/services/video/stock_video.py`)

`overlay_audio_on_video()` accepts optional `title` and `subtitle` args and composites a semi-transparent black title bar onto the Pexels footage. Rendered via Pillow into a transparent PNG (because the Homebrew ffmpeg build here was compiled without `--enable-libfreetype` and has no `drawtext` filter), then composited with an `overlay` filter-complex chain. `stock_title` / `stock_subtitle` fields flow through `models.Panel` → `parser.parse_storyboard` → `pipeline` → `create_stock_video_panel`.

### 6. TTS hardening (`backend/app/services/video/tts.py`)

Explicit `timeout=60.0, max_retries=3` on the OpenAI client. A hung TTS call was otherwise blocking on the SDK's 10-minute default, stalling entire pipeline runs.

### 7. Fly.io nginx resolver fix (`frontend/nginx.conf`)

`location /api/` block now uses `resolver 8.8.8.8 ipv6=off` + `set $backend ...` + explicit `proxy_ssl_name`. Fixes intermittent DNS failures when the frontend container proxies to `plotline-eval-api.fly.dev`.

### 8. Memory + docs

- `memory/feedback_2s_empty_frame_rule.md` — the 2s rule, reasoning, and enforcement sites
- `memory/user_pref_split_comparison_icons.md` — icon style spec, approved on Panel 10
- `docs/april-12-hackathon.md` — pipeline architecture with cost table
- `docs/superpowers/specs/2026-04-08-video-generation-pipeline-design.md`
- `docs/superpowers/plans/2026-04-08-video-generation-pipeline.md`

---

## ⚠️ Known issues — read before demoing

### The bundled `clips/panel_10.mp4` is STALE

The `final.mp4` and `clips/panel_10.mp4` in this folder were rendered **before** the 2-second empty-frame rule landed in `slides.py`. Panel 10 in these files still has ~28 seconds of empty opening (title visible, left card not showing until ~30s, right card never appearing).

**Fix:** re-render panel 10 (or the whole pipeline) using the current code. See "How to regenerate" below. Estimated cost for just panel 10: < $0.05. Estimated time: ~30 seconds.

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m video generate \
  --storyboard app/services/video/tests/fixtures/sample_storyboard.json \
  --only-panels 10 \
  --skip-tts --skip-avatar
```

Then re-copy `data/video_output/clips/panel_10.mp4` and `data/video_output/final.mp4` into this folder.

### Stock video title overlay is untested on a real pipeline run

`stock_video.py` has the new Pillow-rendered title bar code path, and `sample_storyboard.json` has `stock_title` / `stock_subtitle` set on panels 7 and 11. But the bundled `clips/panel_07.mp4` and `clips/panel_11.mp4` were rendered **before** that code landed — they don't have the title bar. Re-render them to verify.

```bash
PYTHONPATH=app/services python -m video generate \
  --storyboard app/services/video/tests/fixtures/sample_storyboard.json \
  --only-panels 7,11 \
  --skip-tts --skip-avatar
```

### Storyboard metadata is generic

`storyboard.json`'s `title` field is the string `"Video Storyboard"`. Bland for a demo. Consider setting it to something like `"Women in Tech: The Two-Track Advocacy Problem"` before Tuesday. Pure cosmetic — doesn't affect the render.

---

## How to regenerate this bundle from scratch

```bash
# 1. Backend venv + deps
cd backend
source venv/bin/activate   # or use /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend/venv/bin/python directly
pip install -r requirements.txt   # first time only

# 2. Full pipeline run (uses OpenAI + HeyGen + Pexels + litterbox.catbox.moe)
PYTHONPATH=app/services python -m video generate \
  --storyboard app/services/video/tests/fixtures/sample_storyboard.json

# This writes data/video_output/{final.mp4, manifest.json, clips/, slides/, audio/, index.html}
# Total time: ~12 min, total spend: ~$0.67

# 3. Repackage
cd ..
rm -rf hackathon-april-12/clips hackathon-april-12/final.mp4 hackathon-april-12/manifest.json
mkdir -p hackathon-april-12/clips
cp data/video_output/final.mp4 hackathon-april-12/final.mp4
cp data/video_output/manifest.json hackathon-april-12/manifest.json
cp data/video_output/clips/panel_*.mp4 hackathon-april-12/clips/
cp backend/app/services/video/tests/fixtures/sample_storyboard.json hackathon-april-12/storyboard.json
```

**Required env vars** (`backend/.env`, never commit):
- `OPENAI_API_KEY` — TTS + Whisper + GPT-4o
- `HEYGEN_API_KEY` — talking-head avatar (X-Api-Key header, not Bearer)
- `PEXEL_API_KEY` — stock footage (note: singular, not PEXELS)

**Skip flags** for iterative work:
- `--skip-tts` — reuse existing audio files in `data/video_output/audio/`
- `--skip-avatar` — reuse existing HeyGen clips
- `--only-panels 10,11` — render specific panels only

---

## Preview UI (debugging a run)

Every pipeline run writes an `index.html` next to `manifest.json`. To inspect a run interactively:

```bash
cd data/video_output   # or hackathon-april-12/, it works there too
python3 -m http.server 8765
# open http://localhost:8765/
```

The UI shows a clickable timeline of panel tiles, a `<video>` player that swaps to the selected clip, and an inspector panel showing each panel's video model + voice model + on-screen text + voiceover script.

Full context on the preview UI: `docs/video-ui-session-2026-04-10.md`.

---

## Key files to read first (with line numbers)

| File | What to look at | Why |
|---|---|---|
| `backend/app/services/video/slides.py:228-324` | `_enforce_max_empty_gap()` + `MAX_EMPTY_GAP_SEC` | The 2s rule enforcement point |
| `backend/app/services/video/pipeline.py:199-273` | `SLIDES` branch of `run_pipeline()` | Where align + render stitches together |
| `backend/app/services/video/stock_video.py:253-470` | `_render_title_bar_png()` + `overlay_audio_on_video()` | Stock video title overlay code path |
| `remotion/src/components/SplitComparison.tsx:20-250` | Icon registry + card rendering | Where to add new icon pairs |
| `remotion/src/components/Timeline.tsx:90-200` | Opening question overlay | Panel 9 Q&A-style framing |
| `prompts/SLIDE_GENERATOR_PROMPT.md` | Icon table | Where to register new icon keys for the LLM |
| `backend/app/services/video/models.py:14-30` | `Panel` dataclass | Stock_title / stock_subtitle are optional fields |
| `docs/april-12-hackathon.md` | Full pipeline diagram + API cost table | Starting point for anyone new to the project |

---

## TODOs for tomorrow (prioritized)

1. **Re-render panel 10** to get the 2s rule applied (see Known Issues §1). 30 seconds of work, unblocks the demo.
2. **Re-render panels 7 and 11** with the new stock_video title overlay (see Known Issues §2). ~1 minute.
3. **Smoke-test the full pipeline** end-to-end once with all recent changes in play. ~12 min, ~$0.67.
4. **Update storyboard.json title** from the generic "Video Storyboard" to something demo-appropriate.
5. **Optional**: run `python -m video generate --only-panels 9` if panel 9 uses the new Timeline `openingQuestion` overlay — verify the question centers correctly in the full frame.
6. **Optional**: expand `SPLIT_ICON_REGISTRY` if any panel's contrast doesn't fit the existing 4 pairs. Hand-author new pairs in the same sage-on-sage style (see `memory/user_pref_split_comparison_icons.md`).

---

## One-line mental model

> Narration is deterministic (TTS audio duration = source of truth). Visual reveal rhythm is a product decision (`MAX_EMPTY_GAP_SEC = 2.0`). The alignment LLM tells us the order, not the clock.

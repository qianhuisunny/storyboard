# Video Pipeline UI — Overnight Session Log

**Session started:** 2026-04-10 (evening) — finished into 2026-04-11
**Branch:** `video_storyboarding`
**Authorization:** "我累了 你自己决定 自己执行 给我一个log 我明天来看"

---

## TL;DR

Preview UI is built and committed. To see it in your browser:

```bash
cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/data/video_output_sample
python3 -m http.server 8765
# then open http://localhost:8765/
```

That directory already exists from the verification run. If you want to regenerate it fresh (or if it got deleted), run:

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m video sample
```

The real payoff is that **every future `python -m video generate` run writes its own `index.html` into the output directory** alongside `manifest.json` and `clips/`. So after a real pipeline run, the preview just works on that run's output — no extra step needed.

---

## What I decided

You had three options for venue, I picked **C — two-phase**:

- **Phase 1 (shipped tonight):** standalone HTML inspector, written into `output_dir/index.html` by the pipeline. Zero React changes, zero backend route changes. Every pipeline run is self-inspecting.
- **Phase 2 (deferred, not touched):** port to a React page inside Plotline frontend at `/video/:projectId`. Sketched in the spec but not implemented.

Why C over A or B: your memory says "always preview before live code — create standalone HTML on a separate port for design iteration before touching React." Phase 1 IS that preview, and crucially it's not throwaway — even after you port to React, the standalone HTML still lives inside every output directory as a debug/QA tool. It's load-bearing, not scaffolding.

---

## Design decisions locked in during brainstorming (browser mockups)

| Decision | Value | Chosen via |
|---|---|---|
| Layout | A — player main + timeline below + 260px full-height right sidebar | A/B mockup pick |
| Inspector content | ONLY video model + voice model, rest deleted | Your explicit "其余全部去掉" |
| Model naming | Provider-native (HeyGen · Lisa_public / OpenAI tts-1-hd / alloy) | Your "用模型提供商的模型命名" |
| Tile width | Proportional to `duration_seconds` via flexbox `flex-grow` | A/B pick, then fixed overflow bug |
| Player semantics | Raw clip browser — click tile = swap `<video src>` to `clips/panel_XX.mp4` | Your "每一段拿 stitch.py stitch 之前的 raw material" |
| Timeline overflow | Never — flex-grow + min-width 0 instead of fixed %. Gaps auto-subtracted | Fix after your "不要溢出" |

Three screen types get three tile colors: `talking_head` dark sage, `slides` white, `stock_video` pale green.

---

## What got built

### Spec + plan
- `docs/superpowers/specs/2026-04-10-video-pipeline-ui-design.md` (commit `d7eaad1`) — full design spec with trade-offs, data plumbing, and Phase 2 sketch.

### Phase 1 code (commit `84513e2`)

| File | Purpose |
|---|---|
| `backend/app/services/video/preview.py` (new, ~260 LOC) | `build_video_model` / `build_voice_model` / `enrich_manifest` / `write_preview` / `make_sample` |
| `backend/app/services/video/preview_template.html` (new, ~430 LOC) | Self-contained inspector: Plotline sage tokens + vanilla JS that fetches `./manifest.json` and wires click handlers |
| `backend/app/services/video/tests/test_preview.py` (new, 17 tests) | Per-screen-type video model builders, manifest additivity, template integrity, sample fixture generator |
| `backend/app/services/video/pipeline.py` (modified) | Added `enrich_manifest(...)` + `write_preview(output_dir)` at end of `run_pipeline`. Additive only — no existing fields renamed or dropped. |
| `backend/app/services/video/__main__.py` (modified) | New `sample` subcommand: `python -m video sample [--output PATH]` |

### Verification done tonight

- **Unit tests:** 17/17 new preview tests passing. Full video test suite: **64/64 passing**. Zero regressions.
- **End-to-end fixture generation:** ran `python -m video sample` — produces `data/video_output_sample/` with `index.html`, `manifest.json`, `placeholder.mp4`, and 16 `clips/panel_XX.mp4` symlinks.
- **HTTP serving smoke test:** brought up `python3 -m http.server 8765` in the sample dir and curl'd:
  - `GET /` → 200, template HTML served
  - `GET /manifest.json` → 200, 8180 bytes
  - `HEAD /clips/panel_01.mp4` → 200, Content-Type: video/mp4, Content-Length: 6346 (the placeholder)
- **Manifest content sanity-checked:** Panel 01 talking_head shows `HeyGen · Lisa_public` / `OpenAI tts-1-hd · alloy`, Panel 02 slides shows `Remotion · DataCard`, Panel 04 stock_video shows `Pexels · 12345004`.

What I **could not** verify tonight: the actual JavaScript running in a real browser (no headless browser in my tool set). The HTML parses, the element IDs are all present, and the test asserts the required hooks exist, but the click-to-swap-video behavior is only exercised when you open the page in Chrome/Safari tomorrow.

---

## The one gotcha you should know about

The browser test I want you to do:

1. Open the preview in your browser
2. Click a tile
3. Verify the inspector on the right updates with that panel's model info
4. Verify the `<video>` element swaps to the corresponding clip
5. Try the `←` / `→` arrow keys to move between panels

If any of those don't work, it's in the `init()` function inside `preview_template.html` — search for `selectPanel` and the template is small enough (~90 lines of JS) to trace by eye.

---

## Things I deliberately did NOT touch

- **Existing pipeline behavior** — the manifest enrichment is strictly additive. Every existing consumer of `manifest.json` (if any) keeps reading `storyboard`, `config`, `per_panel[i].template`, `per_panel[i].heygen_video_id`, `.pexels_query`, etc. unchanged. I only added keys, never removed or renamed.
- **React frontend** — not touched. This is the Phase 2 deferred work.
- **`data/video_output_sample/`** — generated, but `data/` is gitignored so nothing committed.
- **Other in-progress files in `git status`** — `frontend/nginx.conf`, Remotion component updates, `transcribe.py`, etc. Those are your other in-flight work, I left them alone.

---

## Known issues & things to double-check

1. **Autoplay on tile click:** browsers block `<video>.play()` without a user gesture, but a click *is* a user gesture so it should work. I handle the rejection promise either way so it fails gracefully if a browser still blocks it.
2. **Fixture panel 01 duration vs talking_head skip:** when a real pipeline run uses `--skip-avatar`, talking-head panels never get a `duration` field. I added a unit test for this (`test_enrich_manifest_tolerates_panel_with_missing_duration`) — it records 0.0 and the tile will be 0-width in the timeline. Not ideal but doesn't crash. If it bugs you, we can default talking-head duration to `panel.duration_seconds` from the storyboard in the skip branch inside `pipeline.py`.
3. **Only valid on localhost server:** if you `open file://.../index.html` directly, the `fetch('./manifest.json')` call fails with a CORS-y error because file:// fetches are blocked. The template detects this and shows a red banner telling you to run `python3 -m http.server`. If you ever see that banner, that's why.
4. **Backend venv alias gotcha:** the shell alias `python → /Users/qianhuisun/venv/bin/python` overrides `source venv/bin/activate`. If tests don't find `httpx`/`openai`, call the binary directly: `/Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend/venv/bin/python -m pytest ...`. This bit me once tonight.

---

## Commits landed

```
84513e2 feat(video): standalone HTML preview UI for raw pre-stitch clips
d7eaad1 docs(video-ui): design spec for per-panel raw clip browser
```

Both on `video_storyboarding`. Not pushed — your call on when to push and whether to merge to `main`.

---

## Phase 2 — the React port (when you're ready to schedule it)

Everything you need is already written up in the spec under "Phase 2 Sketch." The short version:

- `frontend/src/components/VideoPreview/VideoPreview.tsx` — reuse the same sage-token CSS
- `GET /api/video/{project_id}/manifest` — returns enriched manifest JSON (already produced by the pipeline, so just a file-read endpoint)
- `GET /api/video/{project_id}/clips/{filename}` — FastAPI `FileResponse` with range support for `<video>` scrubbing
- New stage in `StageNavigation.tsx` after Review

That's a plan-and-execute session of its own, probably 2–3 hours of work. Not started tonight because you went to bed and my mandate was "decide and execute" for this one task.

---

## What's still open in the visual companion

The brainstorming server from tonight is still running at `http://localhost:50020` (or whatever port — see `.superpowers/brainstorm/26494-1775887296/state/server-info`). If you want to revisit the 5 mockup iterations from tonight, they live in:

```
.superpowers/brainstorm/26494-1775887296/content/
├── layout.html                    (A/B layout pick)
├── inspector-content.html         (initial inspector with 5 sections)
├── inspector-v2.html              (stripped to just video + voice model)
├── timeline-proportion.html       (A/B equal vs proportional)
├── timeline-proportion-v2.html    (proportional with overflow fix)
├── clip-browser-v3.html           (raw clip browser mode)
└── waiting-architecture.html      (placeholder while we did terminal architecture)
```

The server auto-exits after 30 min of inactivity so it's probably dead by morning, just restart it with `scripts/start-server.sh` if you want to open those HTML files through it. Or open them directly in your browser — they're static.

---

## How I'd suggest starting tomorrow

```bash
# 1. Preview what I built
cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/data/video_output_sample
python3 -m http.server 8765
# open http://localhost:8765 in browser

# 2. Click through tiles, try arrow keys, check the inspector updates

# 3. If it looks right, regenerate the sample from a clean slate to
#    prove the generator is reproducible:
cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon
rm -rf data/video_output_sample/
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m video sample

# 4. When you're happy with the preview, any real pipeline run will
#    now auto-write its own index.html:
PYTHONPATH=app/services python -m video generate \
    --storyboard app/services/video/tests/fixtures/sample_storyboard.json
# → outputs index.html alongside manifest.json + final.mp4
```

Sleep well.

# Video Generation Pipeline — Design Spec

**Date:** 2026-04-08
**Goal:** Turn a Plotline storyboard into a finished MP4 video using a hybrid pipeline — AI avatars for talking head panels, programmatic Remotion rendering for slides panels.

---

## Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Python CLI script (approach A) | Validate pipeline before integrating into Plotline product |
| TTS | OpenAI TTS (`tts-1-hd`) | Already have API key, good enough quality, cheapest. Swap to ElevenLabs if needed. |
| Talking Head | Kling Avatar 2.0 via Runware | $0.14/gen vs HeyGen $0.50-0.99/min. Lip-sync, 1080p/48FPS, 5-min consistency. |
| Slides | LLM + Remotion (approach B) | Best quality — LLM interprets visual direction, Remotion renders pixel-perfect |
| Scope | Full pipeline, all 15 panels | End-to-end: both tracks + stitching |

**Estimated cost per video:** ~$1.16

---

## Pipeline Overview

```
Storyboard JSON/PDF
  │
  ├─ Parse → 15 panels (split by screen_type)
  │
  ├─ TTS: OpenAI tts-1-hd → 15 x .mp3 (parallel)
  │
  ├─ TALKING HEAD track (7 panels):
  │    Kling Avatar 2.0 via Runware
  │    Input: speaker photo + audio .mp3
  │    Output: .mp4 per panel with lip-sync
  │
  ├─ SLIDES track (8 panels):
  │    LLM reads visual_direction → picks template + generates props JSON
  │    Remotion renders React component with props + audio → .mp4 per panel
  │
  └─ FFmpeg stitches 15 clips in order → final.mp4 (with crossfades)
```

---

## Project Structure

```
backend/app/services/video/
├── pipeline.py          # Main orchestrator
├── tts.py               # OpenAI TTS: script → .mp3
├── avatar.py            # Kling Avatar via Runware: photo + audio → .mp4
├── slides.py            # LLM → Remotion props → rendered .mp4
├── stitcher.py          # FFmpeg: ordered clips → final video
└── models.py            # Data models (Panel, StoryboardConfig, etc.)

remotion/                 # Separate Node.js project at repo root
├── src/
│   ├── components/       # 5 reusable slide templates
│   │   ├── PyramidChart.tsx
│   │   ├── SplitComparison.tsx
│   │   ├── Timeline.tsx
│   │   ├── ThreeColumn.tsx
│   │   └── DataCard.tsx
│   └── render.ts         # Entry: receives props JSON → renders MP4
├── package.json
└── remotion.config.ts
```

---

## Slide Template System

5 Remotion components cover all 8 slides panels:

| Template | Covers | Description |
|----------|--------|-------------|
| `PyramidChart` | Panels #2, #8 | Hierarchical data with percentages, org charts |
| `SplitComparison` | Panels #3, #5 | Left vs right with labels and metrics |
| `Timeline` | Panels #6, #12 | Horizontal/vertical with decision points |
| `ThreeColumn` | Panels #9, #11, #15 | Three items with headers, descriptions, details |
| `DataCard` | Panel #14 | Stats + simple diagram (chart, cycle, trend line). Also serves as fallback. |

---

## LLM → Remotion Flow

**System prompt** (`prompts/SLIDE_GENERATOR_PROMPT.md`):
- Describes all 5 templates with TypeScript props interfaces
- One example per template: visual direction → props JSON
- Constraint: must pick from existing templates, props must validate

**Per-panel call:**
```
System: [template catalog + schemas]
User:   [visual_direction text from storyboard panel]
→ LLM returns: { template, props, animation }
```

**Example output:**
```json
{
  "template": "PyramidChart",
  "props": {
    "title": "Women in Tech Leadership",
    "levels": [
      { "label": "Entry Level", "percentage": 45 },
      { "label": "Mid-Level", "percentage": 32 },
      { "label": "Senior Level", "percentage": 28 },
      { "label": "C-Suite", "percentage": 22 }
    ],
    "annotation": "Increasing Isolation",
    "direction": "upward"
  },
  "animation": "stagger_fade_in"
}
```

**Validation & fallback:** Python validates JSON against template schema → retry once if invalid → fall back to generic `DataCard` if still wrong.

**Rendering:**
```bash
npx remotion render src/index.ts PyramidChart \
  --props='...' --output=output/panel_02.mp4
```

---

## API Integration

### OpenAI TTS
- Model: `tts-1-hd`
- Single consistent voice across all 15 panels
- All 15 calls in parallel (~10s total)
- Output: `output/{id}/audio/panel_XX.mp3`

### Kling Avatar 2.0 via Runware
- Endpoint: Runware unified API → KlingAI Avatar 2.0
- Input: one speaker portrait photo + per-panel audio .mp3
- Async processing — poll until done
- 7 panels in parallel, ~1-3 min total
- Supports expression/gesture variation per panel
- Output: `output/{id}/clips/panel_XX.mp4`

### FFmpeg Stitching
- Concat demuxer for lossless joining
- 0.5s crossfade transitions between panels
- Output: `output/{id}/final.mp4`

---

## CLI Interface

```bash
python -m video.pipeline generate \
  --storyboard /path/to/storyboard.json \
  --avatar-image /path/to/speaker.png \
  --output ./output/

# Options
  --voice alloy              # OpenAI TTS voice
  --kling-model standard     # standard or pro
  --parallel 4               # max concurrent API calls
  --skip-tts                 # reuse existing audio files
  --skip-avatar              # reuse existing avatar clips
  --only-panels 1,3,5        # regenerate specific panels only
  --dry-run                  # preview without API calls
```

---

## Output Structure

```
output/{project_id}/
├── audio/
│   ├── panel_01.mp3 ... panel_15.mp3
├── clips/
│   ├── panel_01.mp4 ... panel_15.mp4
├── slides/
│   ├── panel_02.json ... (LLM-generated props for debugging)
├── final.mp4
└── manifest.json          # panel metadata, costs, timing
```

---

## Cost Estimate

| Component | Per video |
|-----------|----------|
| OpenAI TTS (5 min audio) | ~$0.08 |
| Kling Avatar via Runware (7 panels) | ~$0.98 |
| LLM calls for slides (8 panels) | ~$0.10 |
| **Total** | **~$1.16** |

---

## Dependencies

- **Python:** openai, httpx (for Runware API), ffmpeg-python
- **Node.js:** remotion, @remotion/cli, react
- **System:** ffmpeg installed locally
- **API keys:** OPENAI_API_KEY (existing), RUNWARE_API_KEY (new)

---

## Open Questions

1. **Storyboard input format:** For v1, manually convert the PDF storyboard to JSON matching the pipeline's Panel schema. Automated PDF parsing can be added later.
2. **Avatar photo:** Where does the speaker portrait come from? Stock photo? User upload? Generate one with AI?
3. **Remotion hosting:** Rendering locally is fine for CLI. If this becomes a product feature, Remotion Lambda (AWS) or Remotion Cloud would be needed.
4. **Transitions:** 0.5s crossfade between all panels, or different transitions for talking-head-to-slides vs slides-to-slides?

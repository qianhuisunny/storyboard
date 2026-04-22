# Keyframe Overlay System for Seedance Video Generation

## Problem

Seedance 2.0 generates visually compelling video but provides no control over what elements appear on screen or when. The model interprets prompts freely — it cannot reliably render specific text, data, or timed visual elements. We need a system that separates the **visual layer** (Seedance atmosphere) from the **information layer** (timed text, stats, badges).

## Architecture

Two-layer composition: Seedance generates the base video, Remotion renders timed overlay elements on top.

```
storyboard.json
    ↓
[1] TTS audio generation (existing)
    ↓
[2] LLM auto-generates keyframes[] per panel
    → user hand-edits in storyboard.json
    ↓
[3] Seedance generates base video per panel
    ├── talking_head: reference-to-video (character + audio lip sync)
    ├── stock_video: text-to-video (cinematic B-roll)
    └── slides: text-to-video (atmospheric/abstract)
    ↓
[4] Remotion composition (NEW)
    ├── <OffthreadVideo> loads Seedance .mp4 as background
    ├── Overlay elements rendered per keyframes[]
    ├── Each element type is a React component
    └── Outputs final composite .mp4
    ↓
[5] Audio overlay (TTS narration replaces/mixes Seedance audio)
    ↓
[6] Stitch all panels → final.mp4
```

## Keyframe Schema

Added to each panel in `storyboard.json`:

```json
{
  "panel_number": 14,
  "screen_type": "slides",
  "voiceover_script": "Here's the one number worth remembering...",
  "visual_direction": [...],
  "keyframes": [
    {
      "t": 1.0,
      "dur": 5.0,
      "type": "stat",
      "text": "1.7x",
      "style": { "color": "#1E64C8" }
    },
    {
      "t": 3.5,
      "dur": 6.0,
      "type": "badge",
      "text": "With sponsor",
      "position": "right_upper",
      "style": { "bg": "#1E64C8", "color": "#FFFFFF" }
    },
    {
      "t": 4.0,
      "dur": 6.0,
      "type": "badge",
      "text": "Without",
      "position": "right_lower",
      "style": { "bg": "#E5E5E5", "color": "#666666" }
    },
    {
      "t": 11.0,
      "type": "transition",
      "effect": "scroll_up"
    },
    {
      "t": 12.0,
      "dur": 10.0,
      "type": "badge",
      "text": "Tech",
      "position": "row_1of4",
      "style": { "bg": "#3C82DC" }
    }
  ]
}
```

### Keyframe fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `t` | float | yes | Start time in seconds |
| `dur` | float | no | Duration visible (seconds). Omit = visible until end. |
| `type` | string | yes | Element type: `stat`, `badge`, `quote`, `label`, `divider`, `transition` |
| `text` | string | type-dependent | Display text |
| `position` | string | no | Placement hint. Values: `center`, `top_center`, `bottom_center`, `left`, `right`, `right_upper`, `right_lower`, `row_Nof M` |
| `style` | object | no | Override colors, font size, etc. |
| `accent_word` | string | no | For `quote` type — word to highlight in accent color |
| `effect` | string | no | For `transition` type — `scroll_up`, `fade`, `wipe` |

## Element Types — Remotion Components

### `<Stat>`
Large centered number/stat. Big bold typography, optional accent color.
Used for: "1.7x", "~38%", "29%"

### `<Badge>`
Floating rounded-rectangle label. Semi-transparent background, medium text.
Used for: "With sponsor", "I'm not a coder", "Tech", "Finance"
Positioned via `position` field. Supports row layout for multiple badges.

### `<Quote>`
Large serif typography, centered. One word optionally highlighted in accent color.
Used for: Key phrase callouts from voiceover.
References the YouTube quote-highlighter style (warm bg, bold serif, accent word).

### `<Label>`
Small text pinned to a position. No background. Used for annotations.

### `<Divider>`
Section card: icon + "Part N" label + title. Full-screen, centered layout.
Used for: Section transitions between major topics.

### `<Transition>`
Scroll-up, fade, or wipe effect applied to all currently visible elements.
Clears the screen for the next set of elements.

## Animation

All elements use the existing `interpolate()` pattern from the codebase:
- Fade-in over `FADE_FRAMES = 15` (0.6s at 25fps)
- Fade-out over same duration when `t + dur` is reached
- Badges: slight slide-in from edge (8px travel)
- Stats: scale from 0.9 → 1.0 during fade-in
- Transitions: 0.5s scroll/fade applied to all visible elements

No `spring()` — keep it consistent with existing components.

## Remotion Composition

New composition: `KeyframeOverlay`

```tsx
// Root.tsx — add to existing compositions
<Composition
  id="KeyframeOverlay"
  component={KeyframeOverlay}
  width={1920}
  height={1080}
  fps={25}
  calculateMetadata={({ props }) => ({
    durationInFrames: Math.ceil(props.durationSeconds * 25),
  })}
  defaultProps={{
    seedanceVideoPath: "",
    durationSeconds: 10,
    keyframes: [],
  }}
/>
```

```tsx
// KeyframeOverlay.tsx
const KeyframeOverlay: React.FC<Props> = ({ seedanceVideoPath, keyframes, durationSeconds }) => {
  const frame = useCurrentFrame();
  const fps = useVideoConfig().fps;
  const t = frame / fps;

  return (
    <AbsoluteFill>
      {/* Layer 1: Seedance base video */}
      <OffthreadVideo src={staticFile(seedanceVideoPath)} />

      {/* Layer 2: Keyframe elements */}
      {keyframes.map((kf, i) => (
        <KeyframeElement key={i} kf={kf} currentTime={t} />
      ))}
    </AbsoluteFill>
  );
};
```

`KeyframeElement` dispatches to the correct component based on `kf.type` and calculates opacity from `kf.t`, `kf.dur`, and current time.

## LLM Auto-Generation

A new function `generate_keyframes(panel)` calls the LLM with:

**Input:** `voiceover_script`, `visual_direction`, `duration_seconds`, `screen_type`

**System prompt:** Instructs the LLM to:
- Identify key phrases, stats, and concepts worth calling out visually
- Calculate approximate timestamps from word position (word_index / total_words * duration)
- Choose appropriate element types based on content (stats → `stat`, key phrases → `quote` or `badge`)
- Follow the 2-second rule: first element appears within 2s, no gap > 2s between elements
- Output valid keyframes[] array

**Output:** JSON array of keyframes, written to `storyboard.json` for user review.

The LLM does NOT control Seedance prompts — it only generates the overlay keyframes. Seedance prompts remain separate (cinematic B-roll, abstract texture, etc.).

## Rendering Pipeline Integration

### Python orchestrator (`generate.py`)

```python
def render_panel(panel, audio_path, output_path):
    # Step 1: Seedance base video (existing)
    seedance_path = generate_seedance_base(panel)

    # Step 2: Stage seedance video to backend/.../remotion/public/
    staged_video = stage_file(seedance_path, REMOTION_PUBLIC)

    # Step 3: Remotion render with keyframes
    props = {
        "seedanceVideoPath": staged_video,
        "durationSeconds": panel.duration_seconds,
        "keyframes": panel.keyframes,
    }
    remotion_render("KeyframeOverlay", props, output_path)

    # Step 4: Audio overlay
    overlay_audio(output_path, audio_path, final_path)
```

### Remotion render call

Reuses existing pattern from `slides.py`:
```bash
npx remotion render src/index.ts KeyframeOverlay \
  --props='{"seedanceVideoPath":"panel_14_base.mp4","keyframes":[...],"durationSeconds":25.2}' \
  --output=panel_14.mp4
```

## File Changes

| File | Change |
|------|--------|
| `storyboard.json` | Add `keyframes[]` to each panel (auto-generated + hand-edited) |
| `hackathon-april-12/generate.py` | Update `render_*` functions to call Remotion instead of Pillow |
| `hackathon-april-12/keyframe_generator.py` | NEW — LLM auto-generation of keyframes |
| `backend/app/services/video/remotion/src/Root.tsx` | Add `KeyframeOverlay` composition |
| `backend/app/services/video/remotion/src/components/KeyframeOverlay.tsx` | NEW — main composition with OffthreadVideo + overlay dispatch |
| `backend/app/services/video/remotion/src/components/overlays/Stat.tsx` | NEW |
| `backend/app/services/video/remotion/src/components/overlays/Badge.tsx` | NEW |
| `backend/app/services/video/remotion/src/components/overlays/Quote.tsx` | NEW |
| `backend/app/services/video/remotion/src/components/overlays/Label.tsx` | NEW |
| `backend/app/services/video/remotion/src/components/overlays/Divider.tsx` | NEW |
| `backend/app/services/video/remotion/src/components/overlays/Transition.tsx` | NEW |
| `backend/app/services/video/remotion/package.json` | Add `@remotion/media-utils` if not present (for OffthreadVideo) |

## Scope Boundaries

**In scope:**
- Keyframe schema and auto-generation
- 6 overlay element types
- Remotion KeyframeOverlay composition
- Integration with existing Seedance + TTS pipeline

**Out of scope:**
- Visual design iteration (colors, fonts, exact styling) — iterate after the system works
- Remotion Studio preview setup — nice-to-have, not blocking
- Parallel Seedance API calls — optimization for later

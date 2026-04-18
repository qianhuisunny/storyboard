# Visual Placeholder Generator — ionrouter Flux Schnell

On-demand AI image generation per storyboard screen, replacing static placeholder PNGs with concept art thumbnails.

## Context

Each storyboard screen has `visual_direction` (text descriptions) and `on_screen_visual` (static PNG mapped by screen_type). Currently 7 pre-built PNGs — no AI generation. This feature adds per-screen image generation using ionrouter's Flux Schnell API (~$0.005/image, ~3s).

## Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| When to generate | On-demand per screen (user clicks) | Keeps pipeline fast, saves API calls |
| Image style | LLM-decided per screen_type | screen_type carries style intent (stock_footage → photorealistic, whiteboard → sketch) |
| Persistence | Save to project, survives refresh | More complete demo |
| Architecture | Backend-only (Approach A) | API key stays server-side, single endpoint, fits existing patterns |

## Architecture

```
User clicks "Generate Visual" on PanelCard
  → Frontend POST /api/project/{id}/screen/{index}/generate-visual
    → Backend builds prompt from visual_direction + screen_type style suffix
      → POST https://api.ionrouter.io/v1/images/generations (flux-schnell)
      → Receives base64 PNG
      → Saves to frontend/public/generated/{project_id}/screen_{index}.png
      → Updates screen.on_screen_visual = /generated/{project_id}/screen_{index}.png
    ← Returns { on_screen_visual: "/generated/..." }
  → Frontend updates screen state + triggers auto-save
```

## Backend

### New file: `backend/app/services/image_generator.py`

Thin service calling ionrouter Flux Schnell:
- Input: `visual_direction: list[str]`, `screen_type: str`
- Builds prompt: joins visual_direction items, appends style suffix from screen_type
- Calls ionrouter API with `model: "flux-schnell"`, `width: 1024`, `height: 576` (16:9)
- Returns base64-decoded PNG bytes

### Style mapping (screen_type → prompt suffix)

| screen_type | suffix |
|---|---|
| stock_footage, real_world | "photorealistic photography style" |
| whiteboard_animation, whiteboard | "hand-drawn whiteboard sketch, black and white line art" |
| slides | "clean professional slide design, flat illustration style" |
| screen_recording, code_editor | "screenshot of software interface, UI mockup style" |
| talking_head, talking_head_* | "person presenting to camera, professional studio setting" |

### New endpoint in `main.py`

```
POST /api/project/{project_id}/screen/{screen_index}/generate-visual
```

1. Read project storyboard data from DB
2. Extract screen at `screen_index`
3. Call `ImageGenerator.generate(screen.visual_direction, screen.screen_type)`
4. Save PNG to `frontend/public/generated/{project_id}/screen_{index}.png`
5. Update screen's `on_screen_visual` in DB
6. Return `{ "on_screen_visual": "/generated/..." }`

### Env var

`IONROUTER_API_KEY` in `backend/.env`

### ionrouter API shape

```python
response = requests.post(
    "https://api.ionrouter.io/v1/images/generations",
    headers={"Authorization": f"Bearer {api_key}"},
    json={
        "model": "flux-schnell",
        "prompt": f"{joined_visual_direction}. {style_suffix}",
        "width": 1024,
        "height": 576,
    },
)
b64_data = response.json()["data"][0]["b64_json"]
```

## Frontend — PanelCard Redesign

### Layout change (expanded card)

**Before:** Single column, stacked sections (Visual Direction → On-Screen Visual thumbnail → Voiceover → Action Notes)

**After:** Two-column grid (300px | 1fr):
- **Left column:** Visual preview fills full height. `position: absolute; inset: 0` stretches to match right column. Generate button overlaid at bottom center (frosted glass style).
- **Right column:** Voiceover Script on top, Visual Direction bullets below, footer (move/edit/delete) at bottom.

Only two content sections retained: Voiceover Script and Visual Direction. Text Overlay, Action Notes removed from expanded view.

### Generate button states

| State | Visual area | Button |
|-------|------------|--------|
| Default | Gray placeholder + image icon | "Generate Visual" with sparkle icon, frosted glass overlay |
| Generating | Shimmer animation on placeholder | "Generating..." with spinning sparkle, disabled |
| Generated | Full image, hover shows dark overlay | "Regenerate" button appears on hover overlay |
| Error | Reverts to previous state | Brief inline error message |

### API call flow

1. User clicks "Generate Visual"
2. Set generating state (shimmer + disable button)
3. `POST /api/project/{id}/screen/{index}/generate-visual`
4. On success: update `screen.on_screen_visual` in local state, trigger auto-save via existing `/api/project/{id}/stages`
5. On error: revert to previous state, show brief error

### No new dependencies

Uses existing lucide-react icons (Sparkles), Tailwind for shimmer animation (`@keyframes`).

## Preview

Approved design: `frontend/preview-panel-card.html` (serve via `python3 -m http.server 8765` from `frontend/`)

## Scope boundaries

- No batch generation (single screen on-demand only)
- No style selector UI (screen_type determines style automatically)
- No image editing/cropping
- Generated images stored as files in `frontend/public/generated/`, not in DB blob

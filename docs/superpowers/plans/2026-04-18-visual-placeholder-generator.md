# Visual Placeholder Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add on-demand AI image generation per storyboard screen using ionrouter Flux Schnell, with a redesigned PanelCard two-column layout.

**Architecture:** New backend service (`image_generator.py`) calls ionrouter API, new endpoint saves PNG to `frontend/public/generated/`. Frontend PanelCard gets two-column layout with generate button. `projectId` threaded from StageLayout → DraftBuilder → UserView → PanelCard.

**Tech Stack:** Python/FastAPI (backend), ionrouter Flux Schnell API, React/TypeScript/Tailwind (frontend)

---

### Task 1: Backend — ImageGenerator service

**Files:**
- Create: `backend/app/services/image_generator.py`

- [ ] **Step 1: Create the image generator service**

```python
# backend/app/services/image_generator.py
import base64
import os
import httpx

STYLE_SUFFIXES = {
    "stock_footage": "photorealistic photography style",
    "real_world": "photorealistic photography style",
    "whiteboard_animation": "hand-drawn whiteboard sketch, black and white line art",
    "whiteboard": "hand-drawn whiteboard sketch, black and white line art",
    "slides": "clean professional slide design, flat illustration style",
    "screen_recording": "screenshot of software interface, UI mockup style",
    "code_editor": "screenshot of software interface, UI mockup style",
    "talking_head": "person presenting to camera, professional studio setting",
    "talking_head_with_split_screens": "person presenting to camera, professional studio setting",
    "talking_head_left_with_notes": "person presenting to camera, professional studio setting",
}


class ImageGenerator:
    def __init__(self):
        self.api_key = os.getenv("IONROUTER_API_KEY")
        self.api_url = "https://api.ionrouter.io/v1/images/generations"

    async def generate(self, visual_direction: list[str], screen_type: str) -> bytes:
        prompt_parts = ". ".join(visual_direction)
        style = STYLE_SUFFIXES.get(screen_type, "digital illustration style")
        full_prompt = f"{prompt_parts}. {style}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.api_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": "flux-schnell",
                    "prompt": full_prompt,
                    "width": 1024,
                    "height": 576,
                },
            )
            response.raise_for_status()
            b64_data = response.json()["data"][0]["b64_json"]
            return base64.b64decode(b64_data)
```

- [ ] **Step 2: Verify httpx is in requirements**

Run: `grep httpx backend/requirements.txt`

If missing, add it:
```bash
cd backend && source venv/bin/activate && pip install httpx && pip freeze | grep httpx >> requirements.txt
```

- [ ] **Step 3: Verify IONROUTER_API_KEY is in .env**

Run: `grep IONROUTER_API_KEY backend/.env`

Expected: Key already exists (confirmed during exploration).

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/image_generator.py
git commit -m "feat: add ImageGenerator service for ionrouter Flux Schnell"
```

---

### Task 2: Backend — Generate visual endpoint

**Files:**
- Modify: `backend/app/main.py` (add endpoint near other project endpoints)

- [ ] **Step 1: Add the generate-visual endpoint to main.py**

Add this import near the top of `main.py` with the other service imports:

```python
from app.services.image_generator import ImageGenerator
```

Add this endpoint after the existing `/api/project/{project_id}/stages` endpoint:

```python
@app.post("/api/project/{project_id}/screen/{screen_index}/generate-visual")
async def generate_visual(project_id: str, screen_index: int, db: AsyncSession = Depends(get_db)):
    """Generate an AI visual for a specific storyboard screen."""
    repo = ProjectRepository(db)
    project = await repo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Read current storyboard from stage snapshots
    snapshot = await repo.get_stage_snapshot(project_id, "draft")
    if not snapshot or not snapshot.human_version:
        raise HTTPException(status_code=404, detail="No storyboard draft found")

    screens = snapshot.human_version if isinstance(snapshot.human_version, list) else snapshot.human_version.get("screens", [])
    if screen_index < 0 or screen_index >= len(screens):
        raise HTTPException(status_code=400, detail=f"Screen index {screen_index} out of range (0-{len(screens)-1})")

    screen = screens[screen_index]
    visual_direction = screen.get("visual_direction", [])
    if isinstance(visual_direction, str):
        visual_direction = [d.strip() for d in visual_direction.split(",") if d.strip()]
    screen_type = screen.get("screen_type", "slides")

    # Generate image
    generator = ImageGenerator()
    try:
        image_bytes = await generator.generate(visual_direction, screen_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image generation failed: {str(e)}")

    # Save to frontend/public/generated/
    import os
    from pathlib import Path
    output_dir = Path(__file__).parent.parent.parent / "frontend" / "public" / "generated" / project_id
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"screen_{screen_index}.png"
    output_path.write_bytes(image_bytes)

    # Update screen's on_screen_visual
    on_screen_visual = f"/generated/{project_id}/screen_{screen_index}.png"
    screens[screen_index]["on_screen_visual"] = on_screen_visual

    # Save updated storyboard back to stage snapshot
    updated_data = screens if isinstance(snapshot.human_version, list) else {**snapshot.human_version, "screens": screens}
    await repo.save_stage_snapshot(project_id, "draft", snapshot.ai_version, updated_data)

    return {"success": True, "on_screen_visual": on_screen_visual}
```

- [ ] **Step 2: Test the endpoint manually**

Start backend:
```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8001
```

Verify it loads without import errors:
```bash
curl localhost:8001/health
```

Expected: `{"status": "healthy", ...}`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: add POST /api/project/{id}/screen/{idx}/generate-visual endpoint"
```

---

### Task 3: Frontend — Thread projectId to PanelCard

**Files:**
- Modify: `frontend/src/components/DraftBuilder/types.ts` (add projectId to props)
- Modify: `frontend/src/components/DraftBuilder/DraftBuilder.tsx` or parent that passes props
- Modify: `frontend/src/components/DraftBuilder/UserView/UserView.tsx` (pass projectId through)

- [ ] **Step 1: Add projectId and onGenerateVisual to PanelCardProps**

In `frontend/src/components/DraftBuilder/types.ts`, update `PanelCardProps`:

```typescript
export interface PanelCardProps {
  screen: ProductionScreen;
  screenIndex: number;
  projectId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChange: (screen: ProductionScreen) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}
```

- [ ] **Step 2: Add projectId to UserViewProps**

In the same file, find `UserViewProps` and add `projectId: string`:

```typescript
export interface UserViewProps {
  screens: ProductionScreen[];
  projectId: string;
  // ... rest of existing props
}
```

- [ ] **Step 3: Pass projectId through the component chain**

Find where `UserView` is rendered (likely in `DraftBuilder.tsx` or `StageContent.tsx`) and pass `projectId` from the parent. The `StageLayout.tsx` already has `projectId` from `useParams`. Trace the chain:

`StageLayout` → `StageContent` → `DraftBuilder` → `UserView` → `PanelCard`

At each level, add `projectId` to the props being passed down.

- [ ] **Step 4: Pass screenIndex and projectId in UserView's PanelCard render**

In `frontend/src/components/DraftBuilder/UserView/UserView.tsx`, update both `PanelCard` render sites (grouped and ungrouped):

For the grouped render (line ~207):
```tsx
<PanelCard
  key={`${screen.screen_number}-${globalIndex}`}
  screen={screen}
  screenIndex={globalIndex}
  projectId={projectId}
  isExpanded={expandedIndex === globalIndex}
  // ... rest unchanged
/>
```

For the ungrouped render (line ~230):
```tsx
<PanelCard
  key={`${screen.screen_number}-${index}`}
  screen={screen}
  screenIndex={index}
  projectId={projectId}
  isExpanded={expandedIndex === index}
  // ... rest unchanged
/>
```

- [ ] **Step 5: Run build to check types**

```bash
cd frontend && npm run build
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DraftBuilder/types.ts frontend/src/components/DraftBuilder/UserView/UserView.tsx
git add -u  # any other files modified in the prop chain
git commit -m "feat: thread projectId and screenIndex to PanelCard"
```

---

### Task 4: Frontend — Redesign PanelCard with two-column layout and generate button

**Files:**
- Modify: `frontend/src/components/DraftBuilder/UserView/PanelCard.tsx` (full rewrite of expanded content)

**Reference:** `frontend/preview-panel-card.html` — approved HTML/CSS design

- [ ] **Step 1: Add generating state and generate handler**

At the top of the `PanelCard` component, add state and the API call handler:

```tsx
const [isGenerating, setIsGenerating] = useState(false);
const [generateError, setGenerateError] = useState<string | null>(null);

const handleGenerateVisual = async () => {
  setIsGenerating(true);
  setGenerateError(null);
  try {
    const response = await fetch(
      `/api/project/${projectId}/screen/${screenIndex}/generate-visual`,
      { method: "POST" }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "Generation failed" }));
      throw new Error(err.detail || "Generation failed");
    }
    const data = await response.json();
    onChange({ ...screen, on_screen_visual: data.on_screen_visual });
  } catch (err) {
    setGenerateError(err instanceof Error ? err.message : "Generation failed");
    setTimeout(() => setGenerateError(null), 3000);
  } finally {
    setIsGenerating(false);
  }
};
```

- [ ] **Step 2: Add shimmer animation CSS**

Create `frontend/src/components/DraftBuilder/UserView/panel-card.css`:

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.visual-shimmer {
  background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted)/0.5) 50%, hsl(var(--muted)) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

Import it at the top of PanelCard.tsx:
```tsx
import "./panel-card.css";
```

- [ ] **Step 3: Rewrite the expanded content section**

Replace the entire `{isExpanded && (...)}` block (lines 148-388) with the two-column layout. The collapsed header stays unchanged.

```tsx
{isExpanded && (
  <div className="border-t border-border">
    <div className="grid grid-cols-[300px_1fr]">
      {/* Left: Visual Preview */}
      <div className="relative bg-muted/30 border-r border-border overflow-hidden rounded-bl-lg">
        <div className={cn(
          "absolute inset-0 flex items-center justify-center",
          isGenerating && "visual-shimmer"
        )}>
          {screen.on_screen_visual && (screen.on_screen_visual.startsWith("/generated/") || screen.on_screen_visual.startsWith("http")) ? (
            <>
              <img
                src={screen.on_screen_visual}
                alt="Screen visual"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {!isGenerating && (
                <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleGenerateVisual(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 rounded-md text-xs font-semibold text-foreground"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                </div>
              )}
            </>
          ) : (
            <Image className="w-12 h-12 text-muted-foreground/30" />
          )}
        </div>
        {/* Generate button — overlaid at bottom */}
        {!screen.on_screen_visual?.startsWith("/generated/") && !screen.on_screen_visual?.startsWith("http") && (
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerateVisual(); }}
            disabled={isGenerating}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border border-white/70 bg-white/85 backdrop-blur-sm text-foreground hover:bg-white/95 hover:border-primary hover:text-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isGenerating ? "Generating..." : "Generate Visual"}
          </button>
        )}
        {generateError && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-destructive/90 text-destructive-foreground text-xs rounded">
            {generateError}
          </div>
        )}
      </div>

      {/* Right: Content + Footer */}
      <div className="flex flex-col">
        <div className="p-5 space-y-4 flex-1">
          {/* Voiceover Script */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase text-muted-foreground mb-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/50" />
              Voiceover Script
            </div>
            {isEditing ? (
              <textarea
                value={screen.voiceover_text}
                onChange={(e) => handleFieldChange("voiceover_text", e.target.value)}
                className="w-full p-3 text-sm border border-border rounded-md bg-background resize-none"
                rows={4}
              />
            ) : (
              <p className="text-sm text-foreground bg-muted/20 p-3 rounded-md border border-border/50 italic leading-relaxed">
                "{screen.voiceover_text || "..."}"
              </p>
            )}
          </div>

          {/* Visual Direction */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase text-muted-foreground mb-1.5">
              <Eye className="w-3.5 h-3.5 text-muted-foreground/50" />
              Visual Direction
            </div>
            {isEditing ? (
              <textarea
                value={typeof screen.visual_direction === "string"
                  ? screen.visual_direction
                  : screen.visual_direction.join(", ")}
                onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                className="w-full p-3 text-sm border border-border rounded-md bg-background resize-none"
                rows={3}
              />
            ) : (
              <div className="space-y-1">
                {visualDirections.map((dir, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-muted-foreground/50">•</span>
                    <span>{dir}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <button onClick={onMoveUp} disabled={isFirst} className={cn("p-1.5 rounded hover:bg-muted", isFirst && "opacity-30 cursor-not-allowed")}>
              <ArrowUp className="w-4 h-4" />
            </button>
            <button onClick={onMoveDown} disabled={isLast} className={cn("p-1.5 rounded hover:bg-muted", isLast && "opacity-30 cursor-not-allowed")}>
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsEditing(!isEditing)} className={cn("px-3 py-1 text-xs font-medium rounded", isEditing ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")}>
              {isEditing ? "Done" : "Edit"}
            </button>
            <button onClick={onDelete} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Update imports**

Add `RefreshCw` to the lucide-react imports at the top. Remove unused imports (`Clock`, `Type`, `FileText`, `Video`, `Monitor`, `User`, `Presentation`, `PlayCircle`, `Flag`, `AlertCircle`, `CheckCircle`, `Star`, `Users`, `ArrowRight`, `ListOrdered`, `Lightbulb`, `AlertTriangle`, `Repeat`). Also remove the `SCREEN_ICONS` mapping since it's only used in the collapsed header badge which uses `SCREEN_TYPE_CONFIG`.

Updated imports:
```tsx
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
  MessageSquare,
  Eye,
  Image,
  Sparkles,
  RefreshCw,
} from "lucide-react";
```

Keep the icon mapping only for the header badge — check if it's actually used in the header. Looking at the header code (lines 108-117), it uses `IconComponent` from `SCREEN_ICONS`. Keep the icons needed for the badge but remove the rest. Actually, simplify: keep `SCREEN_ICONS` as-is for backward compatibility; just add `RefreshCw` to imports.

- [ ] **Step 5: Destructure new props**

Update the component signature:
```tsx
export default function PanelCard({
  screen,
  screenIndex,
  projectId,
  isExpanded,
  onToggleExpand,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: PanelCardProps) {
```

- [ ] **Step 6: Run build**

```bash
cd frontend && npm run build
```

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/DraftBuilder/UserView/PanelCard.tsx frontend/src/components/DraftBuilder/UserView/panel-card.css
git commit -m "feat: redesign PanelCard with two-column layout and generate visual button"
```

---

### Task 5: End-to-end smoke test

- [ ] **Step 1: Start both servers**

Terminal 1:
```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8001
```

Terminal 2:
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Open a project with a storyboard draft**

Navigate to an existing project that has reached the Storyboard Draft stage. Verify:
- Panel cards render with new two-column layout
- Collapsed cards show: number, badge, voiceover preview, duration, chevron
- Expanded card shows: visual placeholder left, voiceover + visual direction right

- [ ] **Step 3: Test generate visual**

Click "Generate Visual" on an expanded panel. Verify:
- Button shows "Generating..." with disabled state
- Placeholder area shows shimmer animation
- After ~3 seconds, generated image appears
- Image persists after page refresh

- [ ] **Step 4: Test regenerate**

Hover over the generated image. Verify:
- Dark overlay appears with "Regenerate" button
- Clicking regenerates a new image

- [ ] **Step 5: Verify file saved**

```bash
ls frontend/public/generated/
```

Expected: Directory with `{project_id}/screen_{index}.png` file(s).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: visual placeholder generator — end-to-end working"
```

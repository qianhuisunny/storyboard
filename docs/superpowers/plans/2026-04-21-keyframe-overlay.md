# Keyframe Overlay System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a keyframe overlay system that composites timed text/badge/stat elements onto Seedance-generated base videos using Remotion.

**Architecture:** LLM auto-generates keyframes from voiceover scripts. Keyframes are stored in `storyboard.json` for hand-editing. Seedance generates base video (visual layer). Remotion renders the overlay elements (information layer) on top of the base video via `<OffthreadVideo>`. Final audio overlay via ffmpeg.

**Tech Stack:** Remotion 4.x (React + TypeScript), Python 3.10, OpenAI GPT-4o (keyframe generation), ffmpeg (audio overlay), BytePlus ARK SDK (Seedance).

---

## File Map

| File | Responsibility |
|------|---------------|
| `backend/app/services/video/models.py` | Add `keyframes` field to `Panel` dataclass |
| `backend/app/services/video/parser.py` | Parse `keyframes` from storyboard JSON |
| `hackathon-april-12/keyframe_generator.py` | NEW — LLM auto-generates keyframes per panel |
| `backend/app/services/video/remotion/src/types.ts` | NEW — TypeScript types for keyframe schema |
| `backend/app/services/video/remotion/src/components/KeyframeOverlay.tsx` | NEW — main composition: OffthreadVideo bg + element dispatch |
| `backend/app/services/video/remotion/src/components/overlays/Stat.tsx` | NEW — large centered stat element |
| `backend/app/services/video/remotion/src/components/overlays/Badge.tsx` | NEW — floating rounded-rect label |
| `backend/app/services/video/remotion/src/components/overlays/Quote.tsx` | NEW — large serif quote with accent word |
| `backend/app/services/video/remotion/src/components/overlays/Label.tsx` | NEW — small pinned text |
| `backend/app/services/video/remotion/src/components/overlays/Divider.tsx` | NEW — section divider card |
| `backend/app/services/video/remotion/src/components/overlays/KeyframeElement.tsx` | NEW — dispatcher: keyframe → correct component |
| `backend/app/services/video/remotion/src/Root.tsx` | Register `KeyframeOverlay` composition |
| `backend/app/services/video/remotion/package.json` | Add `@remotion/media-utils` dependency |
| `hackathon-april-12/generate.py` | Update render functions to use Remotion overlay |

---

### Task 1: Add `@remotion/media-utils` dependency

**Files:**
- Modify: `backend/app/services/video/remotion/package.json`

- [ ] **Step 1: Add the dependency**

```bash
cd backend/app/services/video/remotion && npm install @remotion/media-utils@^4.0.0
```

- [ ] **Step 2: Verify installation**

Run: `cd backend/app/services/video/remotion && node -e "require('@remotion/media-utils')"`
Expected: No error

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/video/remotion/package.json backend/app/services/video/remotion/package-lock.json
git commit -m "chore: add @remotion/media-utils for OffthreadVideo support"
```

---

### Task 2: TypeScript types for keyframe schema

**Files:**
- Create: `backend/app/services/video/remotion/src/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// backend/app/services/video/remotion/src/types.ts

export interface KeyframeStyle {
  color?: string;
  bg?: string;
  fontSize?: number;
}

export interface Keyframe {
  t: number;
  dur?: number;
  type: "stat" | "badge" | "quote" | "label" | "divider" | "transition";
  text?: string;
  position?: string;
  style?: KeyframeStyle;
  accent_word?: string;
  effect?: "scroll_up" | "fade" | "wipe";
}

export interface KeyframeOverlayProps {
  seedanceVideoPath: string;
  durationSeconds: number;
  keyframes: Keyframe[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend/app/services/video/remotion && npx tsc --noEmit src/types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/video/remotion/src/types.ts
git commit -m "feat: add TypeScript types for keyframe overlay schema"
```

---

### Task 3: Overlay element components — Stat, Badge, Label

**Files:**
- Create: `backend/app/services/video/remotion/src/components/overlays/Stat.tsx`
- Create: `backend/app/services/video/remotion/src/components/overlays/Badge.tsx`
- Create: `backend/app/services/video/remotion/src/components/overlays/Label.tsx`

- [ ] **Step 1: Create the overlays directory**

```bash
mkdir -p backend/app/services/video/remotion/src/components/overlays
```

- [ ] **Step 2: Create Stat component**

```tsx
// backend/app/services/video/remotion/src/components/overlays/Stat.tsx
import React from "react";
import { FONT_FAMILY } from "../../theme";
import type { Keyframe } from "../../types";

interface StatProps {
  kf: Keyframe;
  opacity: number;
}

export const Stat: React.FC<StatProps> = ({ kf, opacity }) => {
  const color = kf.style?.color ?? "#1a1a1a";
  const fontSize = kf.style?.fontSize ?? 96;
  const scale = 0.9 + 0.1 * opacity;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 800,
          color,
          letterSpacing: "-0.02em",
        }}
      >
        {kf.text}
      </span>
    </div>
  );
};
```

- [ ] **Step 3: Create Badge component**

```tsx
// backend/app/services/video/remotion/src/components/overlays/Badge.tsx
import React from "react";
import { FONT_FAMILY, HEADING_SIZE } from "../../theme";
import type { Keyframe } from "../../types";

interface BadgeProps {
  kf: Keyframe;
  opacity: number;
}

const POSITION_MAP: Record<string, React.CSSProperties> = {
  center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
  top_center: { top: "12%", left: "50%", transform: "translateX(-50%)" },
  bottom_center: { bottom: "12%", left: "50%", transform: "translateX(-50%)" },
  left: { top: "50%", left: "8%", transform: "translateY(-50%)" },
  right: { top: "50%", right: "8%", transform: "translateY(-50%)" },
  right_upper: { top: "25%", right: "8%" },
  right_lower: { top: "60%", right: "8%" },
};

function rowPosition(pos: string): React.CSSProperties | null {
  const match = pos.match(/^row_(\d+)of(\d+)$/);
  if (!match) return null;
  const idx = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  const spacing = 100 / (total + 1);
  return {
    top: "50%",
    left: `${spacing * idx}%`,
    transform: "translate(-50%, -50%)",
  };
}

export const Badge: React.FC<BadgeProps> = ({ kf, opacity }) => {
  const bg = kf.style?.bg ?? "rgba(0,0,0,0.7)";
  const color = kf.style?.color ?? "#FFFFFF";
  const fontSize = kf.style?.fontSize ?? HEADING_SIZE;
  const pos = kf.position ?? "center";
  const posStyle = rowPosition(pos) ?? POSITION_MAP[pos] ?? POSITION_MAP.center;

  const slideOffset = 8 * (1 - opacity);

  return (
    <div
      style={{
        position: "absolute",
        ...posStyle,
        opacity,
        transform: `${posStyle.transform ?? ""} translateY(${slideOffset}px)`.trim(),
        padding: "16px 32px",
        borderRadius: 12,
        backgroundColor: bg,
      }}
    >
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 600,
          color,
          whiteSpace: "nowrap",
        }}
      >
        {kf.text}
      </span>
    </div>
  );
};
```

- [ ] **Step 4: Create Label component**

```tsx
// backend/app/services/video/remotion/src/components/overlays/Label.tsx
import React from "react";
import { FONT_FAMILY, BODY_SIZE } from "../../theme";
import type { Keyframe } from "../../types";

interface LabelProps {
  kf: Keyframe;
  opacity: number;
}

export const Label: React.FC<LabelProps> = ({ kf, opacity }) => {
  const color = kf.style?.color ?? "#333333";
  const fontSize = kf.style?.fontSize ?? BODY_SIZE;
  const pos = kf.position ?? "top_center";

  const posMap: Record<string, React.CSSProperties> = {
    top_center: { top: "8%", left: "50%", transform: "translateX(-50%)" },
    bottom_center: { bottom: "8%", left: "50%", transform: "translateX(-50%)" },
    left: { top: "50%", left: "6%", transform: "translateY(-50%)" },
    right: { top: "50%", right: "6%", transform: "translateY(-50%)" },
    center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
  };
  const posStyle = posMap[pos] ?? posMap.top_center;

  return (
    <div style={{ position: "absolute", ...posStyle, opacity }}>
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 400,
          color,
        }}
      >
        {kf.text}
      </span>
    </div>
  );
};
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/video/remotion/src/components/overlays/
git commit -m "feat: add Stat, Badge, Label overlay components"
```

---

### Task 4: Overlay element components — Quote, Divider

**Files:**
- Create: `backend/app/services/video/remotion/src/components/overlays/Quote.tsx`
- Create: `backend/app/services/video/remotion/src/components/overlays/Divider.tsx`

- [ ] **Step 1: Create Quote component**

```tsx
// backend/app/services/video/remotion/src/components/overlays/Quote.tsx
import React from "react";
import type { Keyframe } from "../../types";

interface QuoteProps {
  kf: Keyframe;
  opacity: number;
}

export const Quote: React.FC<QuoteProps> = ({ kf, opacity }) => {
  const text = kf.text ?? "";
  const accentWord = kf.accent_word;
  const accentColor = kf.style?.color ?? "#C87941";
  const fontSize = kf.style?.fontSize ?? 64;

  const words = text.split(" ");

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 120px",
        opacity,
      }}
    >
      <p
        style={{
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize,
          fontWeight: 800,
          color: "#1a1a1a",
          lineHeight: 1.2,
          textAlign: "center",
          margin: 0,
        }}
      >
        {words.map((word, i) => {
          const isAccent =
            accentWord && word.toLowerCase().includes(accentWord.toLowerCase());
          return (
            <React.Fragment key={i}>
              {i > 0 && " "}
              <span style={isAccent ? { color: accentColor } : undefined}>
                {word}
              </span>
            </React.Fragment>
          );
        })}
      </p>
    </div>
  );
};
```

- [ ] **Step 2: Create Divider component**

```tsx
// backend/app/services/video/remotion/src/components/overlays/Divider.tsx
import React from "react";
import { FONT_FAMILY } from "../../theme";
import type { Keyframe } from "../../types";

interface DividerProps {
  kf: Keyframe;
  opacity: number;
}

export const Divider: React.FC<DividerProps> = ({ kf, opacity }) => {
  const text = kf.text ?? "";
  const parts = text.split("|").map((s) => s.trim());
  const partLabel = parts[0] ?? "";
  const title = parts[1] ?? parts[0] ?? "";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        opacity,
      }}
    >
      {partLabel !== title && (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 24,
            fontWeight: 500,
            color: "#666",
            padding: "8px 20px",
            borderRadius: 8,
            backgroundColor: "#F5F5F5",
          }}
        >
          {partLabel}
        </div>
      )}
      <h1
        style={{
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize: 56,
          fontWeight: 800,
          color: "#1a1a1a",
          textAlign: "center",
          margin: 0,
          maxWidth: "80%",
          lineHeight: 1.15,
        }}
      >
        {title}
      </h1>
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/video/remotion/src/components/overlays/
git commit -m "feat: add Quote and Divider overlay components"
```

---

### Task 5: KeyframeElement dispatcher + KeyframeOverlay composition

**Files:**
- Create: `backend/app/services/video/remotion/src/components/overlays/KeyframeElement.tsx`
- Create: `backend/app/services/video/remotion/src/components/KeyframeOverlay.tsx`

- [ ] **Step 1: Create KeyframeElement dispatcher**

This component takes a keyframe and the current time, computes opacity (fade-in/fade-out), and renders the correct element type.

```tsx
// backend/app/services/video/remotion/src/components/overlays/KeyframeElement.tsx
import React from "react";
import { interpolate } from "remotion";
import { FADE_FRAMES, FPS } from "../../theme";
import type { Keyframe } from "../../types";
import { Stat } from "./Stat";
import { Badge } from "./Badge";
import { Quote } from "./Quote";
import { Label } from "./Label";
import { Divider } from "./Divider";

interface KeyframeElementProps {
  kf: Keyframe;
  currentFrame: number;
}

export const KeyframeElement: React.FC<KeyframeElementProps> = ({
  kf,
  currentFrame,
}) => {
  if (kf.type === "transition") return null;

  const startFrame = Math.round(kf.t * FPS);
  const fadeIn = interpolate(
    currentFrame,
    [startFrame, startFrame + FADE_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  let fadeOut = 1;
  if (kf.dur != null) {
    const endFrame = Math.round((kf.t + kf.dur) * FPS);
    fadeOut = interpolate(
      currentFrame,
      [endFrame - FADE_FRAMES, endFrame],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  const opacity = fadeIn * fadeOut;
  if (opacity <= 0) return null;

  switch (kf.type) {
    case "stat":
      return <Stat kf={kf} opacity={opacity} />;
    case "badge":
      return <Badge kf={kf} opacity={opacity} />;
    case "quote":
      return <Quote kf={kf} opacity={opacity} />;
    case "label":
      return <Label kf={kf} opacity={opacity} />;
    case "divider":
      return <Divider kf={kf} opacity={opacity} />;
    default:
      return null;
  }
};
```

- [ ] **Step 2: Create KeyframeOverlay composition**

```tsx
// backend/app/services/video/remotion/src/components/KeyframeOverlay.tsx
import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { KeyframeOverlayProps } from "../types";
import { KeyframeElement } from "./overlays/KeyframeElement";

export const KeyframeOverlay: React.FC<KeyframeOverlayProps> = ({
  seedanceVideoPath,
  keyframes,
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      {seedanceVideoPath && (
        <OffthreadVideo
          src={staticFile(seedanceVideoPath)}
          style={{ width: "100%", height: "100%" }}
        />
      )}
      {keyframes.map((kf, i) => (
        <KeyframeElement key={i} kf={kf} currentFrame={frame} />
      ))}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd backend/app/services/video/remotion && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/video/remotion/src/components/
git commit -m "feat: add KeyframeElement dispatcher and KeyframeOverlay composition"
```

---

### Task 6: Register KeyframeOverlay in Root.tsx

**Files:**
- Modify: `backend/app/services/video/remotion/src/Root.tsx:1-137`

- [ ] **Step 1: Add import and composition to Root.tsx**

Add the import at the top with the other imports:

```tsx
import { KeyframeOverlay } from "./components/KeyframeOverlay";
```

Add default props after `defaultDataCard`:

```tsx
const defaultKeyframeOverlay = {
  seedanceVideoPath: "",
  durationSeconds: 10,
  keyframes: [],
};
```

Add the composition inside the `<>` fragment, after the DataCard composition:

```tsx
      <Composition
        id="KeyframeOverlay"
        component={KeyframeOverlay as any}
        durationInFrames={durationFrames(defaultKeyframeOverlay.durationSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultKeyframeOverlay}
        calculateMetadata={({ props }: { props: typeof defaultKeyframeOverlay }) => ({
          durationInFrames: durationFrames(props.durationSeconds ?? 10),
        })}
      />
```

- [ ] **Step 2: Verify Remotion can load the composition**

Run: `cd backend/app/services/video/remotion && npx remotion compositions src/index.ts 2>&1 | grep KeyframeOverlay`
Expected: `KeyframeOverlay` appears in the output

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/video/remotion/src/Root.tsx
git commit -m "feat: register KeyframeOverlay composition in Root"
```

---

### Task 7: Smoke-test Remotion render with static white background

Before wiring up Seedance, verify the overlay renders correctly with no background video.

**Files:** none (manual test)

- [ ] **Step 1: Create test props JSON file**

```bash
cat > /tmp/test_keyframe_props.json << 'EOF'
{
  "seedanceVideoPath": "",
  "durationSeconds": 8,
  "keyframes": [
    {"t": 0.5, "dur": 7, "type": "stat", "text": "1.7x", "style": {"color": "#1E64C8"}},
    {"t": 2.0, "dur": 5, "type": "badge", "text": "With sponsor", "position": "right_upper", "style": {"bg": "#1E64C8", "color": "#FFF"}},
    {"t": 2.5, "dur": 5, "type": "badge", "text": "Without", "position": "right_lower", "style": {"bg": "#E0E0E0", "color": "#666"}}
  ]
}
EOF
```

- [ ] **Step 2: Render the test**

```bash
cd backend/app/services/video/remotion && npx remotion render src/index.ts KeyframeOverlay \
  --props="$(cat /tmp/test_keyframe_props.json)" \
  --output=/tmp/keyframe_test.mp4 \
  --frames=0-199
```

Expected: Renders a 8s clip (200 frames at 25fps). Black or transparent bg with "1.7x" fading in at 0.5s, badges at 2s/2.5s.

- [ ] **Step 3: Review the output**

```bash
open /tmp/keyframe_test.mp4
```

Verify: elements appear at correct times, fade in smoothly, badges positioned correctly.

- [ ] **Step 4: Commit (no files changed — test only)**

Note: If KeyframeOverlay shows black background when `seedanceVideoPath` is empty, that's fine — the Seedance video will fill it in production.

---

### Task 8: Add `keyframes` field to Python data model + parser

**Files:**
- Modify: `backend/app/services/video/models.py:14-28`
- Modify: `backend/app/services/video/parser.py:6-25`

- [ ] **Step 1: Add keyframes to Panel dataclass**

In `backend/app/services/video/models.py`, add after the `stock_subtitle` field:

```python
    keyframes: list[dict] | None = None
```

- [ ] **Step 2: Update parser to read keyframes**

In `backend/app/services/video/parser.py`, update the `Panel(...)` constructor call to include:

```python
            keyframes=p.get("keyframes"),
```

- [ ] **Step 3: Verify parser still works**

```bash
cd hackathon-april-12 && /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend/venv/bin/python -c "
import sys; sys.path.insert(0, '../backend/app/services')
from video.parser import parse_storyboard
sb = parse_storyboard('storyboard.json')
print(f'{len(sb.panels)} panels parsed, P14 keyframes: {sb.panels[13].keyframes}')
"
```

Expected: `16 panels parsed, P14 keyframes: None` (no keyframes in storyboard.json yet)

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/video/models.py backend/app/services/video/parser.py
git commit -m "feat: add keyframes field to Panel model and parser"
```

---

### Task 9: LLM keyframe auto-generation

**Files:**
- Create: `hackathon-april-12/keyframe_generator.py`

- [ ] **Step 1: Create the keyframe generator**

```python
# hackathon-april-12/keyframe_generator.py
"""
LLM-based keyframe auto-generation.

Analyzes voiceover_script + visual_direction to produce
timed overlay elements (stat, badge, quote, label, divider).
"""
import json
import sys
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")

SYSTEM_PROMPT = """You are a video overlay designer. Given a panel's voiceover script, visual direction, duration, and screen type, generate a keyframes array that defines what text elements appear on screen and when.

Rules:
- First element must appear within 2 seconds
- No gap longer than 2 seconds between consecutive elements
- Each keyframe needs: t (start seconds), type, text
- Optional: dur (visibility duration), position, style, accent_word
- Element types:
  - "stat": large centered number (use for percentages, multipliers)
  - "badge": floating rounded label (use for key terms, categories)
  - "quote": large serif text with optional accent word (use for impactful phrases)
  - "label": small annotation text
  - "divider": section title card (format text as "Part N | Title")
  - "transition": clear screen (use "effect": "scroll_up" or "fade")
- Calculate timestamps from word position: (word_index / total_words) * duration_seconds
- For talking_head panels: use fewer, punchier elements (badges for key phrases)
- For stock_video panels: badges and labels that reinforce the narration
- For slides panels: stats, quotes, and badges as primary visual content
- Position values: center, top_center, bottom_center, left, right, right_upper, right_lower, row_NofM
- Style object: { "color": hex, "bg": hex, "fontSize": number }

Output ONLY a valid JSON array of keyframe objects. No explanation."""


def generate_keyframes(
    voiceover_script: str,
    visual_direction: list[str],
    duration_seconds: float,
    screen_type: str,
    client: OpenAI | None = None,
) -> list[dict]:
    """Generate keyframes for a single panel via LLM."""
    if client is None:
        client = OpenAI()

    user_prompt = json.dumps({
        "voiceover_script": voiceover_script,
        "visual_direction": visual_direction,
        "duration_seconds": duration_seconds,
        "screen_type": screen_type,
    }, indent=2)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=2000,
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(raw)


def generate_all_keyframes(storyboard_path: str, output_path: str | None = None):
    """Generate keyframes for all panels and write back to storyboard JSON."""
    sb = json.loads(Path(storyboard_path).read_text())
    client = OpenAI()

    for panel in sb["panels"]:
        if panel.get("keyframes"):
            print(f"  [P{panel['panel_number']:02d}] Skipping (keyframes exist)")
            continue

        print(f"  [P{panel['panel_number']:02d}] Generating keyframes...")
        kfs = generate_keyframes(
            voiceover_script=panel["voiceover_script"],
            visual_direction=panel["visual_direction"],
            duration_seconds=panel["duration_seconds"],
            screen_type=panel["screen_type"],
            client=client,
        )
        panel["keyframes"] = kfs
        print(f"    → {len(kfs)} keyframes")

    out = output_path or storyboard_path
    Path(out).write_text(json.dumps(sb, indent=2, ensure_ascii=False))
    print(f"\nKeyframes written to {out}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "storyboard.json"
    generate_all_keyframes(path)
```

- [ ] **Step 2: Test on a single panel**

```bash
cd hackathon-april-12 && /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend/venv/bin/python -c "
from keyframe_generator import generate_keyframes
import json

kfs = generate_keyframes(
    voiceover_script=\"Here's the one number worth remembering. Women with sponsors get promoted at 1.7 times the rate of women without one.\",
    visual_direction=['1.7x as the anchor', 'Industry row below'],
    duration_seconds=16.0,
    screen_type='slides',
)
print(json.dumps(kfs, indent=2))
"
```

Expected: JSON array of keyframes with `t`, `type`, `text` fields.

- [ ] **Step 3: Commit**

```bash
git add hackathon-april-12/keyframe_generator.py
git commit -m "feat: LLM-based keyframe auto-generation from voiceover"
```

---

### Task 10: Update generate.py — Remotion-based rendering with keyframes

**Files:**
- Modify: `hackathon-april-12/generate.py`

- [ ] **Step 1: Add Remotion render function**

Add this function after the existing `overlay_audio` function in `generate.py`:

```python
REMOTION_DIR = REPO_ROOT / "backend" / "app" / "services" / "video" / "remotion"


def remotion_render(seedance_video: str, keyframes: list[dict], duration: float, output_path: str):
    """Render keyframe overlay on Seedance video using Remotion."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    public_dir = REMOTION_DIR / "public"
    public_dir.mkdir(parents=True, exist_ok=True)

    # Stage Seedance video to Remotion's public directory
    import shutil
    video_name = Path(seedance_video).name
    staged_path = public_dir / video_name
    shutil.copyfile(seedance_video, staged_path)

    try:
        props = {
            "seedanceVideoPath": video_name,
            "durationSeconds": duration,
            "keyframes": keyframes,
        }
        props_json = json.dumps(props)
        fps = 25
        total_frames = max(1, int(duration * fps))

        cmd = [
            "npx", "remotion", "render",
            "src/index.ts", "KeyframeOverlay",
            f"--props={props_json}",
            f"--output={str(Path(output_path).resolve())}",
            f"--frames=0-{total_frames - 1}",
        ]
        result = subprocess.run(
            cmd, cwd=str(REMOTION_DIR),
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Remotion render failed: {result.stderr[-1000:]}")
        print(f"    Remotion render → {output_path}")
    finally:
        staged_path.unlink(missing_ok=True)

    return output_path
```

- [ ] **Step 2: Add `--skip-remotion` CLI flag**

In the `main()` function's argparse section, add:

```python
    parser.add_argument("--skip-remotion", action="store_true", help="Skip Remotion overlay (use Seedance video directly)")
```

- [ ] **Step 3: Update render functions to use Remotion overlay**

Replace the render logic in `run_pipeline` — after each panel's Seedance video is generated and before audio overlay, add the Remotion step. In the panel rendering loop, after `panel.clip_path = clip_path` is set, insert the Remotion overlay call.

The key change is in `run_pipeline`: after each render function (`render_talking_head`, `render_stock_video`, `render_slide`) produces a clip, if the panel has keyframes and `--skip-remotion` is not set, run the Remotion overlay:

```python
        # After the existing render call produces clip_path...
        if panel.keyframes and not args.skip_remotion:
            seedance_raw = str(clips_dir / f"panel_{panel.panel_number:02d}_seedance.mp4")
            os.rename(clip_path, seedance_raw)
            remotion_render(
                seedance_video=seedance_raw,
                keyframes=panel.keyframes,
                duration=info["duration"],
                output_path=clip_path,
            )
```

- [ ] **Step 4: Verify the pipeline still runs**

```bash
cd hackathon-april-12 && /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend/venv/bin/python generate.py --only-panels 14 --skip-tts --skip-seedance --skip-remotion 2>&1
```

Expected: Pipeline runs without errors (skipping everything, reusing existing files).

- [ ] **Step 5: Commit**

```bash
git add hackathon-april-12/generate.py
git commit -m "feat: integrate Remotion keyframe overlay into generate.py pipeline"
```

---

### Task 11: End-to-end test — P14 with keyframes

**Files:** none (integration test)

- [ ] **Step 1: Generate keyframes for P14**

```bash
cd hackathon-april-12 && /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend/venv/bin/python -c "
from keyframe_generator import generate_all_keyframes
generate_all_keyframes('storyboard.json')
"
```

- [ ] **Step 2: Review and hand-edit keyframes in storyboard.json**

Open `storyboard.json`, find panel 14's `keyframes` array, and adjust timing/text as needed.

- [ ] **Step 3: Run the full pipeline for P14**

```bash
/Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend/venv/bin/python generate.py --only-panels 14 --skip-tts
```

This will: reuse TTS audio → generate Seedance base video → Remotion overlay with keyframes → audio overlay → stitch.

- [ ] **Step 4: Review output**

```bash
open output/clips/panel_14.mp4
```

Verify: Seedance video plays as background, text elements appear at correct times with smooth fades, audio narration is synced.
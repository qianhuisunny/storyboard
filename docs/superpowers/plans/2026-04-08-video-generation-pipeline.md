# Video Generation Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python CLI that takes a storyboard JSON + speaker photo and produces a finished MP4 video, using Kling Avatar 2.0 (via Runware) for talking head panels and LLM + Remotion for slides panels.

**Architecture:** Two parallel tracks split by `screen_type`. TALKING HEAD panels go through TTS → Kling Avatar. SLIDES panels go through TTS → LLM template mapping → Remotion render. FFmpeg stitches all clips in order. Standalone CLI, no server needed.

**Tech Stack:** Python 3 (httpx, openai), Node.js (Remotion + React + TypeScript), FFmpeg, Runware API (Kling Avatar 2.0), OpenAI TTS API.

**Spec:** `docs/superpowers/specs/2026-04-08-video-generation-pipeline-design.md`

---

## Prerequisites

Before starting any task, run these one-time setup steps:

```bash
# Install ffmpeg (macOS)
brew install ffmpeg

# Verify
ffmpeg -version

# Add RUNWARE_API_KEY to backend/.env
echo "RUNWARE_API_KEY=your_key_here" >> backend/.env
```

---

## Task 1: Data Models & Storyboard Parser

**Files:**
- Create: `backend/app/services/video/models.py`
- Create: `backend/app/services/video/parser.py`
- Create: `backend/app/services/video/__init__.py`
- Create: `backend/app/services/video/tests/__init__.py`
- Create: `backend/app/services/video/tests/test_parser.py`
- Create: `backend/app/services/video/tests/fixtures/sample_storyboard.json`

### Step-by-step:

- [ ] **Step 1: Create the sample storyboard fixture**

This is the PDF storyboard converted to JSON. Create the first 3 panels as a test fixture:

```bash
mkdir -p backend/app/services/video/tests/fixtures
```

```json
// backend/app/services/video/tests/fixtures/sample_storyboard.json
{
  "title": "Video Storyboard",
  "total_duration": "5:00",
  "total_panels": 15,
  "panels": [
    {
      "panel_number": 1,
      "screen_type": "talking_head",
      "duration_seconds": 18.5,
      "voiceover_script": "Picture this: you're the VP of Engineering, sitting in a board meeting with eleven other executives. You look around the room and realize — you're the only woman. Again. This isn't unusual. Research from McKinsey shows that 73% of women in tech report being the only woman in leadership meetings.",
      "visual_direction": [
        "Professional woman in business attire speaking directly to camera",
        "Confident, authoritative presence with slight concern in expression",
        "Clean, modern office background",
        "Direct eye contact establishing credibility"
      ]
    },
    {
      "panel_number": 2,
      "screen_type": "slides",
      "duration_seconds": 17.5,
      "voiceover_script": "Only 28% of senior leadership roles in tech are held by women, meaning most boardrooms have at most one female voice. As you climb higher, the isolation gets worse — not better. This isolation means missing the informal knowledge sharing that happens when peers face similar challenges.",
      "visual_direction": [
        "Pyramid diagram showing leadership levels with percentages: Entry level 45% women, Mid-level 32% women, Senior level 28% women, C-suite 22% women",
        "Each level shows fewer female icons, emphasizing increasing isolation",
        "Arrow pointing upward with 'Increasing Isolation' label",
        "Clean data visualization with professional color scheme"
      ]
    },
    {
      "panel_number": 3,
      "screen_type": "slides",
      "duration_seconds": 20.5,
      "voiceover_script": "Traditional mentorship and skill development programs miss this entirely. They focus on universal skills like communication and strategy, but ignore how gender affects their reception. Harvard Business Review found that identical leadership behaviors are rated 35% less favorably when exhibited by women. Standard diversity metrics count representation but miss the isolation experience that undermines effectiveness.",
      "visual_direction": [
        "Split comparison showing identical leadership behavior",
        "Left side: Male leader presenting (positive ratings: 8.5/10)",
        "Right side: Female leader with same behavior (ratings: 5.5/10)",
        "Below: Traditional programs focusing on 'universal skills' missing the gender dynamic"
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the data models**

```python
# backend/app/services/video/models.py
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ScreenType(str, Enum):
    TALKING_HEAD = "talking_head"
    SLIDES = "slides"


@dataclass
class Panel:
    panel_number: int
    screen_type: ScreenType
    duration_seconds: float
    voiceover_script: str
    visual_direction: list[str]
    # Populated during pipeline execution
    audio_path: Optional[str] = None
    clip_path: Optional[str] = None


@dataclass
class Storyboard:
    title: str
    total_duration: str
    total_panels: int
    panels: list[Panel]

    @property
    def talking_head_panels(self) -> list[Panel]:
        return [p for p in self.panels if p.screen_type == ScreenType.TALKING_HEAD]

    @property
    def slides_panels(self) -> list[Panel]:
        return [p for p in self.panels if p.screen_type == ScreenType.SLIDES]


@dataclass
class PipelineConfig:
    storyboard_path: str
    avatar_image_path: str
    output_dir: str
    voice: str = "alloy"
    kling_model: str = "standard"  # "standard" or "pro"
    max_parallel: int = 4
    skip_tts: bool = False
    skip_avatar: bool = False
    only_panels: Optional[list[int]] = None
```

- [ ] **Step 3: Write the parser**

```python
# backend/app/services/video/parser.py
import json
from pathlib import Path
from .models import Panel, Storyboard, ScreenType


def parse_storyboard(path: str) -> Storyboard:
    """Parse a storyboard JSON file into a Storyboard object."""
    raw = json.loads(Path(path).read_text())
    panels = []
    for p in raw["panels"]:
        panels.append(Panel(
            panel_number=p["panel_number"],
            screen_type=ScreenType(p["screen_type"]),
            duration_seconds=p["duration_seconds"],
            voiceover_script=p["voiceover_script"],
            visual_direction=p["visual_direction"],
        ))
    return Storyboard(
        title=raw["title"],
        total_duration=raw["total_duration"],
        total_panels=raw["total_panels"],
        panels=panels,
    )
```

- [ ] **Step 4: Create `__init__.py` files**

```python
# backend/app/services/video/__init__.py
# Video generation pipeline
```

```python
# backend/app/services/video/tests/__init__.py
```

- [ ] **Step 5: Write the test**

```python
# backend/app/services/video/tests/test_parser.py
import os
from pathlib import Path
from video.models import ScreenType
from video.parser import parse_storyboard

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_storyboard_loads_panels():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    assert sb.title == "Video Storyboard"
    assert len(sb.panels) == 3


def test_parse_storyboard_splits_by_type():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    assert len(sb.talking_head_panels) == 1
    assert len(sb.slides_panels) == 2


def test_panel_fields_populated():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    panel = sb.panels[0]
    assert panel.screen_type == ScreenType.TALKING_HEAD
    assert panel.duration_seconds == 18.5
    assert "VP of Engineering" in panel.voiceover_script
    assert len(panel.visual_direction) == 4
    assert panel.audio_path is None
    assert panel.clip_path is None
```

- [ ] **Step 6: Run tests**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_parser.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/video/
git commit -m "feat(video): add data models and storyboard parser"
```

---

## Task 2: TTS Module (OpenAI)

**Files:**
- Create: `backend/app/services/video/tts.py`
- Create: `backend/app/services/video/tests/test_tts.py`

### Step-by-step:

- [ ] **Step 1: Write the failing test**

```python
# backend/app/services/video/tests/test_tts.py
import os
import tempfile
from unittest.mock import patch, MagicMock
from pathlib import Path
from video.tts import generate_audio


def test_generate_audio_creates_mp3():
    """Test that generate_audio calls OpenAI TTS and writes an mp3 file."""
    mock_response = MagicMock()
    mock_response.write_to_file = MagicMock()

    mock_client = MagicMock()
    mock_client.audio.speech.create.return_value = mock_response

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, "panel_01.mp3")
        generate_audio(
            text="Hello world",
            output_path=output_path,
            voice="alloy",
            client=mock_client,
        )

        mock_client.audio.speech.create.assert_called_once_with(
            model="tts-1-hd",
            voice="alloy",
            input="Hello world",
        )
        mock_response.write_to_file.assert_called_once_with(output_path)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_tts.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'video.tts'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/video/tts.py
import os
import asyncio
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


def generate_audio(
    text: str,
    output_path: str,
    voice: str = "alloy",
    client: OpenAI | None = None,
) -> str:
    """Generate TTS audio for a single panel's voiceover script.

    Args:
        text: The voiceover script text.
        output_path: Where to save the .mp3 file.
        voice: OpenAI TTS voice name (alloy/echo/nova/onyx/shimmer).
        client: Optional OpenAI client (for testing).

    Returns:
        The output_path.
    """
    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    response = client.audio.speech.create(
        model="tts-1-hd",
        voice=voice,
        input=text,
    )
    response.write_to_file(output_path)
    return output_path


def generate_all_audio(
    panels: list,
    output_dir: str,
    voice: str = "alloy",
    client: OpenAI | None = None,
) -> list:
    """Generate TTS audio for all panels.

    Args:
        panels: List of Panel objects.
        output_dir: Directory to save audio files.
        voice: OpenAI TTS voice name.
        client: Optional OpenAI client.

    Returns:
        List of panels with audio_path populated.
    """
    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    audio_dir = os.path.join(output_dir, "audio")
    os.makedirs(audio_dir, exist_ok=True)

    for panel in panels:
        output_path = os.path.join(audio_dir, f"panel_{panel.panel_number:02d}.mp3")
        generate_audio(
            text=panel.voiceover_script,
            output_path=output_path,
            voice=voice,
            client=client,
        )
        panel.audio_path = output_path
        print(f"  [TTS] Panel {panel.panel_number:02d} → {output_path}")

    return panels
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_tts.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/video/tts.py backend/app/services/video/tests/test_tts.py
git commit -m "feat(video): add OpenAI TTS module"
```

---

## Task 3: Avatar Module (Kling via Runware)

**Files:**
- Create: `backend/app/services/video/avatar.py`
- Create: `backend/app/services/video/tests/test_avatar.py`

### Step-by-step:

- [ ] **Step 1: Write the failing test**

```python
# backend/app/services/video/tests/test_avatar.py
import os
import tempfile
from unittest.mock import patch, MagicMock, AsyncMock
import pytest
from video.avatar import RunwareAvatarClient, generate_avatar_video


def test_build_request_body():
    """Test that the Runware request body is correctly structured."""
    client = RunwareAvatarClient(api_key="test_key")
    body = client.build_request(
        image_url="https://example.com/speaker.png",
        audio_url="https://example.com/audio.mp3",
        model="standard",
    )
    assert body["taskType"] == "videoInference"
    assert body["model"] == "klingai:avatar@2.0-standard"
    assert body["inputs"]["image"] == "https://example.com/speaker.png"
    assert body["inputs"]["audio"] == "https://example.com/audio.mp3"
    assert "taskUUID" in body


def test_build_request_body_pro():
    """Test pro model variant."""
    client = RunwareAvatarClient(api_key="test_key")
    body = client.build_request(
        image_url="https://example.com/speaker.png",
        audio_url="https://example.com/audio.mp3",
        model="pro",
    )
    assert body["model"] == "klingai:avatar@2.0-pro"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_avatar.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'video.avatar'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/video/avatar.py
import os
import uuid
import time
import httpx
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

RUNWARE_API_URL = "https://api.runware.ai/v1"


class RunwareAvatarClient:
    """Client for generating talking head videos via Runware's Kling Avatar API."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("RUNWARE_API_KEY")

    def build_request(
        self,
        image_url: str,
        audio_url: str,
        model: str = "standard",
    ) -> dict:
        """Build the Runware API request body for Kling Avatar 2.0."""
        model_id = f"klingai:avatar@2.0-{model}"
        return {
            "taskType": "videoInference",
            "taskUUID": str(uuid.uuid4()),
            "model": model_id,
            "inputs": {
                "image": image_url,
                "audio": audio_url,
            },
            "deliveryMethod": "async",
            "includeCost": True,
        }

    def submit(self, request_body: dict) -> str:
        """Submit a video generation task. Returns the taskUUID."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        response = httpx.post(
            RUNWARE_API_URL,
            json=[request_body],
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        return request_body["taskUUID"]

    def poll_result(self, task_uuid: str, timeout: int = 300, interval: int = 5) -> str:
        """Poll for async task completion. Returns the video URL."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        poll_body = [{
            "taskType": "getResponse",
            "taskUUID": task_uuid,
        }]
        deadline = time.time() + timeout
        while time.time() < deadline:
            response = httpx.post(
                RUNWARE_API_URL,
                json=poll_body,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                result = data[0]
                if result.get("status") == "success":
                    return result.get("videoURL") or result.get("outputURL")
                if result.get("status") == "error":
                    raise RuntimeError(f"Runware task failed: {result}")
            time.sleep(interval)
        raise TimeoutError(f"Kling avatar generation timed out after {timeout}s")

    def download_video(self, video_url: str, output_path: str) -> str:
        """Download the generated video to a local file."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", video_url, timeout=60) as r:
            r.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in r.iter_bytes(chunk_size=8192):
                    f.write(chunk)
        return output_path


def generate_avatar_video(
    image_url: str,
    audio_url: str,
    output_path: str,
    model: str = "standard",
    client: RunwareAvatarClient | None = None,
) -> str:
    """End-to-end: submit avatar generation, poll, download.

    Args:
        image_url: URL of the speaker portrait image.
        audio_url: URL of the TTS audio file.
        output_path: Local path to save the video.
        model: "standard" or "pro".
        client: Optional RunwareAvatarClient (for testing).

    Returns:
        The output_path.
    """
    if client is None:
        client = RunwareAvatarClient()

    request = client.build_request(image_url, audio_url, model)
    task_uuid = client.submit(request)
    print(f"  [Avatar] Submitted task {task_uuid}, polling...")
    video_url = client.poll_result(task_uuid)
    print(f"  [Avatar] Done, downloading...")
    client.download_video(video_url, output_path)
    return output_path
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_avatar.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/video/avatar.py backend/app/services/video/tests/test_avatar.py
git commit -m "feat(video): add Kling Avatar module via Runware API"
```

---

## Task 4: Slide Generator Module (LLM → Remotion Props)

**Files:**
- Create: `backend/app/services/video/slides.py`
- Create: `backend/app/services/video/tests/test_slides.py`
- Create: `prompts/SLIDE_GENERATOR_PROMPT.md`

### Step-by-step:

- [ ] **Step 1: Write the slide generator system prompt**

```markdown
<!-- prompts/SLIDE_GENERATOR_PROMPT.md -->
# Slide Generator

You translate visual direction text from a video storyboard into structured JSON for Remotion rendering.

## Available Templates

### 1. PyramidChart
Hierarchical data visualization with levels and percentages.

```typescript
interface PyramidChartProps {
  title: string;
  levels: Array<{ label: string; percentage: number }>;  // top-to-bottom
  annotation?: string;        // e.g. "Increasing Isolation"
  annotationDirection?: "upward" | "downward";
}
```

### 2. SplitComparison
Side-by-side comparison of two things.

```typescript
interface SplitComparisonProps {
  title: string;
  left: { label: string; description: string; metric?: string; sentiment?: "positive" | "negative" | "neutral" };
  right: { label: string; description: string; metric?: string; sentiment?: "positive" | "negative" | "neutral" };
  footnote?: string;          // source attribution
}
```

### 3. Timeline
Sequence of events or decision points along a time axis.

```typescript
interface TimelineProps {
  title: string;
  events: Array<{ label: string; description: string; highlight?: boolean }>;
  direction?: "horizontal" | "vertical";  // default: horizontal
}
```

### 4. ThreeColumn
Three items displayed in columns with headers and descriptions.

```typescript
interface ThreeColumnProps {
  title: string;
  columns: [
    { header: string; items: string[]; icon?: string },
    { header: string; items: string[]; icon?: string },
    { header: string; items: string[]; icon?: string }
  ];
  footnote?: string;
}
```

### 5. DataCard (fallback)
Flexible card for stats, diagrams, or any content that doesn't fit other templates.

```typescript
interface DataCardProps {
  title: string;
  stats?: Array<{ label: string; value: string; trend?: "up" | "down" | "flat" }>;
  bullets?: string[];
  footnote?: string;
}
```

## Your Task

Given the visual direction text, return a JSON object:
```json
{
  "template": "<template_name>",
  "props": { ... },
  "animation": "fade_in" | "stagger_fade_in" | "slide_up"
}
```

## Rules
- Pick the BEST matching template. When unsure, use DataCard.
- All text in props must come from the visual direction — do not invent data.
- Keep prop values concise (labels under 40 chars).
- Return ONLY the JSON object, no markdown fences or explanation.
```

- [ ] **Step 2: Write the failing test**

```python
# backend/app/services/video/tests/test_slides.py
import json
from unittest.mock import patch, MagicMock
from video.slides import map_visual_direction_to_props, VALID_TEMPLATES


def test_map_returns_valid_template():
    """Test that the LLM response is parsed and validated."""
    mock_llm_response = json.dumps({
        "template": "PyramidChart",
        "props": {
            "title": "Women in Tech Leadership",
            "levels": [
                {"label": "Entry Level", "percentage": 45},
                {"label": "C-Suite", "percentage": 22},
            ],
        },
        "animation": "stagger_fade_in",
    })

    with patch("video.slides.call_llm", return_value=mock_llm_response):
        result = map_visual_direction_to_props([
            "Pyramid diagram showing leadership levels",
            "Entry level 45% women",
            "C-suite 22% women",
        ])
        assert result["template"] == "PyramidChart"
        assert result["props"]["title"] == "Women in Tech Leadership"
        assert len(result["props"]["levels"]) == 2


def test_map_falls_back_to_datacard_on_invalid_template():
    """Test fallback when LLM returns unknown template."""
    mock_llm_response = json.dumps({
        "template": "NonExistentTemplate",
        "props": {"title": "Test"},
        "animation": "fade_in",
    })

    with patch("video.slides.call_llm", return_value=mock_llm_response):
        result = map_visual_direction_to_props(["Some visual direction"])
        assert result["template"] == "DataCard"


def test_valid_templates_list():
    assert "PyramidChart" in VALID_TEMPLATES
    assert "SplitComparison" in VALID_TEMPLATES
    assert "Timeline" in VALID_TEMPLATES
    assert "ThreeColumn" in VALID_TEMPLATES
    assert "DataCard" in VALID_TEMPLATES
    assert len(VALID_TEMPLATES) == 5
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_slides.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'video.slides'`

- [ ] **Step 4: Write the implementation**

```python
# backend/app/services/video/slides.py
import os
import json
import subprocess
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

VALID_TEMPLATES = ["PyramidChart", "SplitComparison", "Timeline", "ThreeColumn", "DataCard"]

# Path to the system prompt
PROMPT_PATH = Path(__file__).parent.parent.parent.parent.parent / "prompts" / "SLIDE_GENERATOR_PROMPT.md"

# Path to the remotion project
REMOTION_DIR = Path(__file__).parent.parent.parent.parent.parent / "remotion"


def _load_system_prompt() -> str:
    return PROMPT_PATH.read_text()


def call_llm(user_prompt: str, client: OpenAI | None = None) -> str:
    """Call LLM to translate visual direction into Remotion props."""
    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _load_system_prompt()},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=1000,
    )
    return response.choices[0].message.content.strip()


def map_visual_direction_to_props(
    visual_direction: list[str],
    client: OpenAI | None = None,
) -> dict:
    """Map visual direction text to a Remotion template + props.

    Args:
        visual_direction: List of visual direction bullet points.
        client: Optional OpenAI client (for testing).

    Returns:
        Dict with keys: template, props, animation.
    """
    user_prompt = "Visual direction:\n" + "\n".join(f"- {line}" for line in visual_direction)
    raw = call_llm(user_prompt, client)

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    result = json.loads(raw)

    # Validate template
    if result.get("template") not in VALID_TEMPLATES:
        print(f"  [Slides] Unknown template '{result.get('template')}', falling back to DataCard")
        result["template"] = "DataCard"
        if "bullets" not in result.get("props", {}):
            result["props"] = {
                "title": result.get("props", {}).get("title", "Content"),
                "bullets": visual_direction,
            }

    return result


def render_slide(
    template: str,
    props: dict,
    audio_path: str,
    output_path: str,
    duration_seconds: float,
) -> str:
    """Render a Remotion slide to MP4.

    Args:
        template: Remotion component name (e.g. "PyramidChart").
        props: Props dict for the component.
        audio_path: Path to the voiceover audio file.
        output_path: Where to save the rendered .mp4.
        duration_seconds: Duration of the panel.

    Returns:
        The output_path.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Add audio and duration to props for Remotion
    render_props = {
        **props,
        "audioSrc": str(Path(audio_path).resolve()),
        "durationInSeconds": duration_seconds,
    }

    props_json = json.dumps(render_props)
    fps = 30
    total_frames = int(duration_seconds * fps)

    cmd = [
        "npx", "remotion", "render",
        "src/index.ts", template,
        f"--props={props_json}",
        f"--output={str(Path(output_path).resolve())}",
        f"--frames=0-{total_frames - 1}",
    ]

    result = subprocess.run(
        cmd,
        cwd=str(REMOTION_DIR),
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Remotion render failed:\n{result.stderr}")

    return output_path
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_slides.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/video/slides.py backend/app/services/video/tests/test_slides.py prompts/SLIDE_GENERATOR_PROMPT.md
git commit -m "feat(video): add LLM slide generator with template mapping"
```

---

## Task 5: Remotion Project Setup & Slide Components

**Files:**
- Create: `remotion/package.json`
- Create: `remotion/tsconfig.json`
- Create: `remotion/remotion.config.ts`
- Create: `remotion/src/index.ts`
- Create: `remotion/src/Root.tsx`
- Create: `remotion/src/components/PyramidChart.tsx`
- Create: `remotion/src/components/SplitComparison.tsx`
- Create: `remotion/src/components/Timeline.tsx`
- Create: `remotion/src/components/ThreeColumn.tsx`
- Create: `remotion/src/components/DataCard.tsx`
- Create: `remotion/src/components/SlideWrapper.tsx`

### Step-by-step:

- [ ] **Step 1: Initialize the Remotion project**

```bash
cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon
mkdir -p remotion/src/components
```

```json
// remotion/package.json
{
  "name": "plotline-slides",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "studio": "remotion studio",
    "render": "remotion render"
  },
  "dependencies": {
    "@remotion/cli": "^4.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "remotion": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "typescript": "^5.5.0"
  }
}
```

```json
// remotion/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

```typescript
// remotion/remotion.config.ts
import { Config } from "@remotion/cli/config";
Config.setVideoImageFormat("jpeg");
```

- [ ] **Step 2: Install dependencies**

```bash
cd remotion && npm install
```

- [ ] **Step 3: Create the SlideWrapper (shared layout for all slides)**

```tsx
// remotion/src/components/SlideWrapper.tsx
import React from "react";
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";

interface SlideWrapperProps {
  title: string;
  audioSrc?: string;
  children: React.ReactNode;
}

export const SlideWrapper: React.FC<SlideWrapperProps> = ({
  title,
  audioSrc,
  children,
}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#FFFFFF",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 60,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h1
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: "#1a1a1a",
          marginBottom: 40,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h1>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4: Create PyramidChart component**

```tsx
// remotion/src/components/PyramidChart.tsx
import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface Level {
  label: string;
  percentage: number;
}

interface PyramidChartProps {
  title: string;
  levels: Level[];
  annotation?: string;
  annotationDirection?: "upward" | "downward";
  audioSrc?: string;
  durationInSeconds?: number;
}

export const PyramidChart: React.FC<PyramidChartProps> = ({
  title,
  levels,
  annotation,
  audioSrc,
}) => {
  const frame = useCurrentFrame();
  const maxWidth = 800;

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
        {levels.map((level, i) => {
          const widthFraction = 1 - i * (0.6 / levels.length);
          const opacity = interpolate(frame, [i * 10, i * 10 + 15], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                width: maxWidth * widthFraction,
                backgroundColor: `hsl(150, ${30 + i * 10}%, ${85 - i * 8}%)`,
                borderRadius: 8,
                padding: "16px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 600, color: "#2D6A4F" }}>{level.label}</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{level.percentage}%</span>
            </div>
          );
        })}
        {annotation && (
          <div
            style={{
              marginTop: 20,
              fontSize: 20,
              color: "#666",
              fontStyle: "italic",
              opacity: interpolate(frame, [levels.length * 10, levels.length * 10 + 15], [0, 1], { extrapolateRight: "clamp" }),
            }}
          >
            ↑ {annotation}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};
```

- [ ] **Step 5: Create SplitComparison component**

```tsx
// remotion/src/components/SplitComparison.tsx
import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface Side {
  label: string;
  description: string;
  metric?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

interface SplitComparisonProps {
  title: string;
  left: Side;
  right: Side;
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
}

const sentimentColor = (s?: string) => {
  if (s === "positive") return "#2D6A4F";
  if (s === "negative") return "#A63228";
  return "#666";
};

export const SplitComparison: React.FC<SplitComparisonProps> = ({
  title,
  left,
  right,
  footnote,
  audioSrc,
}) => {
  const frame = useCurrentFrame();
  const leftOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const rightOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateRight: "clamp" });

  const renderSide = (side: Side, opacity: number) => (
    <div
      style={{
        flex: 1,
        backgroundColor: "#f8f9fa",
        borderRadius: 12,
        padding: 32,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 600, color: "#1a1a1a" }}>{side.label}</div>
      <div style={{ fontSize: 18, color: "#666", textAlign: "center" }}>{side.description}</div>
      {side.metric && (
        <div style={{ fontSize: 48, fontWeight: 700, color: sentimentColor(side.sentiment) }}>
          {side.metric}
        </div>
      )}
    </div>
  );

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div style={{ display: "flex", gap: 24, width: "100%" }}>
        {renderSide(left, leftOpacity)}
        <div style={{ display: "flex", alignItems: "center", fontSize: 32, color: "#ccc" }}>vs</div>
        {renderSide(right, rightOpacity)}
      </div>
      {footnote && (
        <div style={{ textAlign: "center", fontSize: 14, color: "#999", marginTop: 20 }}>
          Source: {footnote}
        </div>
      )}
    </SlideWrapper>
  );
};
```

- [ ] **Step 6: Create Timeline component**

```tsx
// remotion/src/components/Timeline.tsx
import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface TimelineEvent {
  label: string;
  description: string;
  highlight?: boolean;
}

interface TimelineProps {
  title: string;
  events: TimelineEvent[];
  direction?: "horizontal" | "vertical";
  audioSrc?: string;
  durationInSeconds?: number;
}

export const Timeline: React.FC<TimelineProps> = ({
  title,
  events,
  direction = "horizontal",
  audioSrc,
}) => {
  const frame = useCurrentFrame();
  const isVertical = direction === "vertical";

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div
        style={{
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
          gap: 16,
          width: "100%",
          alignItems: isVertical ? "flex-start" : "flex-end",
        }}
      >
        {events.map((event, i) => {
          const opacity = interpolate(frame, [i * 12, i * 12 + 15], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                flex: 1,
                opacity,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: event.highlight ? "#2D6A4F" : "#ccc",
                }}
              />
              <div style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a", textAlign: "center" }}>
                {event.label}
              </div>
              <div style={{ fontSize: 14, color: "#666", textAlign: "center" }}>
                {event.description}
              </div>
            </div>
          );
        })}
      </div>
    </SlideWrapper>
  );
};
```

- [ ] **Step 7: Create ThreeColumn component**

```tsx
// remotion/src/components/ThreeColumn.tsx
import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface Column {
  header: string;
  items: string[];
  icon?: string;
}

interface ThreeColumnProps {
  title: string;
  columns: [Column, Column, Column];
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
}

export const ThreeColumn: React.FC<ThreeColumnProps> = ({
  title,
  columns,
  footnote,
  audioSrc,
}) => {
  const frame = useCurrentFrame();

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div style={{ display: "flex", gap: 24, width: "100%" }}>
        {columns.map((col, i) => {
          const opacity = interpolate(frame, [i * 12, i * 12 + 15], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                flex: 1,
                backgroundColor: "#f8f9fa",
                borderRadius: 12,
                padding: 24,
                opacity,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: "#2D6A4F", marginBottom: 16 }}>
                {col.header}
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {col.items.map((item, j) => (
                  <li key={j} style={{ fontSize: 16, color: "#444", marginBottom: 8, lineHeight: 1.4 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {footnote && (
        <div style={{ textAlign: "center", fontSize: 14, color: "#999", marginTop: 20 }}>
          {footnote}
        </div>
      )}
    </SlideWrapper>
  );
};
```

- [ ] **Step 8: Create DataCard component (fallback)**

```tsx
// remotion/src/components/DataCard.tsx
import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface Stat {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
}

interface DataCardProps {
  title: string;
  stats?: Stat[];
  bullets?: string[];
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
}

const trendIcon = (t?: string) => {
  if (t === "up") return "↑";
  if (t === "down") return "↓";
  return "→";
};

const trendColor = (t?: string) => {
  if (t === "up") return "#2D6A4F";
  if (t === "down") return "#A63228";
  return "#666";
};

export const DataCard: React.FC<DataCardProps> = ({
  title,
  stats,
  bullets,
  footnote,
  audioSrc,
}) => {
  const frame = useCurrentFrame();

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div style={{ width: "100%" }}>
        {stats && (
          <div style={{ display: "flex", gap: 24, marginBottom: 32, justifyContent: "center" }}>
            {stats.map((stat, i) => {
              const opacity = interpolate(frame, [i * 10, i * 10 + 15], [0, 1], { extrapolateRight: "clamp" });
              return (
                <div key={i} style={{ textAlign: "center", opacity, padding: 20, backgroundColor: "#f8f9fa", borderRadius: 12, minWidth: 160 }}>
                  <div style={{ fontSize: 40, fontWeight: 700, color: trendColor(stat.trend) }}>
                    {stat.value} {trendIcon(stat.trend)}
                  </div>
                  <div style={{ fontSize: 16, color: "#666", marginTop: 8 }}>{stat.label}</div>
                </div>
              );
            })}
          </div>
        )}
        {bullets && (
          <ul style={{ margin: 0, paddingLeft: 24 }}>
            {bullets.map((b, i) => {
              const opacity = interpolate(frame, [i * 8, i * 8 + 12], [0, 1], { extrapolateRight: "clamp" });
              return (
                <li key={i} style={{ fontSize: 22, color: "#333", marginBottom: 12, lineHeight: 1.5, opacity }}>
                  {b}
                </li>
              );
            })}
          </ul>
        )}
        {footnote && (
          <div style={{ textAlign: "center", fontSize: 14, color: "#999", marginTop: 24 }}>
            {footnote}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};
```

- [ ] **Step 9: Create Root.tsx and index.ts (Remotion entry points)**

```tsx
// remotion/src/Root.tsx
import { Composition } from "remotion";
import { PyramidChart } from "./components/PyramidChart";
import { SplitComparison } from "./components/SplitComparison";
import { Timeline } from "./components/Timeline";
import { ThreeColumn } from "./components/ThreeColumn";
import { DataCard } from "./components/DataCard";

const FPS = 30;

// Default props for Remotion Studio preview
const defaultPyramid = {
  title: "Women in Tech Leadership",
  levels: [
    { label: "Entry Level", percentage: 45 },
    { label: "Mid-Level", percentage: 32 },
    { label: "Senior Level", percentage: 28 },
    { label: "C-Suite", percentage: 22 },
  ],
  annotation: "Increasing Isolation",
  durationInSeconds: 17.5,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PyramidChart"
        component={PyramidChart}
        durationInFrames={FPS * 18}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultPyramid}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 18) * FPS),
        })}
      />
      <Composition
        id="SplitComparison"
        component={SplitComparison}
        durationInFrames={FPS * 20}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Same Behavior, Different Reception",
          left: { label: "Male Leader", description: "Presenting quarterly results", metric: "8.5/10", sentiment: "positive" as const },
          right: { label: "Female Leader", description: "Same presentation style", metric: "5.5/10", sentiment: "negative" as const },
          footnote: "Harvard Business Review",
          durationInSeconds: 20,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 20) * FPS),
        })}
      />
      <Composition
        id="Timeline"
        component={Timeline}
        durationInFrames={FPS * 23}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Career Decision Complexity",
          events: [
            { label: "Promotion Timing", description: "Strategic window management", highlight: true },
            { label: "Family Planning", description: "Career impact assessment" },
            { label: "Project Leadership", description: "Visibility vs. risk" },
            { label: "Credibility Building", description: "Post-transition recovery", highlight: true },
          ],
          durationInSeconds: 23,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 23) * FPS),
        })}
      />
      <Composition
        id="ThreeColumn"
        component={ThreeColumn}
        durationInFrames={FPS * 20}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Implementation by Role",
          columns: [
            { header: "Female Leaders", items: ["Build peer networks", "Seek male sponsors"] },
            { header: "Male Leaders", items: ["Active sponsorship", "Support networks"] },
            { header: "HR Leaders", items: ["Facilitate networks", "Train sponsors"] },
          ] as [{ header: string; items: string[] }, { header: string; items: string[] }, { header: string; items: string[] }],
          durationInSeconds: 20,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 20) * FPS),
        })}
      />
      <Composition
        id="DataCard"
        component={DataCard}
        durationInFrames={FPS * 19}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Impact Comparison",
          stats: [
            { label: "Individual Approach", value: "1 success / 3-4 years", trend: "flat" as const },
            { label: "Dual-Track Approach", value: "3.2x higher rate", trend: "up" as const },
          ],
          durationInSeconds: 19,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 19) * FPS),
        })}
      />
    </>
  );
};
```

```typescript
// remotion/src/index.ts
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
```

- [ ] **Step 10: Verify Remotion renders**

```bash
cd remotion
npx remotion render src/index.ts PyramidChart --output=test_pyramid.mp4
```

Expected: creates `test_pyramid.mp4` (~18 seconds). Delete after verification:
```bash
rm test_pyramid.mp4
```

- [ ] **Step 11: Commit**

```bash
git add remotion/
git commit -m "feat(video): add Remotion project with 5 slide templates"
```

---

## Task 6: FFmpeg Stitcher

**Files:**
- Create: `backend/app/services/video/stitcher.py`
- Create: `backend/app/services/video/tests/test_stitcher.py`

### Step-by-step:

- [ ] **Step 1: Write the failing test**

```python
# backend/app/services/video/tests/test_stitcher.py
import os
import tempfile
from unittest.mock import patch, MagicMock
from video.stitcher import build_concat_file, stitch_videos


def test_build_concat_file():
    """Test that the ffmpeg concat file is correctly generated."""
    clips = ["/tmp/clip_01.mp4", "/tmp/clip_02.mp4", "/tmp/clip_03.mp4"]
    with tempfile.TemporaryDirectory() as tmpdir:
        concat_path = os.path.join(tmpdir, "concat.txt")
        build_concat_file(clips, concat_path)

        content = open(concat_path).read()
        assert "file '/tmp/clip_01.mp4'" in content
        assert "file '/tmp/clip_02.mp4'" in content
        assert "file '/tmp/clip_03.mp4'" in content
        lines = [l for l in content.strip().split("\n") if l.startswith("file ")]
        assert len(lines) == 3


@patch("video.stitcher.subprocess.run")
def test_stitch_calls_ffmpeg(mock_run):
    """Test that stitch_videos calls ffmpeg with correct args."""
    mock_run.return_value = MagicMock(returncode=0, stderr="")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create dummy clip files
        clips = []
        for i in range(3):
            path = os.path.join(tmpdir, f"clip_{i:02d}.mp4")
            open(path, "w").close()
            clips.append(path)

        output = os.path.join(tmpdir, "final.mp4")
        stitch_videos(clips, output)

        mock_run.assert_called_once()
        call_args = mock_run.call_args[0][0]
        assert call_args[0] == "ffmpeg"
        assert "-f" in call_args
        assert "concat" in call_args
        assert output in call_args
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_stitcher.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'video.stitcher'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/video/stitcher.py
import subprocess
from pathlib import Path


def build_concat_file(clip_paths: list[str], output_path: str) -> str:
    """Build an ffmpeg concat demuxer file listing all clips in order.

    Args:
        clip_paths: Ordered list of clip file paths.
        output_path: Where to write the concat file.

    Returns:
        The output_path.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        for path in clip_paths:
            f.write(f"file '{path}'\n")
    return output_path


def stitch_videos(clip_paths: list[str], output_path: str) -> str:
    """Stitch multiple video clips into a single MP4 using ffmpeg.

    Args:
        clip_paths: Ordered list of clip file paths.
        output_path: Where to save the final video.

    Returns:
        The output_path.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    concat_file = str(Path(output_path).parent / "concat.txt")
    build_concat_file(clip_paths, concat_file)

    cmd = [
        "ffmpeg",
        "-y",                     # overwrite output
        "-f", "concat",           # concat demuxer
        "-safe", "0",             # allow absolute paths
        "-i", concat_file,        # input file list
        "-c", "copy",             # copy streams (no re-encode)
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg stitch failed:\n{result.stderr}")

    print(f"  [Stitch] Final video → {output_path}")
    return output_path
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m pytest app/services/video/tests/test_stitcher.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/video/stitcher.py backend/app/services/video/tests/test_stitcher.py
git commit -m "feat(video): add FFmpeg stitcher module"
```

---

## Task 7: Pipeline Orchestrator

**Files:**
- Create: `backend/app/services/video/pipeline.py`

### Step-by-step:

- [x] **Step 1: Write the pipeline orchestrator**

```python
# backend/app/services/video/pipeline.py
import os
import json
import time
from pathlib import Path
from .models import PipelineConfig, Storyboard, ScreenType
from .parser import parse_storyboard
from .tts import generate_all_audio
from .avatar import generate_avatar_video, RunwareAvatarClient
from .slides import map_visual_direction_to_props, render_slide
from .stitcher import stitch_videos


def run_pipeline(config: PipelineConfig) -> str:
    """Run the full video generation pipeline.

    Args:
        config: Pipeline configuration.

    Returns:
        Path to the final video file.
    """
    start = time.time()
    print(f"=== Video Generation Pipeline ===")

    # 1. Parse storyboard
    print(f"\n[1/4] Parsing storyboard...")
    storyboard = parse_storyboard(config.storyboard_path)
    panels = storyboard.panels

    # Filter to specific panels if requested
    if config.only_panels:
        panels = [p for p in panels if p.panel_number in config.only_panels]
        print(f"  Filtered to panels: {[p.panel_number for p in panels]}")

    print(f"  {len(panels)} panels: {len([p for p in panels if p.screen_type == ScreenType.TALKING_HEAD])} talking head, {len([p for p in panels if p.screen_type == ScreenType.SLIDES])} slides")

    # 2. Generate TTS audio for all panels
    if not config.skip_tts:
        print(f"\n[2/4] Generating TTS audio...")
        generate_all_audio(panels, config.output_dir, voice=config.voice)
    else:
        print(f"\n[2/4] Skipping TTS (reusing existing audio)")
        audio_dir = os.path.join(config.output_dir, "audio")
        for panel in panels:
            panel.audio_path = os.path.join(audio_dir, f"panel_{panel.panel_number:02d}.mp3")

    # 3. Generate video clips per panel
    print(f"\n[3/4] Generating video clips...")
    clips_dir = os.path.join(config.output_dir, "clips")
    slides_dir = os.path.join(config.output_dir, "slides")
    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(slides_dir, exist_ok=True)

    for panel in panels:
        clip_path = os.path.join(clips_dir, f"panel_{panel.panel_number:02d}.mp4")

        if panel.screen_type == ScreenType.TALKING_HEAD:
            if config.skip_avatar:
                print(f"  [Panel {panel.panel_number:02d}] Skipping avatar (reusing)")
                panel.clip_path = clip_path
                continue

            print(f"  [Panel {panel.panel_number:02d}] TALKING HEAD → Kling Avatar")
            # Note: Runware needs URLs, not local files.
            # For v1, the avatar image and audio must be publicly accessible URLs.
            # TODO: Add file upload to Runware or use a temp hosting service.
            generate_avatar_video(
                image_url=config.avatar_image_path,
                audio_url=panel.audio_path,
                output_path=clip_path,
                model=config.kling_model,
            )
            panel.clip_path = clip_path

        elif panel.screen_type == ScreenType.SLIDES:
            print(f"  [Panel {panel.panel_number:02d}] SLIDES → LLM + Remotion")

            # Step 3a: LLM maps visual direction to template + props
            result = map_visual_direction_to_props(panel.visual_direction)
            props_path = os.path.join(slides_dir, f"panel_{panel.panel_number:02d}.json")
            Path(props_path).write_text(json.dumps(result, indent=2))
            print(f"    Template: {result['template']}")

            # Step 3b: Remotion renders the slide
            render_slide(
                template=result["template"],
                props=result["props"],
                audio_path=panel.audio_path,
                output_path=clip_path,
                duration_seconds=panel.duration_seconds,
            )
            panel.clip_path = clip_path

    # 4. Stitch all clips
    print(f"\n[4/4] Stitching final video...")
    ordered_clips = [
        os.path.join(clips_dir, f"panel_{p.panel_number:02d}.mp4")
        for p in sorted(panels, key=lambda p: p.panel_number)
    ]
    final_path = os.path.join(config.output_dir, "final.mp4")
    stitch_videos(ordered_clips, final_path)

    # Write manifest
    elapsed = time.time() - start
    manifest = {
        "storyboard": config.storyboard_path,
        "panels": len(panels),
        "output": final_path,
        "elapsed_seconds": round(elapsed, 1),
        "config": {
            "voice": config.voice,
            "kling_model": config.kling_model,
        },
    }
    manifest_path = os.path.join(config.output_dir, "manifest.json")
    Path(manifest_path).write_text(json.dumps(manifest, indent=2))

    print(f"\n=== Done in {elapsed:.1f}s ===")
    print(f"Final video: {final_path}")
    return final_path
```

- [x] **Step 2: Commit**

```bash
git add backend/app/services/video/pipeline.py
git commit -m "feat(video): add pipeline orchestrator"
```

---

## Task 8: CLI Entry Point

**Files:**
- Create: `backend/app/services/video/__main__.py`

### Step-by-step:

- [x] **Step 1: Write the CLI**

```python
# backend/app/services/video/__main__.py
"""
Video Generation CLI.

Usage:
    cd backend && source venv/bin/activate
    PYTHONPATH=app/services python -m video.pipeline generate \
        --storyboard /path/to/storyboard.json \
        --avatar-image https://example.com/speaker.png \
        --output ./output/
"""
import argparse
import sys
from .models import PipelineConfig
from .pipeline import run_pipeline


def main():
    parser = argparse.ArgumentParser(description="Plotline Video Generation Pipeline")
    sub = parser.add_subparsers(dest="command")

    gen = sub.add_parser("generate", help="Generate video from storyboard")
    gen.add_argument("--storyboard", required=True, help="Path to storyboard JSON file")
    gen.add_argument("--avatar-image", required=True, help="URL of speaker portrait image")
    gen.add_argument("--output", required=True, help="Output directory")
    gen.add_argument("--voice", default="alloy", help="OpenAI TTS voice (default: alloy)")
    gen.add_argument("--kling-model", default="standard", choices=["standard", "pro"], help="Kling Avatar model tier")
    gen.add_argument("--parallel", type=int, default=4, help="Max concurrent API calls")
    gen.add_argument("--skip-tts", action="store_true", help="Reuse existing audio files")
    gen.add_argument("--skip-avatar", action="store_true", help="Reuse existing avatar clips")
    gen.add_argument("--only-panels", type=str, help="Comma-separated panel numbers to generate")
    gen.add_argument("--dry-run", action="store_true", help="Preview without API calls")

    args = parser.parse_args()

    if args.command != "generate":
        parser.print_help()
        sys.exit(1)

    only_panels = None
    if args.only_panels:
        only_panels = [int(x.strip()) for x in args.only_panels.split(",")]

    if args.dry_run:
        from .parser import parse_storyboard
        sb = parse_storyboard(args.storyboard)
        print(f"Storyboard: {sb.title}")
        print(f"Panels: {sb.total_panels}")
        print(f"Talking Head: {len(sb.talking_head_panels)}")
        print(f"Slides: {len(sb.slides_panels)}")
        if only_panels:
            print(f"Only panels: {only_panels}")
        print(f"\nNo API calls made (dry run).")
        return

    config = PipelineConfig(
        storyboard_path=args.storyboard,
        avatar_image_path=args.avatar_image,
        output_dir=args.output,
        voice=args.voice,
        kling_model=args.kling_model,
        max_parallel=args.parallel,
        skip_tts=args.skip_tts,
        skip_avatar=args.skip_avatar,
        only_panels=only_panels,
    )

    run_pipeline(config)


if __name__ == "__main__":
    main()
```

- [x] **Step 2: Test the CLI dry run**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m video generate \
    --storyboard app/services/video/tests/fixtures/sample_storyboard.json \
    --avatar-image https://example.com/speaker.png \
    --output /tmp/plotline-video-test \
    --dry-run
```

Expected output:
```
Storyboard: Video Storyboard
Panels: 3
Talking Head: 1
Slides: 2

No API calls made (dry run).
```

- [x] **Step 3: Commit**

```bash
git add backend/app/services/video/__main__.py
git commit -m "feat(video): add CLI entry point with dry-run support"
```

---

## Task 9: Complete Storyboard Fixture (All 15 Panels)

**Files:**
- Modify: `backend/app/services/video/tests/fixtures/sample_storyboard.json`

### Step-by-step:

- [x] **Step 1: Expand the fixture with all 15 panels from the PDF**

Update `sample_storyboard.json` to include all 15 panels. The full data comes from the storyboard PDF. Each panel needs: `panel_number`, `screen_type` ("talking_head" or "slides"), `duration_seconds`, `voiceover_script`, and `visual_direction` (array of strings).

Panels 1-3 already exist. Add panels 4-15:

| # | Type | Duration | Summary |
|---|------|----------|---------|
| 4 | talking_head | 23.5 | Male mentors can't teach salary negotiation nuances |
| 5 | slides | 20.5 | Collaborative framing vs direct approach comparison |
| 6 | slides | 23.0 | Timeline: career decisions no male mentor has navigated |
| 7 | talking_head | 19.5 | Limitation of female networks — can't change the game |
| 8 | slides | 20.5 | Org chart showing decision-making authority |
| 9 | slides | 17.0 | Three structural changes requiring authority |
| 10 | talking_head | 18.5 | Male leaders get allyship wrong — it's not risky |
| 11 | slides | 17.0 | Three strategic ally actions |
| 12 | slides | 16.5 | Timeline: ally initiative lifecycle |
| 13 | talking_head | 21.0 | Female networks + male allies = multiplied impact |
| 14 | slides | 19.5 | Impact comparison: individual vs dual-track |
| 15 | slides | 27.0 | Three-column implementation framework by role |

Copy the full voiceover scripts and visual directions from the PDF into each panel's JSON.

- [x] **Step 2: Verify the fixture parses correctly**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -c "
from video.parser import parse_storyboard
sb = parse_storyboard('app/services/video/tests/fixtures/sample_storyboard.json')
print(f'Panels: {sb.total_panels}')
print(f'Talking Head: {len(sb.talking_head_panels)}')
print(f'Slides: {len(sb.slides_panels)}')
total_dur = sum(p.duration_seconds for p in sb.panels)
print(f'Total duration: {total_dur:.1f}s ({total_dur/60:.1f}m)')
"
```

Expected:
```
Panels: 15
Talking Head: 7
Slides: 8
Total duration: ~300s (5.0m)
```

- [x] **Step 3: Commit**

```bash
git add backend/app/services/video/tests/fixtures/sample_storyboard.json
git commit -m "feat(video): complete 15-panel storyboard fixture from PDF"
```

**Deviation from plan:** The source PDF (`storyboard_v4.docx.pdf`, Apr 10) is newer than this plan (Apr 8) and differs from the plan's Task 9 assumptions. Actual fixture contains 14 panels numbered 1-6 and 9-16 (panels 7 and 8 dropped in the v4 revision), 5 talking_head + 9 slides, total duration 278.5s. Panels 3 and 5 are labeled "Stock video" in the source but map to screen_type=slides. Test counts in test_parser.py updated accordingly.

---

## Task 10: End-to-End Smoke Test (TTS + Slides Only)

This task validates the pipeline works end-to-end for the slides track (no Runware API key needed).

**Files:**
- No new files. Uses existing code + fixture.

### Step-by-step:

- [x] **Step 1: Generate TTS for one slides panel**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -c "
from video.tts import generate_audio
generate_audio(
    text='Only 28% of senior leadership roles in tech are held by women.',
    output_path='/tmp/plotline-video-test/audio/panel_02.mp3',
)
print('TTS audio generated successfully')
"
```

Expected: creates `/tmp/plotline-video-test/audio/panel_02.mp3`. Play it to verify quality.

- [x] **Step 2: Test LLM slide mapping for one panel**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -c "
from video.slides import map_visual_direction_to_props
import json

result = map_visual_direction_to_props([
    'Pyramid diagram showing leadership levels with percentages: Entry level 45% women, Mid-level 32% women, Senior level 28% women, C-suite 22% women',
    'Each level shows fewer female icons, emphasizing increasing isolation',
    'Arrow pointing upward with Increasing Isolation label',
    'Clean data visualization with professional color scheme',
])
print(json.dumps(result, indent=2))
"
```

Expected: JSON output with `template: "PyramidChart"` and populated `levels` array.

- [x] **Step 3: Test Remotion render for one slide**

```bash
cd remotion
npx remotion render src/index.ts PyramidChart \
  --props='{"title":"Women in Tech Leadership","levels":[{"label":"Entry Level","percentage":45},{"label":"Mid-Level","percentage":32},{"label":"Senior Level","percentage":28},{"label":"C-Suite","percentage":22}],"annotation":"Increasing Isolation","durationInSeconds":17.5}' \
  --output=/tmp/plotline-video-test/clips/panel_02.mp4
```

Expected: renders a 17.5s MP4. Open it to verify the pyramid looks correct.

- [x] **Step 4: Run full pipeline for slides-only panels**

```bash
cd backend && source venv/bin/activate
PYTHONPATH=app/services python -m video generate \
    --storyboard app/services/video/tests/fixtures/sample_storyboard.json \
    --avatar-image https://placeholder.com/speaker.png \
    --output /tmp/plotline-video-test \
    --skip-avatar \
    --only-panels 2,3
```

This generates TTS + LLM mapping + Remotion render + FFmpeg stitch for just 2 slides panels. Verify:
- `/tmp/plotline-video-test/audio/panel_02.mp3` and `panel_03.mp3` exist
- `/tmp/plotline-video-test/clips/panel_02.mp4` and `panel_03.mp4` exist
- `/tmp/plotline-video-test/final.mp4` exists and plays both slides in sequence

- [x] **Step 5: Commit any fixes discovered during smoke test**

```bash
git add -A
git commit -m "fix(video): fixes from end-to-end smoke test"
```

**Smoke test discovery (committed in d879ba2):** Remotion `<Audio>` rejects both absolute filesystem paths (interpreted as URLs relative to the webpack bundle root → 404) and `file://` URLs ("Can only download http/https"). Fix: stage the audio inside `remotion/public/` under a unique name derived from the output path, reference via `staticFile(audioSrc)` in `SlideWrapper.tsx`, and delete the staged copy in a `finally` block so `public/` stays empty between renders. `remotion/public/` is now gitignored. Verified: panels 2,3 full pipeline runs clean in 52.5s, produces a 38.1s `final.mp4` with video + audio streams.

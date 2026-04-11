import os
import json
import shutil
import subprocess
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

VALID_TEMPLATES = ["PyramidChart", "SplitComparison", "Timeline", "ThreeColumn", "DataCard"]
VALID_ANIMATIONS = {"fade_in", "stagger_fade_in", "slide_up"}


# =============================================================================
# Element extraction — derive per-template element IDs + descriptions from
# an LLM-generated props dict, so we can ask the alignment LLM to map each
# element to a word timestamp.
# =============================================================================

def extract_elements(template: str, props: dict) -> list[dict]:
    """Build a list of ``{id, description}`` pairs for the animatable
    elements in a slide. The IDs must match what each Remotion component
    expects from its ``elementTimings`` prop:

        PyramidChart  -> level_0..level_N, annotation
        ThreeColumn   -> column_0..column_2
        SplitComparison -> left, right
        Timeline      -> event_0..event_N
        DataCard      -> stat_0..stat_N, bullet_0..bullet_N

    Descriptions are short human-readable strings the alignment LLM can
    match against the voiceover transcript ("Entry Level: 49%",
    "Women in Leadership — Give one person something specific").
    """
    elements: list[dict] = []

    if template == "PyramidChart":
        for i, level in enumerate(props.get("levels") or []):
            label = str(level.get("label", f"Level {i}")).strip()
            pct = level.get("percentage", "")
            elements.append({
                "id": f"level_{i}",
                "description": f"{label}: {pct}%" if pct != "" else label,
            })
        if props.get("annotation"):
            elements.append({
                "id": "annotation",
                "description": str(props["annotation"]).strip(),
            })

    elif template == "ThreeColumn":
        for i, col in enumerate((props.get("columns") or [])[:3]):
            header = str(col.get("header", f"Column {i}")).strip()
            items = col.get("items") or []
            items_joined = "; ".join(str(it).strip() for it in items)
            elements.append({
                "id": f"column_{i}",
                "description": (
                    f"{header} — {items_joined}" if items_joined else header
                ),
            })

    elif template == "SplitComparison":
        left = props.get("left") or {}
        right = props.get("right") or {}
        if left:
            elements.append({
                "id": "left",
                "description": (
                    f"{left.get('label', '')}: {left.get('description', '')}"
                    + (f" ({left['metric']})" if left.get("metric") else "")
                ).strip(": ").strip(),
            })
        if right:
            elements.append({
                "id": "right",
                "description": (
                    f"{right.get('label', '')}: {right.get('description', '')}"
                    + (f" ({right['metric']})" if right.get("metric") else "")
                ).strip(": ").strip(),
            })

    elif template == "Timeline":
        for i, event in enumerate(props.get("events") or []):
            label = str(event.get("label", f"Event {i}")).strip()
            desc = str(event.get("description", "")).strip()
            elements.append({
                "id": f"event_{i}",
                "description": f"{label}: {desc}" if desc else label,
            })

    elif template == "DataCard":
        for i, stat in enumerate(props.get("stats") or []):
            label = str(stat.get("label", "")).strip()
            value = str(stat.get("value", "")).strip()
            elements.append({
                "id": f"stat_{i}",
                "description": f"{label}: {value}" if label else value,
            })
        for i, bullet in enumerate(props.get("bullets") or []):
            elements.append({
                "id": f"bullet_{i}",
                "description": str(bullet).strip(),
            })

    return elements


# =============================================================================
# Alignment — LLM reads the voiceover + word timestamps and returns
# {element_id: start_seconds} mapping so each Remotion component knows when
# to fade each element in.
# =============================================================================

_ALIGN_SYSTEM_PROMPT = """\
You assign visual elements on a slide to the moment in a narration
audio when each element's concept is first mentioned.

You will receive:
  1. The voiceover transcript with per-word timestamps.
  2. A list of visual elements with short descriptions.
  3. The total duration of the audio in seconds.

Return a JSON object mapping each element_id to a start_seconds value
— the timestamp when the narration first mentions that element's key
concept. The element will fade in at that moment so the viewer sees
it appear when they hear about it.

RULES:
- Return start_seconds as a non-negative number ≤ the total duration.
- Space elements apart — if two elements would land on the same word,
  nudge the later one a bit. Elements should feel sequential, not
  all piled on one word.
- If you cannot find a clear mention of an element in the transcript,
  estimate based on proportional position (e.g. element 3 of 5 → 60%
  of the way through).
- Lead the visual by ~0.0-0.2 seconds relative to the word — viewers
  read faster than they hear, so matching the exact word start is
  usually fine or slightly late.
- Return ONLY a JSON object, no markdown fences, no explanation.
"""


def align_elements_to_audio(
    voiceover_script: str,
    word_timestamps: list[dict],
    elements: list[dict],
    total_duration: float,
    client: Optional[OpenAI] = None,
) -> dict:
    """Use GPT-4o to map each visual element to a word-timestamped moment.

    Args:
        voiceover_script: The original voiceover text (redundant with
            word_timestamps but gives the LLM cleaner reading).
        word_timestamps: List from transcribe_with_word_timestamps.
        elements: List from extract_elements.
        total_duration: Total audio length in seconds.
        client: Optional OpenAI client for testing.

    Returns:
        Dict mapping element_id → start_seconds (float). On any error
        (invalid JSON, missing IDs, out-of-range values) we fall back
        to evenly-spaced timings covering the first 60% of the clip.
    """
    if not elements:
        return {}

    # Build a compact transcript string for the LLM to read
    transcript_lines = [
        f"[{wt['start']:.2f}s] {wt['word']}" for wt in word_timestamps
    ]
    transcript_block = "\n".join(transcript_lines)

    element_lines = [
        f"- {e['id']}: {e['description']}" for e in elements
    ]
    element_block = "\n".join(element_lines)

    user_prompt = (
        f"Total audio duration: {total_duration:.2f} seconds\n\n"
        f"Voiceover script:\n{voiceover_script}\n\n"
        f"Word-level transcript:\n{transcript_block}\n\n"
        f"Visual elements:\n{element_block}\n\n"
        f"Return the JSON object mapping element IDs to start_seconds."
    )

    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _ALIGN_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=500,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise ValueError("LLM did not return a dict")
    except Exception as e:
        print(f"  [Align] LLM alignment failed ({e}); falling back to even spacing")
        return _fallback_even_spacing(elements, total_duration)

    # Clamp + validate: every element_id present, numeric values in [0, duration]
    result: dict = {}
    for el in elements:
        eid = el["id"]
        val = parsed.get(eid)
        if isinstance(val, (int, float)) and 0 <= val <= total_duration:
            result[eid] = float(val)
        else:
            # Missing or invalid — fall back to proportional position
            idx = [e["id"] for e in elements].index(eid)
            result[eid] = min(
                (idx / max(1, len(elements))) * total_duration * 0.6,
                total_duration - 1.0,
            )
    return result


def _fallback_even_spacing(
    elements: list[dict],
    total_duration: float,
) -> dict:
    """Spread elements evenly across the first 60% of the clip so they
    all appear before the voiceover ends, without piling them at t=0.
    Used when the alignment LLM fails or returns invalid data.
    """
    n = len(elements)
    if n == 0:
        return {}
    window = total_duration * 0.6
    return {
        el["id"]: (i / max(1, n)) * window
        for i, el in enumerate(elements)
    }

# Path to the system prompt — 5 .parent calls: video → services → app → backend → repo root
PROMPT_PATH = Path(__file__).parent.parent.parent.parent.parent / "prompts" / "SLIDE_GENERATOR_PROMPT.md"

# Path to the remotion project
REMOTION_DIR = Path(__file__).parent.parent.parent.parent.parent / "remotion"


_CACHED_SYSTEM_PROMPT: Optional[str] = None


def _load_system_prompt() -> str:
    global _CACHED_SYSTEM_PROMPT
    if _CACHED_SYSTEM_PROMPT is None:
        _CACHED_SYSTEM_PROMPT = PROMPT_PATH.read_text()
    return _CACHED_SYSTEM_PROMPT


def call_llm(user_prompt: str, client: Optional[OpenAI] = None) -> str:
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
    client: Optional[OpenAI] = None,
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

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        print(f"  [Slides] LLM returned invalid JSON, falling back to DataCard")
        return {
            "template": "DataCard",
            "props": {"title": "Content", "bullets": visual_direction},
            "animation": "fade_in",
        }

    # Validate template
    if result.get("template") not in VALID_TEMPLATES:
        print(f"  [Slides] Unknown template '{result.get('template')}', falling back to DataCard")
        result["template"] = "DataCard"
        if "bullets" not in result.get("props", {}):
            result["props"] = {
                "title": result.get("props", {}).get("title", "Content"),
                "bullets": visual_direction,
            }

    # Validate animation field
    if result.get("animation") not in VALID_ANIMATIONS:
        result["animation"] = "fade_in"

    return result


def render_slide(
    template: str,
    props: dict,
    audio_path: str,
    output_path: str,
    duration_seconds: float,
    element_timings: Optional[dict] = None,
) -> str:
    """Render a Remotion slide to MP4.

    Args:
        template: Remotion component name (e.g. "PyramidChart").
        props: Props dict for the component.
        audio_path: Path to the voiceover audio file.
        output_path: Where to save the rendered .mp4.
        duration_seconds: Duration of the panel.
        element_timings: Optional dict mapping element IDs (e.g.
            "level_0", "column_2") to start seconds for per-element
            fade-in. See extract_elements + align_elements_to_audio.
            When None, components fall back to evenly-staggered
            appearance in the first few seconds.

    Returns:
        The output_path.
    """
    if duration_seconds <= 0:
        raise ValueError(f"duration_seconds must be positive, got {duration_seconds}")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Remotion's <Audio> component only accepts URLs served by its webpack
    # bundle (staticFile()) or absolute http(s) URLs — absolute filesystem
    # paths and file:// URLs are rejected. Stage the audio inside the
    # Remotion project's public/ directory under a unique filename derived
    # from the output path, then reference it by filename so that
    # staticFile() resolves it at render time.
    public_dir = REMOTION_DIR / "public"
    public_dir.mkdir(parents=True, exist_ok=True)
    staged_audio_name = f"{Path(output_path).stem}{Path(audio_path).suffix}"
    staged_audio_path = public_dir / staged_audio_name
    shutil.copyfile(audio_path, staged_audio_path)

    try:
        render_props = {
            **props,
            "audioSrc": staged_audio_name,
            "durationInSeconds": duration_seconds,
        }
        if element_timings:
            render_props["elementTimings"] = element_timings

        props_json = json.dumps(render_props)
        # 25 fps matches remotion/src/Root.tsx and the stitcher's
        # canonical normalize format. Changing this alone will NOT
        # change Remotion's composition fps — update Root.tsx too.
        fps = 25
        total_frames = max(1, int(duration_seconds * fps))

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
    finally:
        # Clean up the staged audio so public/ doesn't accumulate old files
        # that would bloat subsequent webpack bundles.
        staged_audio_path.unlink(missing_ok=True)

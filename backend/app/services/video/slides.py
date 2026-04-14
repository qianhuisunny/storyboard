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
        # Optional late-fade reveal element — see ThreeColumn.tsx's
        # ``reveal`` prop. Must be the LAST element appended so that
        # ``_enforce_max_empty_gap`` (which sorts by LLM-assigned start
        # time then renumbers) keeps it in the tail position.
        reveal = props.get("reveal") or {}
        if isinstance(reveal, dict) and reveal.get("label"):
            elements.append({
                "id": "reveal",
                "description": f"Payoff reveal: {str(reveal['label']).strip()}",
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
        # Optional late-fade reveal element — see SplitComparison.tsx's
        # ``reveal`` prop. Appended last for the same reason as above.
        reveal = props.get("reveal") or {}
        if isinstance(reveal, dict) and reveal.get("label"):
            elements.append({
                "id": "reveal",
                "description": f"Payoff reveal: {str(reveal['label']).strip()}",
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

    # Redistribute so both ends of the clip have content happening.
    # See _distribute_elements_across_clip for the full rules: opening
    # ≤ 2s, tail ≥ (duration - 3s), middle elements rescaled
    # proportionally, relative ordering preserved.
    return _distribute_elements_across_clip(result, total_duration)


# ---------------------------------------------------------------------------
# Distribution rules for slide reveal timings.
#
# The predecessor of this block (`_enforce_max_empty_gap`) only guarded
# the *opening* of the clip — it pinned the first element at 0s and
# every subsequent element at i * 2s, regardless of voiceover length.
# That fixed the "Panel 10 stared blank for 28s" bug at the start, but
# it *created* a much bigger bug at the other end: every slide was now
# front-loaded into the first 2N seconds and stayed static for 60-90%
# of its runtime. Panel 13 at 82% tail-static, Panel 9 at 87%, Panel
# 10 itself at 93% after the "fix".
#
# The new rule guards BOTH ends:
#   - OPENING_BLANK_MAX_SEC: first element must appear by this time
#   - TAIL_BLANK_MAX_SEC: last element must appear by (duration - this)
#   - MIN_ELEMENT_GAP_SEC: adjacent reveals never collide (>= fade time)
#   - The LLM's relative ordering and proportional spacing are preserved
#     — we only rescale, we don't throw its intent away.
#
# These constants are named module-level values because they're
# product decisions, not implementation details. Tweaking them affects
# every slide in every video and should be done deliberately.
# ---------------------------------------------------------------------------
OPENING_BLANK_MAX_SEC = 2.0
TAIL_BLANK_MAX_SEC = 3.0
MIN_ELEMENT_GAP_SEC = 0.6  # matches SlideWrapper's FADE_FRAMES (15 / 25fps)


def _fallback_even_spacing(
    elements: list[dict],
    total_duration: float,
) -> dict:
    """Even distribution across the whole clip when the alignment LLM
    fails or returns garbage. Without the LLM's help we can't be smart
    about narrative rhythm, but we can at least honour the same opening
    and tail guarantees as the main path in
    ``_distribute_elements_across_clip``.
    """
    n = len(elements)
    if n == 0:
        return {}
    if n == 1:
        return {elements[0]["id"]: 0.0}

    opening = 0.0
    tail = max(total_duration - TAIL_BLANK_MAX_SEC, opening + 1.0)
    tail = min(tail, total_duration - 0.5)
    span = tail - opening
    step = span / max(n - 1, 1)
    return {
        el["id"]: round(opening + i * step, 3)
        for i, el in enumerate(elements)
    }


def _distribute_elements_across_clip(
    timings: dict,
    total_duration: float,
) -> dict:
    """Rewrite element start timestamps so the clip has content
    revealing throughout the voiceover — no long blank opening, no
    long blank tail, LLM's relative ordering preserved.

    Guarantees:

    1. Relative ordering of elements is kept intact — we sort by the
       LLM's proposed start time and never shuffle.
    2. First element appears by ``OPENING_BLANK_MAX_SEC`` at the
       latest (so the slide never opens on a bare title for more
       than ~2s).
    3. Last element appears by ``total_duration - TAIL_BLANK_MAX_SEC``
       at the earliest (so the final reveal lands near the end, not
       in the first 10% like the predecessor rule used to force).
    4. Middle elements are rescaled proportionally between the
       first and last anchors, preserving whatever rhythm the LLM
       intended.
    5. Adjacent elements stay at least ``MIN_ELEMENT_GAP_SEC`` apart
       so their 0.6s fades don't pile up visually.

    Empty input returns empty. A single-element slide returns
    ``{id: 0.0}`` — there is no second reveal to space against, so
    it should appear immediately.

    This replaces the pre-2026-04-11 ``_enforce_max_empty_gap`` rule.
    """
    if not timings:
        return timings

    items = sorted(timings.items(), key=lambda kv: kv[1])
    n = len(items)

    if n == 1:
        return {items[0][0]: 0.0}

    llm_first = items[0][1]
    llm_last = items[-1][1]

    # Anchor targets: pull opening forward if too late, push tail
    # back if too early. Leave them alone otherwise.
    opening = min(llm_first, OPENING_BLANK_MAX_SEC)
    opening = max(opening, 0.0)
    tail = max(llm_last, total_duration - TAIL_BLANK_MAX_SEC)
    tail = min(tail, total_duration - 0.5)

    # If the two anchors collapsed (short clip, or all LLM timings
    # stacked on one value), fall back to even spacing between them.
    if tail <= opening:
        span = max(total_duration - 1.0, 0.0)
        step = span / max(n - 1, 1)
        return {
            eid: round(min(i * step, span), 3)
            for i, (eid, _) in enumerate(items)
        }

    llm_span = llm_last - llm_first
    new_span = tail - opening

    result: dict = {}
    for i, (element_id, llm_t) in enumerate(items):
        if i == 0:
            new_t = opening
        elif i == n - 1:
            new_t = tail
        elif llm_span > 0:
            # Preserve the LLM's proportional spacing between anchors.
            proportion = (llm_t - llm_first) / llm_span
            new_t = opening + proportion * new_span
        else:
            # All LLM timings collapsed to one value — even spacing.
            new_t = opening + (i / (n - 1)) * new_span
        result[element_id] = round(new_t, 3)

    # Enforce minimum gap so fades don't visually overlap. Walk in
    # order; if a neighbour pair is too close, nudge the later one
    # forward — but never past the tail anchor.
    ordered = sorted(result.items(), key=lambda kv: kv[1])
    for i in range(1, len(ordered)):
        prev_t = ordered[i - 1][1]
        cur_id, cur_t = ordered[i]
        if cur_t - prev_t < MIN_ELEMENT_GAP_SEC:
            new_t = min(prev_t + MIN_ELEMENT_GAP_SEC, tail)
            ordered[i] = (cur_id, new_t)
            result[cur_id] = round(new_t, 3)

    return result

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

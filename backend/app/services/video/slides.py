import os
import json
import subprocess
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

VALID_TEMPLATES = ["PyramidChart", "SplitComparison", "Timeline", "ThreeColumn", "DataCard"]

# Path to the system prompt — 5 .parent calls: video → services → app → backend → repo root
PROMPT_PATH = Path(__file__).parent.parent.parent.parent.parent / "prompts" / "SLIDE_GENERATOR_PROMPT.md"

# Path to the remotion project
REMOTION_DIR = Path(__file__).parent.parent.parent.parent.parent / "remotion"


def _load_system_prompt() -> str:
    return PROMPT_PATH.read_text()


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

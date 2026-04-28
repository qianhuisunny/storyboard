import json
from pathlib import Path

from .models import CanvasMode, Composition, Panel, ScreenType, Storyboard


def parse_storyboard(path: str) -> Storyboard:
    """Parse a composition-first storyboard JSON file into a Storyboard."""
    raw = json.loads(Path(path).read_text())
    panels = []
    for p in raw["panels"]:
        panels.append(
            Panel(
                panel_number=p["panel_number"],
                screen_type=ScreenType(p["screen_type"]),
                composition=Composition(p["composition"]),
                duration_seconds=p["duration_seconds"],
                voiceover_script=p["voiceover_script"],
                overlay_elements=list(p.get("overlay_elements") or []),
                design_brief=list(p.get("design_brief") or []),
                canvas_mode=CanvasMode(p.get("canvas_mode", CanvasMode.NONE.value)),
                base_media_path=p.get("base_media_path"),
            )
        )
    return Storyboard(
        title=raw["title"],
        total_duration=raw["total_duration"],
        total_panels=raw["total_panels"],
        panels=panels,
    )

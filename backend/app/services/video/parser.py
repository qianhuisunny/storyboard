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
            stock_title=p.get("stock_title"),
            stock_subtitle=p.get("stock_subtitle"),
            keyframes=p.get("keyframes"),
        ))
    return Storyboard(
        title=raw["title"],
        total_duration=raw["total_duration"],
        total_panels=raw["total_panels"],
        panels=panels,
    )

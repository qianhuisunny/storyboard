"""
Storyboard Writer Agent - Adds visual assets to Director's screen outline.
Simplified pipeline: Director handles voiceover and duration, Writer adds visuals.
"""

from typing import Any

from .base import BaseAgent


# Placeholder images per screen type, served from frontend/public/placeholders/
PLACEHOLDER_IMAGES = {
    "screen_recording": "/placeholders/screen_recording.png",
    "slides": "/placeholders/slides_and_diagrams.png",
    "whiteboard": "/placeholders/whiteboard.png",
    "code_editor": "/placeholders/code_editor.png",
    "stock_footage": "/placeholders/stock_footage.png",
    "real_world": "/placeholders/real_world.png",
    "talking_head": "/placeholders/talking_head.png",
}


class StoryboardWriter(BaseAgent):
    """
    Adds visual assets to Director's screen outline.

    Input from Director (5 fields):
    - screen_number, narrative_role, screen_type, voiceover_text, duration

    Output (6 fields):
    - screen_number, narrative_role, screen_type, duration, voiceover_text, on_screen_visual
    """

    prompt_file = "storyboard_writer_prompt_2.md"

    def run(self, state: Any, **kwargs) -> list:
        """
        Process outline into production storyboard.

        Handles both:
        - Text-based outline (new): pass through as single-item list
        - Screen-list outline (legacy): add visual assets per screen

        Args:
            state: StoryboardState with screen_outline

        Returns:
            list of production screens or wrapped text
        """
        if not state.screen_outline:
            raise ValueError("StoryboardWriter requires screen_outline in state")

        # Text-based outline — wrap as single storyboard item for now
        if isinstance(state.screen_outline, str):
            return [{"type": "text_outline", "content": state.screen_outline}]

        # Legacy screen-list outline
        storyboard = []
        for screen in state.screen_outline:
            production_screen = self._process_screen(screen, state.story_brief)
            storyboard.append(production_screen)

        return storyboard

    def _process_screen(self, screen: dict, story_brief: dict) -> dict:
        """Process screen - pass through fields and add visual asset."""
        screen_type = screen.get("screen_type", "slides")
        voiceover = screen.get("voiceover_text", "")
        duration = screen.get("duration", 6.0)
        narrative_role = screen.get("narrative_role", "")

        # Get placeholder image based on screen type
        visual = PLACEHOLDER_IMAGES.get(screen_type, "/placeholders/slides_and_diagrams.png")

        return {
            "screen_number": screen.get("screen_number", 1),
            "narrative_role": narrative_role,
            "screen_type": screen_type,
            "duration": duration,
            "voiceover_text": voiceover,
            "on_screen_visual": visual
        }

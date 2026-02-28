"""
Storyboard Writer Agent - Adds visual assets to Director's screen outline.
Simplified pipeline: Director handles voiceover and duration, Writer adds visuals.
"""

from typing import Any

from .base import BaseAgent
from .image_researcher import ImageResearcher


class StoryboardWriter(BaseAgent):
    """
    Adds visual assets to Director's screen outline.

    Input from Director (4 fields):
    - screen_number, screen_type, voiceover_text, target_duration_sec

    Output (5 fields):
    - screen_number, screen_type, target_duration_sec, voiceover_text, on_screen_visual
    """

    prompt_file = "storyboard_writer_prompt_2.md"

    def __init__(self):
        super().__init__()
        self.image_researcher = ImageResearcher()

    def run(self, state: Any, **kwargs) -> list:
        """
        Add visual assets to Director's screen outline.

        Args:
            state: StoryboardState with screen_outline

        Returns:
            list of production screens with 5 fields each
        """
        if not state.screen_outline:
            raise ValueError("StoryboardWriter requires screen_outline in state")

        storyboard = []
        for screen in state.screen_outline:
            production_screen = self._process_screen(screen, state.story_brief)
            storyboard.append(production_screen)

        return storyboard

    def _process_screen(self, screen: dict, story_brief: dict) -> dict:
        """Process screen - only add visual asset."""
        screen_type = screen.get("screen_type", "slides/text overlay")
        voiceover = screen.get("voiceover_text", "")
        duration = screen.get("target_duration_sec", 6.0)

        # Get visual asset based on screen type
        visual = self._get_visual_asset(screen_type, voiceover)

        return {
            "screen_number": screen.get("screen_number", 1),
            "screen_type": screen_type,
            "target_duration_sec": duration,
            "voiceover_text": voiceover,
            "on_screen_visual": visual
        }

    def _get_visual_asset(self, screen_type: str, voiceover: str) -> str:
        """Get visual asset based on screen type."""
        screen_type_lower = screen_type.lower()

        # Placeholders - no API needed
        if screen_type_lower == "talking head":
            return "PLACEHOLDER: talking-head-presenter"
        if screen_type_lower == "screencast":
            return "PLACEHOLDER: product-demo-screen"
        if screen_type_lower == "cta":
            return "PLACEHOLDER: cta-template"

        # HTML generation for slides/whiteboard
        if screen_type_lower in ["slides/text overlay", "whiteboard"]:
            return self._generate_html_visual(voiceover, screen_type)

        # Stock video - use image researcher
        if screen_type_lower == "stock video":
            result = self.image_researcher.search(voiceover)
            return result.get("url", "PLACEHOLDER: stock-footage")

        return "PLACEHOLDER: generic"

    def _generate_html_visual(self, voiceover: str, screen_type: str) -> str:
        """Generate HTML visual from voiceover using Claude."""
        style = "whiteboard sketch" if screen_type.lower() == "whiteboard" else "clean slide"

        prompt = f"""Create a simple HTML visual (400x300px) for this content:
"{voiceover}"

Style: {style}
- Use inline CSS only
- Simple, clean design
- Max 3-4 key points or elements
- Return ONLY the HTML, no explanation

<html>"""

        # Call LLM (uses BaseAgent's call_llm)
        response = self.call_llm(prompt, max_tokens=1000)

        # Extract HTML
        if "</html>" in response:
            html = "<html>" + response.split("</html>")[0] + "</html>"
        else:
            html = "<html>" + response + "</html>"

        return f"HTML:{html}"

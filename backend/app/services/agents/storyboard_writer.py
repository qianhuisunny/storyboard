"""
Storyboard Writer Agent - Converts approved outline to production-ready storyboard.
Orchestrates Duration Calculator and Image Researcher sub-agents.
"""

import json
import re
from typing import Any, List

from .base import BaseAgent
from .duration_calculator import DurationCalculator
from .image_researcher import ImageResearcher


class StoryboardWriter(BaseAgent):
    """
    Execution specialist that creates production-ready storyboards.

    Takes approved screen outline and:
    - Calculates precise durations (via DurationCalculator)
    - Finds visual assets (via ImageResearcher)
    - Refines voiceover for natural narration
    - Transforms visual direction into array format
    - Adds detailed action notes

    Output: 7-field production storyboard screens
    """

    prompt_file = "storyboard_writer_prompt_2.md"

    def __init__(self):
        super().__init__()
        self.duration_calculator = DurationCalculator()
        self.image_researcher = ImageResearcher()

    def run(self, state: Any, **kwargs) -> list:
        """
        Convert approved outline to production-ready storyboard.

        Args:
            state: StoryboardState with screen_outline and story_brief

        Returns:
            list of production-ready screen objects with 7 fields each
        """
        if not state.screen_outline:
            raise ValueError("StoryboardWriter requires screen_outline in state")

        screens = []
        total_target_duration = self._parse_desired_length(
            state.story_brief.get("desired_length", "60") if state.story_brief else "60"
        )

        for screen in state.screen_outline:
            production_screen = self._process_screen(screen, state.story_brief)
            screens.append(production_screen)

        # Validate total duration
        validation = self.duration_calculator.validate_total_duration(
            screens,
            total_target_duration,
            tolerance=0.05  # 5% tolerance as per prompt
        )

        if not validation["is_valid"]:
            # Proportionally adjust durations
            screens = self._adjust_durations(screens, total_target_duration)

        return screens

    def _process_screen(self, screen: dict, story_brief: dict) -> dict:
        """Process a single screen into production format."""
        voiceover = screen.get("voiceover_text", "")
        screen_type = screen.get("screen_type", "slides/text overlay")
        visual_direction = screen.get("visual_direction", "")
        purpose = screen.get("purpose", "")
        notes = screen.get("notes", "")

        # Call Duration Calculator
        duration_result = self.duration_calculator.calculate(voiceover, screen_type)

        # Call Image Researcher
        image_result = self.image_researcher.find(screen_type, visual_direction, purpose)

        # Refine voiceover for natural narration
        refined_voiceover = self._refine_voiceover(voiceover)

        # Transform visual direction to array
        visual_array = self._break_into_visual_array(visual_direction, screen_type)

        # Synthesize action notes
        action_notes = self._synthesize_action_notes(purpose, notes, story_brief)

        return {
            "screen_number": screen.get("screen_number", 1),
            "screen_type": screen_type,
            "target_duration_sec": duration_result["target_duration_sec"],
            "voiceover_text": refined_voiceover,
            "visual_direction": visual_array,
            "on_screen_visual": image_result["asset_reference"],
            "action_notes": action_notes
        }

    def _refine_voiceover(self, voiceover: str) -> str:
        """Refine voiceover for natural narration."""
        text = voiceover

        # Spell out numbers for narrator
        # Common patterns: $500K, 30%, etc.
        text = re.sub(r'\$(\d+)K', lambda m: f"{self._number_to_words(int(m.group(1)))} thousand dollars", text)
        text = re.sub(r'\$(\d+)M', lambda m: f"{self._number_to_words(int(m.group(1)))} million dollars", text)
        text = re.sub(r'(\d+)%', lambda m: f"{self._number_to_words(int(m.group(1)))} percent", text)

        # Convert URLs to phonetic
        # e.g., "clearvu-iq.com" -> "clearvu dash i q dot com"
        text = re.sub(
            r'(\w+)-(\w+)\.(\w+)',
            lambda m: f"{m.group(1)} dash {m.group(2)} dot {m.group(3)}",
            text
        )

        return text

    def _number_to_words(self, n: int) -> str:
        """Convert number to words (simple version for common numbers)."""
        ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
                "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
                "seventeen", "eighteen", "nineteen"]
        tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

        if n < 20:
            return ones[n]
        elif n < 100:
            return tens[n // 10] + (" " + ones[n % 10] if n % 10 else "")
        elif n < 1000:
            return ones[n // 100] + " hundred" + (" " + self._number_to_words(n % 100) if n % 100 else "")
        else:
            return str(n)  # Fallback for larger numbers

    def _break_into_visual_array(self, visual_direction: str, screen_type: str) -> List[str]:
        """Transform single visual direction string into array of elements."""
        if not visual_direction:
            return ["No visual direction provided"]

        # Split on common delimiters
        elements = []

        # Try splitting on commas, "and", "with"
        parts = re.split(r',\s*|\s+and\s+|\s+with\s+', visual_direction)

        for part in parts:
            part = part.strip()
            if len(part) > 10:  # Only include substantial elements
                elements.append(part)

        # If we don't have enough elements, create them based on screen type
        if len(elements) < 3:
            elements = self._generate_visual_elements(visual_direction, screen_type)

        # Limit to 3-7 elements
        return elements[:7] if len(elements) > 7 else elements

    def _generate_visual_elements(self, visual_direction: str, screen_type: str) -> List[str]:
        """Generate visual elements based on screen type guidelines."""
        elements = []

        if screen_type.lower() == "stock video":
            elements = [
                f"Setting: {visual_direction[:50]}...",
                "People and actions visible in frame",
                "Key objects prominently shown",
                "Appropriate mood and atmosphere",
                "Realistic environment"
            ]
        elif screen_type.lower() == "screencast":
            elements = [
                f"UI screen: {visual_direction[:50]}...",
                "Key interface elements highlighted",
                "User interaction demonstrated",
                "Data/results visible"
            ]
        elif screen_type.lower() == "talking head":
            elements = [
                "Presenter visible on camera",
                "Professional background setting",
                "Good framing and composition",
                "Direct eye contact with camera",
                "Confident posture"
            ]
        elif "slide" in screen_type.lower() or "text" in screen_type.lower():
            elements = [
                f"Graphic: {visual_direction[:50]}...",
                "Key data points visible",
                "Clean visual hierarchy",
                "Brand-consistent styling"
            ]
        elif screen_type.lower() == "cta":
            elements = [
                "Main CTA text prominently displayed",
                "URL or contact info visible",
                "Action button/prompt clear",
                "Brand elements present"
            ]
        else:
            # Generic fallback
            elements = [visual_direction]

        return elements

    def _synthesize_action_notes(self, purpose: str, notes: str, story_brief: dict) -> str:
        """Synthesize action notes from purpose, notes, and constraints."""
        parts = []

        # Screen intent from purpose
        if purpose:
            parts.append(purpose.strip(".") + ".")

        # Execution guidance from notes
        if notes:
            parts.append(notes.strip(".") + ".")

        # Add relevant constraints from story_brief
        if story_brief:
            constraints = story_brief.get("constraints", [])
            relevant_constraints = [c for c in constraints if len(c) < 100][:2]
            if relevant_constraints:
                parts.append("Constraints: " + "; ".join(relevant_constraints))

            # Add tone guidance
            tone = story_brief.get("tone_and_style", "")
            if tone:
                parts.append(f"Tone: {tone}.")

        return " ".join(parts)

    def _parse_desired_length(self, desired_length: str) -> float:
        """Parse desired length string to seconds."""
        if isinstance(desired_length, (int, float)):
            return float(desired_length)

        # Handle ranges like "60-90 seconds"
        match = re.search(r'(\d+)', str(desired_length))
        if match:
            return float(match.group(1))

        return 60.0  # Default

    def _adjust_durations(self, screens: list, target: float) -> list:
        """Proportionally adjust screen durations to hit target."""
        current_total = sum(s.get("target_duration_sec", 0) for s in screens)

        if current_total == 0:
            return screens

        ratio = target / current_total

        for screen in screens:
            original = screen.get("target_duration_sec", 6)
            adjusted = original * ratio

            # Apply constraints
            adjusted = max(4.0, min(12.0, adjusted))

            # Round to 0.5
            screen["target_duration_sec"] = round(adjusted * 2) / 2

        return screens

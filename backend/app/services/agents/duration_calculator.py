"""
Duration Calculator Sub-Agent - Calculates precise screen durations.
Called by StoryboardWriter for each screen.
"""

import math
from typing import Optional
from dataclasses import dataclass


@dataclass
class DurationResult:
    """Result of duration calculation."""
    target_duration_sec: float
    word_count: int
    base_duration: float
    complexity_buffer: float
    calculation_note: str
    exceeds_max: bool = False
    recommendation: Optional[str] = None


class DurationCalculator:
    """
    Calculates target duration for storyboard screens.

    Uses:
    - Word count at 2.2 words per second (130 wpm)
    - Complexity buffer based on screen type
    - Min/max constraints
    """

    # Speaking rate: 2.2 words per second (130 words per minute)
    WORDS_PER_SECOND = 2.2

    # Complexity buffers by screen type
    COMPLEXITY_BUFFERS = {
        "stock video": 0.5,
        "screencast": 1.0,       # Viewers need time to see UI
        "talking head": 0.5,
        "slides/text overlay": 0.8,  # Viewers need time to read
        "CTA": 1.0,              # Pause for action
    }

    # Duration constraints
    MIN_DURATION = 4.0
    MAX_DURATION = 12.0

    def calculate(
        self,
        voiceover_text: str,
        screen_type: str,
        max_duration: Optional[float] = None
    ) -> dict:
        """
        Calculate target duration for a screen.

        Args:
            voiceover_text: The voiceover script
            screen_type: Type of screen (stock video, screencast, etc.)
            max_duration: Optional override for max duration

        Returns:
            dict with target_duration_sec and calculation details
        """
        max_dur = max_duration or self.MAX_DURATION

        # Step 1: Count words
        word_count = len(voiceover_text.split())

        # Step 2: Calculate base duration
        base_duration = word_count / self.WORDS_PER_SECOND

        # Step 3: Get complexity buffer
        complexity_buffer = self.COMPLEXITY_BUFFERS.get(screen_type.lower(), 0.5)

        # Step 4: Calculate total
        total = base_duration + complexity_buffer

        # Step 5: Round to nearest 0.5 seconds
        rounded = round(total * 2) / 2

        # Step 6: Apply constraints
        exceeds_max = rounded > max_dur
        recommendation = None

        if rounded < self.MIN_DURATION:
            final_duration = self.MIN_DURATION
            note = f"{word_count} words ÷ {self.WORDS_PER_SECOND} wps = {base_duration:.2f}s + {complexity_buffer}s buffer = {total:.2f}s, rounded to {rounded}s, but applied {self.MIN_DURATION}s minimum"
        elif exceeds_max:
            final_duration = rounded  # Return actual calculated value
            note = f"{word_count} words ÷ {self.WORDS_PER_SECOND} wps = {base_duration:.2f}s + {complexity_buffer}s buffer = {total:.2f}s, rounded to {rounded}s (EXCEEDS MAX of {max_dur}s)"
            # Suggest split
            half_words = word_count // 2
            recommendation = f"SPLIT screen into two: approximately {half_words} words each for ~{rounded/2:.1f}s per screen"
        else:
            final_duration = rounded
            note = f"{word_count} words ÷ {self.WORDS_PER_SECOND} wps = {base_duration:.2f}s + {complexity_buffer}s buffer = {total:.2f}s, rounded to {rounded}s"

        return {
            "target_duration_sec": final_duration,
            "word_count": word_count,
            "base_duration": round(base_duration, 2),
            "complexity_buffer": complexity_buffer,
            "calculation_note": note,
            "exceeds_max": exceeds_max,
            "recommendation": recommendation
        }

    def validate_total_duration(
        self,
        screens: list,
        target_duration: float,
        tolerance: float = 0.1
    ) -> dict:
        """
        Validate that total screen duration matches target.

        Args:
            screens: List of screens with target_duration_sec
            target_duration: Desired total duration in seconds
            tolerance: Acceptable deviation (0.1 = 10%)

        Returns:
            dict with validation result and suggestions
        """
        total = sum(s.get("target_duration_sec", 0) for s in screens)
        deviation = abs(total - target_duration) / target_duration

        is_valid = deviation <= tolerance

        return {
            "is_valid": is_valid,
            "total_duration": total,
            "target_duration": target_duration,
            "deviation_percent": round(deviation * 100, 1),
            "tolerance_percent": round(tolerance * 100, 1),
            "suggestion": None if is_valid else self._get_adjustment_suggestion(total, target_duration)
        }

    def _get_adjustment_suggestion(self, total: float, target: float) -> str:
        """Generate suggestion for duration adjustment."""
        diff = total - target

        if diff > 0:
            return f"Video is {diff:.1f}s too long. Consider: tightening voiceovers, merging screens, or removing non-essential screens."
        else:
            return f"Video is {abs(diff):.1f}s too short. Consider: adding detail to voiceovers, splitting complex screens, or adding transition screens."

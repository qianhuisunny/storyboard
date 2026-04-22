"""
Duration Calculator Sub-Agent - Calculates precise screen durations.
Called by StoryboardWriter for each screen.
"""

import math
import re
from typing import Optional
from dataclasses import dataclass


@dataclass
class DurationResult:
    """Result of duration calculation."""
    duration: float
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
        "screen_recording": 1.0,  # Viewers need time to see UI
        "code_editor": 1.0,       # Viewers need time to read code
        "slides": 0.8,            # Viewers need time to read
        "whiteboard_animation": 0.8,  # Viewers need time to follow drawing/animation
        "whiteboard": 0.8,        # Legacy fallback
        "stock_footage": 0.5,
        "real_world": 0.5,
        "talking_head": 0.5,
        "talking_head_with_split_screens": 0.5,
        "talking_head_left_with_notes": 0.5,  # gold set variant
    }

    # Duration constraints
    MIN_DURATION = 4.0
    MAX_DURATION = 12.0
    SENTENCE_BOUNDARY_RE = re.compile(r"(?<=[.!?])\s+")
    CLAUSE_BOUNDARY_RE = re.compile(r"(?<=[,;:])\s+")

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
            dict with duration and calculation details
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
            "duration": final_duration,
            "word_count": word_count,
            "base_duration": round(base_duration, 2),
            "complexity_buffer": complexity_buffer,
            "calculation_note": note,
            "exceeds_max": exceeds_max,
            "recommendation": recommendation
        }

    def split_voiceover(
        self,
        voiceover_text: str,
        screen_type: str,
        max_duration: Optional[float] = None,
    ) -> list[dict]:
        """
        Split an overlong voiceover into chunks that individually fit the
        per-screen duration constraint. Returned durations always remain tied
        to the chunk text, never an adjusted placeholder number.
        """
        text = (voiceover_text or "").strip()
        if not text:
            return []

        max_dur = max_duration or self.MAX_DURATION
        initial = self.calculate(text, screen_type, max_dur)
        if not initial["exceeds_max"]:
            return [{**initial, "voiceover_text": text}]

        units = self._split_into_units(text)
        max_words = self._max_words_for_duration(screen_type, max_dur)
        normalized_units = []
        for unit in units:
            normalized_units.extend(self._split_unit_to_word_chunks(unit, max_words))

        chunks: list[str] = []
        current_units: list[str] = []
        for unit in normalized_units:
            candidate = " ".join(current_units + [unit]).strip()
            if current_units and self.calculate(candidate, screen_type, max_dur)["exceeds_max"]:
                chunks.append(" ".join(current_units).strip())
                current_units = [unit]
            else:
                current_units.append(unit)

        if current_units:
            chunks.append(" ".join(current_units).strip())

        results = []
        for chunk in chunks:
            calc = self.calculate(chunk, screen_type, max_dur)
            results.append({**calc, "voiceover_text": chunk})
        return results

    def validate_total_duration(
        self,
        screens: list,
        target_duration: float,
        tolerance: float = 0.1
    ) -> dict:
        """
        Validate that total screen duration matches target.

        Args:
            screens: List of screens with duration
            target_duration: Desired total duration in seconds
            tolerance: Acceptable deviation (0.1 = 10%)

        Returns:
            dict with validation result and suggestions
        """
        total = sum(s.get("duration", 0) for s in screens)
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

    def compute_word_budget(self, target_seconds: float, screen_type: str) -> int:
        """Inverse of calculate(): given a target section duration, compute
        how many voiceover words will produce that duration."""
        buffer = self.COMPLEXITY_BUFFERS.get(screen_type.lower(), 0.5)
        available_seconds = max(target_seconds - buffer, 0)
        return max(1, int(available_seconds * self.WORDS_PER_SECOND))

    def validate_section_duration(
        self,
        screens: list,
        target_seconds: float,
        tolerance: float = 0.20,
    ) -> dict:
        """Validate that a single section's total screen duration matches its target."""
        total = sum(s.get("duration", 0) for s in screens)
        if target_seconds <= 0:
            return {"is_valid": True, "total_duration": total, "target_seconds": target_seconds,
                    "deviation_percent": 0.0, "tolerance_percent": round(tolerance * 100, 1),
                    "direction": "on_target"}
        deviation = abs(total - target_seconds) / target_seconds
        return {
            "is_valid": deviation <= tolerance,
            "total_duration": round(total, 1),
            "target_seconds": target_seconds,
            "deviation_percent": round(deviation * 100, 1),
            "tolerance_percent": round(tolerance * 100, 1),
            "direction": "over" if total > target_seconds else "under",
        }

    def _get_adjustment_suggestion(self, total: float, target: float) -> str:
        """Generate suggestion for duration adjustment."""
        diff = total - target

        if diff > 0:
            return f"Video is {diff:.1f}s too long. Consider: tightening voiceovers, merging screens, or removing non-essential screens."
        else:
            return f"Video is {abs(diff):.1f}s too short. Consider: adding detail to voiceovers, splitting complex screens, or adding transition screens."

    def _max_words_for_duration(self, screen_type: str, max_duration: float) -> int:
        """Estimate safe max words for a screen after subtracting visual buffer."""
        buffer = self.COMPLEXITY_BUFFERS.get((screen_type or "").lower(), 0.5)
        available_seconds = max(max_duration - buffer, 1.0)
        return max(1, math.floor(available_seconds * self.WORDS_PER_SECOND))

    def _split_into_units(self, text: str) -> list[str]:
        sentences = [
            unit.strip()
            for unit in self.SENTENCE_BOUNDARY_RE.split(text.strip())
            if unit.strip()
        ]
        if len(sentences) > 1:
            return sentences

        clauses = [
            unit.strip()
            for unit in self.CLAUSE_BOUNDARY_RE.split(text.strip())
            if unit.strip()
        ]
        return clauses or [text.strip()]

    def _split_unit_to_word_chunks(self, text: str, max_words: int) -> list[str]:
        words = text.split()
        if len(words) <= max_words:
            return [text.strip()]

        return [
            " ".join(words[i:i + max_words]).strip()
            for i in range(0, len(words), max_words)
            if " ".join(words[i:i + max_words]).strip()
        ]

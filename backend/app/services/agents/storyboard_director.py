"""
Storyboard Director Agent - Creates screen-level outlines with voiceover drafts.
Operates in two modes: Initial Planning and Revision.

Uses voiceover-first approach:
1. Calculate word budget from duration
2. Write continuous voiceover per narrative phase
3. Mark visual change points to determine screen boundaries
4. Screen count emerges organically from content needs
"""

import json
import re
from typing import Any, Optional, Literal

from .base import BaseAgent


# Mapping from user's broll_type preferences to screen_type values
BROLL_TO_SCREEN_TYPE = {
    "screen_recording": "screencast",
    "slides": "slides/text overlay",
    "diagrams": "slides/text overlay",
    "whiteboard": "slides/text overlay",
    "code_editor": "screencast",
    "stock_footage": "stock video",
    "real_world": "stock video",
}


class StoryboardDirector(BaseAgent):
    """
    Strategic planner that creates screen outlines.

    Initial Mode: Creates complete outline from Story Brief
    Revision Mode: Updates outline based on feedback

    Output: screen_outline list with complete screen specifications
    """

    prompt_file = "storyboard_director_prompt.md"

    def _parse_duration_to_seconds(self, duration_str: str) -> int:
        """
        Convert duration string to target seconds.

        Handles formats:
        - "60-90s" -> 75 (midpoint)
        - "2-5min" -> 210 (3.5 min midpoint)
        - "60" -> 60
        - "90" -> 90
        """
        if not duration_str:
            return 60  # Default 60 seconds

        duration_str = str(duration_str).lower().strip()

        # Handle range formats like "60-90s" or "2-5min"
        range_match = re.match(r'(\d+)-(\d+)\s*(s|sec|min)?', duration_str)
        if range_match:
            low = int(range_match.group(1))
            high = int(range_match.group(2))
            unit = range_match.group(3) or ''
            midpoint = (low + high) // 2
            if 'min' in unit:
                return midpoint * 60
            return midpoint

        # Handle single value with unit like "5min" or "90s"
        single_match = re.match(r'(\d+)\s*(s|sec|min|mins|minutes)?', duration_str)
        if single_match:
            value = int(single_match.group(1))
            unit = single_match.group(2) or ''
            if 'min' in unit:
                return value * 60
            # If no unit and value is small (< 10), assume minutes
            if not unit and value < 10:
                return value * 60
            return value

        # Fallback mapping for legacy formats
        legacy_map = {
            "30": 30,
            "45": 45,
            "60": 60,
            "90": 90,
            "120": 120,
            "180": 180,
            "300": 300,
        }
        return legacy_map.get(duration_str, 60)

    def _calculate_word_budget(self, duration_str: str) -> dict:
        """
        Calculate word budget from target duration.

        Uses 2.0-2.5 words per second (120-150 words per minute).
        Target is 2.2 wps (~130 wpm) for natural speaking pace.

        Args:
            duration_str: Duration string like "60-90s", "2-5min", "60"

        Returns:
            dict with target_seconds, min_words, max_words, target_words
        """
        duration_seconds = self._parse_duration_to_seconds(duration_str)

        words_per_second_min = 2.0
        words_per_second_max = 2.5
        words_per_second_target = 2.2

        return {
            "target_seconds": duration_seconds,
            "min_words": int(duration_seconds * words_per_second_min),
            "max_words": int(duration_seconds * words_per_second_max),
            "target_words": int(duration_seconds * words_per_second_target),
            "words_per_second": words_per_second_target
        }

    def _map_broll_to_screen_types(self, broll_types: list, on_camera: str = "no") -> dict:
        """
        Map user's broll_type preferences to allowed screen_types.

        Args:
            broll_types: List of user-selected broll types
            on_camera: "no", "yes_throughout", or "yes_intro_outro"

        Returns:
            dict with allowed_screen_types list and mapping info
        """
        allowed_types = set()

        for broll in (broll_types or []):
            if broll in BROLL_TO_SCREEN_TYPE:
                allowed_types.add(BROLL_TO_SCREEN_TYPE[broll])

        # CTA is always allowed
        allowed_types.add("CTA")

        # talking head allowed if on_camera is not "no"
        if on_camera and on_camera.lower() != "no":
            allowed_types.add("talking head")

        # If no broll types selected, provide defaults
        if len(allowed_types) <= 1:  # Only CTA
            allowed_types.update(["slides/text overlay", "stock video"])

        return {
            "allowed_screen_types": sorted(list(allowed_types)),
            "user_preferences": broll_types or [],
            "on_camera_allowed": on_camera and on_camera.lower() != "no"
        }

    def _extract_brief_field(self, story_brief: dict, field_name: str, default=None):
        """
        Extract a field from story_brief, handling both new and legacy formats.

        New format: story_brief.fields.{field_name}.value
        Legacy format: story_brief.{field_name}
        """
        # Try new format first
        if "fields" in story_brief:
            field = story_brief["fields"].get(field_name, {})
            if isinstance(field, dict) and "value" in field:
                return field["value"]

        # Fall back to legacy format
        return story_brief.get(field_name, default)

    def run(
        self,
        state: Any,
        mode: Literal["initial", "revision"] = "initial",
        revision_request: Optional[str] = None,
        **kwargs
    ) -> list:
        """
        Create or revise a screen outline.

        Args:
            state: StoryboardState with story_brief and intake_form
            mode: "initial" for new outline, "revision" for updates
            revision_request: Feedback text (required for revision mode)

        Returns:
            screen_outline list with screen specifications
        """
        if mode == "revision" and not revision_request:
            raise ValueError("Revision mode requires revision_request")

        if not state.story_brief:
            raise ValueError("StoryboardDirector requires story_brief in state")

        # Build the user prompt based on mode
        if mode == "initial":
            user_prompt = self._build_initial_prompt(state)
        else:
            user_prompt = self._build_revision_prompt(state, revision_request)

        # Call LLM
        response = self.call_llm(user_prompt, max_tokens=8000)

        # Parse the response
        if mode == "initial":
            return self._parse_screen_outline(response)
        else:
            return self._parse_revision_response(response, state.screen_outline)

    def _build_initial_prompt(self, state: Any) -> str:
        """Build prompt for initial outline creation with voiceover-first approach."""
        story_brief = state.story_brief

        # Extract duration and calculate word budget
        duration = self._extract_brief_field(story_brief, "duration") or \
                   self._extract_brief_field(story_brief, "desired_length") or "60"
        word_budget = self._calculate_word_budget(duration)

        # Extract broll_type preferences
        broll_types = self._extract_brief_field(story_brief, "broll_type") or []
        if isinstance(broll_types, str):
            broll_types = [broll_types]

        # Extract on_camera_presence
        on_camera = self._extract_brief_field(story_brief, "on_camera_presence") or "no"

        # Map to allowed screen types
        screen_type_info = self._map_broll_to_screen_types(broll_types, on_camera)

        return f"""Create a voiceover-first screen outline for this video.

WORD BUDGET:
- Target duration: {word_budget['target_seconds']} seconds
- Target word count: {word_budget['target_words']} words
- Acceptable range: {word_budget['min_words']} - {word_budget['max_words']} words
- Speaking rate: {word_budget['words_per_second']} words per second

USER'S PREFERRED VISUAL TYPES: {json.dumps(screen_type_info['user_preferences'])}
ALLOWED SCREEN TYPES: {json.dumps(screen_type_info['allowed_screen_types'])}
ON-CAMERA ALLOWED: {screen_type_info['on_camera_allowed']}

STORY BRIEF:
{json.dumps(story_brief, indent=2)}

MODE: initial

Follow the VOICEOVER-FIRST PLANNING PROCESS in your system prompt:
1. Write continuous voiceover per narrative phase (not per screen)
2. Mark visual change points where message/subject shifts
3. Those marks become screen boundaries
4. Calculate rough_duration per screen (word_count / 2.2)
5. Verify total duration matches target ±10%

Return the outline as a JSON array of screen objects with:
- screen_number
- purpose
- rough_duration (calculated from voiceover word count)
- screen_type (from ALLOWED SCREEN TYPES only)
- voiceover_text (the exact words)
- visual_direction
- notes"""

    def _build_revision_prompt(self, state: Any, revision_request: str) -> str:
        """Build prompt for outline revision."""
        # Include intake_form for full context
        return f"""Revise the screen outline based on user feedback:

INPUT:
{{
  "user_revision_request": {json.dumps(revision_request)},
  "current_outline": {json.dumps(state.screen_outline, indent=2)},
  "story_brief": {json.dumps(state.story_brief, indent=2)},
  "intake_form": {json.dumps(state.intake_form, indent=2)},
  "mode": "revision"
}}

Analyze the revision request and determine the appropriate operations:
- REORDER: Change screen sequence
- SPLIT: Break one screen into multiple
- MERGE: Combine multiple screens
- ADD_AFTER: Insert new screen
- REMOVE: Delete a screen
- REWRITE_SCREEN: Change content/messaging
- UPDATE_VISUALS: Change visual approach
- TIGHTEN_VO: Compress voiceover
- CHANGE_TONE: Adjust tone across screens

Return either:
1. A revision_requests array with operations, OR
2. An updated screen_outline array if simpler

Ensure all changes align with the story_brief constraints and key_points."""

    def _parse_screen_outline(self, response: str) -> list:
        """Parse LLM response into a screen outline."""
        parsed = self._extract_json(response)

        if parsed:
            # Handle both array and object with screen_outline field
            if isinstance(parsed, list):
                return self._normalize_screens(parsed)
            elif isinstance(parsed, dict) and "screen_outline" in parsed:
                return self._normalize_screens(parsed["screen_outline"])

        # Fallback: return empty outline with error
        return [{
            "screen_number": 1,
            "purpose": "Error - could not parse response",
            "rough_duration": 5,
            "screen_type": "slides/text overlay",
            "voiceover_text": "An error occurred while generating the outline.",
            "visual_direction": "Error message display",
            "notes": f"Raw response: {response[:500]}",
            "error": True
        }]

    def _parse_revision_response(self, response: str, current_outline: list) -> list:
        """Parse revision response and apply changes."""
        parsed = self._extract_json(response)

        if not parsed:
            # If parsing fails, return current outline unchanged
            return current_outline

        # If it's a direct screen outline, use it
        if isinstance(parsed, list):
            return self._normalize_screens(parsed)

        # If it's a revision_requests object, apply the operations
        if isinstance(parsed, dict):
            if "screen_outline" in parsed:
                return self._normalize_screens(parsed["screen_outline"])
            elif "revision_requests" in parsed:
                return self._apply_revisions(current_outline, parsed["revision_requests"])

        return current_outline

    def _apply_revisions(self, outline: list, revisions: list) -> list:
        """Apply revision operations to the outline."""
        result = list(outline)  # Copy

        for rev in revisions:
            operation = rev.get("operation", "").upper()
            screen_num = rev.get("screen_number")

            if operation == "REMOVE":
                result = [s for s in result if s.get("screen_number") != screen_num]

            elif operation == "REWRITE_SCREEN":
                updated = rev.get("updated_screen", {})
                for i, screen in enumerate(result):
                    if screen.get("screen_number") == screen_num:
                        result[i] = {**screen, **updated}
                        break

            elif operation == "ADD_AFTER":
                new_screen = rev.get("new_screen", {})
                for i, screen in enumerate(result):
                    if screen.get("screen_number") == screen_num:
                        result.insert(i + 1, new_screen)
                        break

            elif operation == "SPLIT":
                new_screens = rev.get("new_screens", [])
                for i, screen in enumerate(result):
                    if screen.get("screen_number") == screen_num:
                        result = result[:i] + new_screens + result[i+1:]
                        break

            elif operation == "MERGE":
                screen_nums = rev.get("screen_numbers", [])
                merged = rev.get("merged_screen", {})
                result = [s for s in result if s.get("screen_number") not in screen_nums]
                # Insert merged screen at first position
                if screen_nums:
                    insert_pos = min(screen_nums) - 1
                    result.insert(max(0, insert_pos), merged)

            elif operation == "TIGHTEN_VO":
                new_vo = rev.get("updated_voiceover", "")
                for screen in result:
                    if screen.get("screen_number") == screen_num:
                        screen["voiceover_text"] = new_vo
                        if "target_duration" in rev:
                            screen["rough_duration"] = rev["target_duration"]
                        break

            elif operation == "UPDATE_VISUALS":
                updated = rev.get("updated_visual", {})
                for screen in result:
                    if screen.get("screen_number") == screen_num:
                        screen.update(updated)
                        break

        # Renumber screens
        for i, screen in enumerate(result):
            screen["screen_number"] = i + 1

        return result

    def _normalize_screens(self, screens: list) -> list:
        """Ensure all screens have required fields."""
        required_fields = {
            "screen_number": 1,
            "purpose": "",
            "rough_duration": 6,
            "screen_type": "slides/text overlay",
            "voiceover_text": "",
            "visual_direction": "",
            "notes": ""
        }

        normalized = []
        for i, screen in enumerate(screens):
            if not isinstance(screen, dict):
                continue

            norm_screen = dict(required_fields)
            norm_screen.update(screen)
            norm_screen["screen_number"] = i + 1  # Ensure sequential numbering

            normalized.append(norm_screen)

        return normalized

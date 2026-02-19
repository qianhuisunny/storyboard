"""
Storyboard Director Agent - Creates screen-level outlines with voiceover drafts.
Operates in two modes: Initial Planning and Revision.
"""

import json
from typing import Any, Optional, Literal

from .base import BaseAgent


class StoryboardDirector(BaseAgent):
    """
    Strategic planner that creates screen outlines.

    Initial Mode: Creates complete outline from Story Brief
    Revision Mode: Updates outline based on feedback

    Output: screen_outline list with complete screen specifications
    """

    prompt_file = "storyboard_director_prompt.md"

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
            state: StoryboardState with story_brief, context_pack, intake_form
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
        """Build prompt for initial outline creation."""
        return f"""Create a screen-level outline for this video:

INPUT:
{{
  "story_brief": {json.dumps(state.story_brief, indent=2)},
  "context_pack": {json.dumps(state.context_pack, indent=2)},
  "mode": "initial"
}}

Create a complete screen outline following the schema in your system prompt.
Each screen should have:
- screen_number
- purpose
- rough_duration
- screen_type
- voiceover_text
- visual_direction
- notes

Return the outline as a JSON array of screen objects."""

    def _build_revision_prompt(self, state: Any, revision_request: str) -> str:
        """Build prompt for outline revision."""
        # Include intake_form for full context (fixing the identified gap)
        return f"""Revise the screen outline based on user feedback:

INPUT:
{{
  "user_revision_request": {json.dumps(revision_request)},
  "current_outline": {json.dumps(state.screen_outline, indent=2)},
  "story_brief": {json.dumps(state.story_brief, indent=2)},
  "context_pack": {json.dumps(state.context_pack, indent=2)},
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

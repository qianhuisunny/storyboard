"""
Storyboard Writer Agent - Expands section-level outlines into screen-by-screen storyboards.

Takes Director's text outline + evidence research → calls LLM per section →
post-processes with DurationCalculator → returns production-ready screen list.
"""

import json
import re
from typing import Any, Optional

from .base import BaseAgent
from .duration_calculator import DurationCalculator
from ..processing_log import log_llm_request, log_llm_response


# Placeholder images per screen type, served from frontend/public/placeholders/
PLACEHOLDER_IMAGES = {
    "screen_recording": "/placeholders/screen_recording.png",
    "slides": "/placeholders/slides_and_diagrams.png",
    "whiteboard_animation": "/placeholders/whiteboard.png",
    "whiteboard": "/placeholders/whiteboard.png",  # legacy fallback
    "code_editor": "/placeholders/code_editor.png",
    "stock_footage": "/placeholders/stock_footage.png",
    "real_world": "/placeholders/real_world.png",
    "talking_head": "/placeholders/talking_head.png",
    "talking_head_with_split_screens": "/placeholders/talking_head.png",
    "talking_head_left_with_notes": "/placeholders/talking_head.png",  # gold set variant
}


class StoryboardWriter(BaseAgent):
    """
    Expands section-level outlines into screen-by-screen storyboards.

    Input: state.screen_outline (text) + state.evidence_research (dict)
    Output: list of 7-field screen dicts
    """

    prompt_file = "storyboard_writer_prompt_v0312.md"

    def __init__(self):
        super().__init__()
        self.duration_calculator = DurationCalculator()

    def run(self, state: Any, **kwargs) -> list:
        """
        Process outline into production storyboard.

        For text outlines: parse sections, call LLM per section, post-process.
        For legacy screen-lists: add duration + placeholder images.
        """
        if not state.screen_outline:
            raise ValueError("StoryboardWriter requires screen_outline in state")

        # Legacy screen-list outline
        if isinstance(state.screen_outline, list):
            return self._process_legacy_screens(state.screen_outline, state.story_brief)

        outline_text = state.screen_outline
        story_brief = state.story_brief or {}
        evidence_research = getattr(state, "evidence_research", None) or {}
        project_id = getattr(state, "project_id", None)

        # 1. Parse outline into sections
        sections = self._parse_outline(outline_text)
        if not sections:
            raise ValueError("Could not parse any sections from outline")

        # 2. Extract context from brief
        brief_context = self._extract_brief_context(story_brief)
        allowed_types = self._get_allowed_screen_types(story_brief)
        target_duration = self._get_target_duration(story_brief)

        # 3. Process each section
        all_screens = []
        for section in sections:
            prev_screens = all_screens[-2:] if all_screens else []
            start_number = len(all_screens) + 1

            # Get evidence for this section
            section_evidence = self._get_evidence_for_section(
                evidence_research, section.get("title", "")
            )

            section_screens = self._process_section(
                section=section,
                evidence=section_evidence,
                full_outline=outline_text,
                brief_context=brief_context,
                allowed_types=allowed_types,
                prev_screens=prev_screens,
                start_number=start_number,
                project_id=project_id,
            )
            all_screens.extend(section_screens)

        # 4. Post-process: add duration + on_screen_visual
        all_screens = self._post_process_screens(all_screens, allowed_types)

        # 5. Validate and adjust total duration
        if target_duration > 0:
            all_screens = self._adjust_total_duration(all_screens, target_duration)

        # 6. Ensure sequential numbering
        for i, screen in enumerate(all_screens):
            screen["screen_number"] = i + 1

        return all_screens

    # =========================================================================
    # Outline Parsing (mirrors frontend/src/components/OutlineBuilder/outlineParser.ts)
    # =========================================================================

    def _parse_outline(self, text: str) -> list:
        """Parse Director's plain text outline into structured sections."""
        if not text or not text.strip():
            return []

        # Split on "Section N — Title" headers
        section_pattern = r"^Section\s+(\d+)\s*[—–\-]\s*(.+)$"
        headers = [
            (m.start(), int(m.group(1)), m.group(2).strip())
            for m in re.finditer(section_pattern, text, re.MULTILINE)
        ]

        if not headers:
            return []

        sections = []
        for i, (start, num, title) in enumerate(headers):
            end = headers[i + 1][0] if i < len(headers) - 1 else len(text)
            block = text[start:end]

            sections.append({
                "section_number": num,
                "title": title,
                "purpose": self._extract_field(block, "Purpose"),
                "entry_assumption": self._extract_field(block, "Entry assumption"),
                "exit_state": self._extract_field(block, "Exit state"),
                "duration_range": self._extract_field(block, "Duration"),
                "talking_points": self._extract_bullets(block, "Talking points"),
                "evidence_needed": self._extract_bullets(block, "Evidence needed"),
            })

        return sections

    def _extract_field(self, block: str, header: str) -> str:
        """Extract a single-value field from a section block.

        Handles both Director format (plain headers) and reference format (**bold** headers).
        Also handles variations like "Approx. duration" vs "Duration".
        """
        # Known headers with aliases (first in list is canonical)
        known_headers = [
            ["Purpose"],
            ["Entry assumption"],
            ["Exit state"],
            ["Duration", "Approx. duration", "Approx duration"],
            ["Talking points", "Talking point"],
            ["Evidence needed", "Evidence"],
            ["Research queries", "Research query"],
        ]

        positions = []
        for aliases in known_headers:
            canonical = aliases[0]
            for alias in aliases:
                # Match both plain and **bold** markdown headers
                pattern = rf"^(?:\*\*)?{re.escape(alias)}(?:\*\*)?\s*$"
                m = re.search(pattern, block, re.MULTILINE | re.IGNORECASE)
                if m:
                    positions.append((m.start(), m.end(), canonical))
                    break  # Use first matching alias

        positions.sort(key=lambda x: x[0])

        # Find the target header
        for i, (start, end, name) in enumerate(positions):
            if name.lower() == header.lower():
                content_start = end
                content_end = positions[i + 1][0] if i < len(positions) - 1 else len(block)
                return block[content_start:content_end].strip()

        return ""

    def _extract_bullets(self, block: str, header: str) -> list:
        """Extract bullet point list from a section block."""
        content = self._extract_field(block, header)
        if not content:
            return []
        return [
            line.lstrip("- *").strip()
            for line in content.split("\n")
            if line.strip().startswith("-") or line.strip().startswith("*")
        ]

    def _parse_duration_range(self, duration_str: str) -> tuple:
        """Parse duration ranges into (min_seconds, max_seconds).

        Handles formats:
        - '1:30–2:00' (mm:ss)
        - '1.5–2 min' (minutes)
        - '90–120' (seconds)
        - '2–2.5 min'
        """
        if not duration_str:
            return (120, 180)  # default 2-3 min

        # Check if "min" appears → values are in minutes
        is_minutes = "min" in duration_str.lower()
        clean = re.sub(r"\s*min(utes?)?\s*", "", duration_str, flags=re.IGNORECASE).strip()

        parts = re.split(r"[—–\-]", clean)

        def to_seconds(t: str) -> int:
            t = t.strip()
            if ":" in t:
                pieces = t.split(":")
                return int(pieces[0]) * 60 + int(pieces[1])
            try:
                val = float(t)
                return int(val * 60) if is_minutes else int(val)
            except ValueError:
                return 120

        if len(parts) >= 2:
            return (to_seconds(parts[0]), to_seconds(parts[1]))
        elif len(parts) == 1:
            s = to_seconds(parts[0])
            return (s, s)
        return (120, 180)

    # =========================================================================
    # Brief Context Extraction
    # =========================================================================

    def _extract_brief_field(self, story_brief: dict, field_name: str, default=None):
        """Extract a field from story_brief, handling both new and legacy formats."""
        if "fields" in story_brief:
            field = story_brief["fields"].get(field_name, {})
            if isinstance(field, dict) and "value" in field:
                return field["value"]
        return story_brief.get(field_name, default)

    def _extract_brief_context(self, story_brief: dict) -> dict:
        """Extract relevant fields from story brief for the user prompt."""
        return {
            "target_audience": self._extract_brief_field(story_brief, "target_audience", ""),
            "audience_level": self._extract_brief_field(story_brief, "audience_level", "intermediate"),
            "delivery_tone": self._extract_brief_field(story_brief, "delivery_tone", ""),
            "selected_angle": self._extract_brief_field(story_brief, "selected_angle", ""),
            "duration": self._extract_brief_field(story_brief, "duration", "60"),
            "viewer_outcome": self._extract_brief_field(story_brief, "viewer_outcome", ""),
        }

    def _get_allowed_screen_types(self, story_brief: dict) -> list:
        """Derive allowed screen types from broll_type + on_camera_presence."""
        broll = self._extract_brief_field(story_brief, "broll_type", [])
        if isinstance(broll, str):
            broll = [broll] if broll else []

        # Map brief broll_type values to valid screen types
        type_map = {
            "slides": "slides",
            "whiteboard": "whiteboard_animation",
            "diagrams": "whiteboard_animation",
            "screen_recording": "screen_recording",
            "code_editor": "code_editor",
            "stock_footage": "stock_footage",
            "real_world": "real_world",
        }

        allowed = []
        for b in broll:
            mapped = type_map.get(b.lower().strip(), b.lower().strip())
            if mapped not in allowed:
                allowed.append(mapped)

        # Add talking_head if on-camera presence is enabled
        on_camera = self._extract_brief_field(story_brief, "on_camera_presence", "")
        if on_camera and on_camera.lower() not in ("no", "none", ""):
            if "talking_head" not in allowed:
                allowed.append("talking_head")

        # Fallback if empty
        if not allowed:
            allowed = ["slides", "whiteboard_animation"]

        return allowed

    def _get_target_duration(self, story_brief: dict) -> float:
        """Get target duration in seconds from brief."""
        duration = self._extract_brief_field(story_brief, "duration", "60")
        try:
            return float(duration)
        except (ValueError, TypeError):
            return 60.0

    # =========================================================================
    # Evidence Research Integration
    # =========================================================================

    def _get_evidence_for_section(self, evidence_research: dict, section_title: str) -> list:
        """
        Get evidence tasks with selected evidence for a section.
        Returns list of evidence task dicts with high/medium confidence selections.
        """
        if not evidence_research:
            return []

        sections = evidence_research.get("sections", [])
        for section in sections:
            # Match by section title (fuzzy: check if title appears in section_title)
            ev_title = section.get("section_title", "")
            if section_title.lower() in ev_title.lower() or ev_title.lower() in f"section {section_title}".lower():
                tasks = []
                for task in section.get("evidence_tasks", []):
                    selected = task.get("selected_evidence")
                    if selected and selected.get("confidence") in ("high", "medium"):
                        tasks.append({
                            "task_label": task.get("task_label", ""),
                            "supports": task.get("supports", ""),
                            "evidence_type": task.get("evidence_type", ""),
                            "priority": task.get("priority", ""),
                            "evidence_summary": selected.get("evidence_summary", ""),
                            "usable_line": selected.get("usable_line", ""),
                            "source_title": selected.get("source_title", ""),
                            "source_url": selected.get("source_url", ""),
                        })
                return tasks

        return []

    def _format_evidence_for_prompt(self, evidence: list, research_brief: str = "") -> str:
        """Format evidence tasks into prompt-friendly text."""
        if not evidence:
            return "No evidence research available for this section."

        lines = []
        if research_brief:
            lines.append(f"Research brief: {research_brief}")
            lines.append("")

        for task in evidence:
            lines.append(f"Evidence: {task['task_label']} ({task['evidence_type']}, {task['priority']})")
            if task.get("evidence_summary"):
                lines.append(f"  Summary: {task['evidence_summary']}")
            if task.get("usable_line"):
                lines.append(f"  Usable line: {task['usable_line']}")
            if task.get("source_title"):
                lines.append(f"  Source: {task['source_title']} ({task.get('source_url', '')})")
            lines.append("")

        return "\n".join(lines)

    # =========================================================================
    # Section Processing (LLM call per section)
    # =========================================================================

    def _process_section(
        self,
        section: dict,
        evidence: list,
        full_outline: str,
        brief_context: dict,
        allowed_types: list,
        prev_screens: list,
        start_number: int,
        project_id: Optional[str] = None,
    ) -> list:
        """Process one section: build prompt, call LLM, parse response."""
        # Screen count range: min = talking points (each needs ≥1 screen), max = from duration
        # Writer decides freely within range — new screen = new visual change needed
        min_sec, max_sec = self._parse_duration_range(section.get("duration_range", ""))
        tp_count = len(section.get("talking_points", []))
        min_screens = max(2, tp_count)  # at least 1 screen per talking point, floor of 2
        max_screens = min(max(2, round(max_sec / 30)), 8)  # from max duration, capped at 8
        # Ensure min doesn't exceed max
        if min_screens > max_screens:
            max_screens = min_screens

        # Build user prompt
        user_prompt = self._build_section_prompt(
            section=section,
            evidence=evidence,
            full_outline=full_outline,
            brief_context=brief_context,
            allowed_types=allowed_types,
            prev_screens=prev_screens,
            start_number=start_number,
            min_screens=min_screens,
            max_screens=max_screens,
            min_sec=min_sec,
            max_sec=max_sec,
        )

        # Log request
        if project_id:
            log_llm_request(
                project_id=project_id,
                phase=f"storyboard_writer_section_{section.get('section_number', '?')}",
                input_fields={
                    "section": section.get("title", ""),
                    "target_screens": f"{min_screens}-{max_screens}",
                },
                system_prompt=self.system_prompt[:200] if self.system_prompt else "",
                user_prompt=user_prompt[:200],
                max_tokens=8000,
            )

        # Call LLM
        response = self.call_llm(user_prompt, max_tokens=8000, temperature=0.7)

        # Parse JSON
        parsed = self._extract_json(response)

        # Log response
        if project_id:
            log_llm_response(
                project_id=project_id,
                phase=f"storyboard_writer_section_{section.get('section_number', '?')}",
                raw_response=response[:500] if response else "",
                parsed_result={
                    "screens_generated": len(parsed) if isinstance(parsed, list) else 0,
                },
            )

        if not parsed or not isinstance(parsed, list):
            # Retry once with lower temperature
            response = self.call_llm(user_prompt, max_tokens=8000, temperature=0.4)
            parsed = self._extract_json(response)
            if not parsed or not isinstance(parsed, list):
                return []

        return parsed

    def _build_section_prompt(
        self,
        section: dict,
        evidence: list,
        full_outline: str,
        brief_context: dict,
        allowed_types: list,
        prev_screens: list,
        start_number: int,
        min_screens: int,
        max_screens: int,
        min_sec: int,
        max_sec: int,
    ) -> str:
        """Construct the user prompt for one section's LLM call."""
        # Format talking points
        tp_text = "\n".join(f"- {tp}" for tp in section.get("talking_points", [])) or "- (none)"
        ev_text = "\n".join(f"- {ev}" for ev in section.get("evidence_needed", [])) or "- (none)"
        # Format evidence research
        # Find the research_brief for this section from evidence_research
        evidence_text = self._format_evidence_for_prompt(evidence)

        # Format previous screens
        if prev_screens:
            prev_text = json.dumps(prev_screens, indent=2, ensure_ascii=False)
        else:
            prev_text = "This is the first section — no previous screens."

        return f"""Generate screens for this section.

=== FULL OUTLINE (context only — do not generate screens for other sections) ===
{full_outline}

=== STORY BRIEF ===
Audience: {brief_context['target_audience']} (level: {brief_context['audience_level']})
Tone: {brief_context['delivery_tone']}
Angle: {brief_context['selected_angle']}
Viewer outcome: {brief_context['viewer_outcome']}
Total video duration: {brief_context['duration']}s

=== ALLOWED SCREEN TYPES ===
{', '.join(allowed_types)}

=== EVIDENCE RESEARCH FOR THIS SECTION ===
{evidence_text}

=== PREVIOUS SECTION'S LAST SCREENS (for visual continuity) ===
{prev_text}

=== SECTION TO EXPAND ===
Section {section.get('section_number', '?')} — {section.get('title', '')}

Purpose: {section.get('purpose', '')}
Entry assumption: {section.get('entry_assumption', 'None')}
Exit state: {section.get('exit_state', '')}
Target duration: {min_sec}-{max_sec} seconds
Screen range: {min_screens}-{max_screens} screens

Talking points:
{tp_text}

Evidence needed:
{ev_text}

=== INSTRUCTIONS ===
Starting screen number: {start_number}
Generate {min_screens}-{max_screens} screens for this section.

**Constraints:**
- Every talking point listed above MUST appear in at least one screen's voiceover. Do not skip or vaguely paraphrase any talking point.
- The ONE principle for when to start a new screen: does the content need a different visual? If the visual stays the same, keep it in the current screen. If the viewer needs to see something new, start a new screen.

Return a JSON array. Each element has exactly 5 fields:
- screen_number (integer, starting from {start_number})
- screen_type (one of: {', '.join(allowed_types)})
- voiceover_text (as long as the visual stays the same — new screen only when the visual changes)
- visual_direction (array of 2-4 specific visual elements that EXPLAIN the voiceover content)
- action_notes (1-2 sentences: cognitive function + execution guidance)

Follow your system prompt rules strictly. Every sentence of voiceover must teach — no filler, no announcements, no motivation."""

    # =========================================================================
    # Post-Processing
    # =========================================================================

    def _post_process_screens(self, screens: list, allowed_types: list) -> list:
        """Add server-computed fields: duration and on_screen_visual."""
        for screen in screens:
            # Validate screen_type
            st = screen.get("screen_type", "slides")
            if st not in PLACEHOLDER_IMAGES:
                st = allowed_types[0] if allowed_types else "slides"
                screen["screen_type"] = st

            # Calculate duration from voiceover word count
            voiceover = screen.get("voiceover_text", "")
            calc = self.duration_calculator.calculate(voiceover, st)
            screen["duration"] = calc["duration"]

            # Assign placeholder image
            screen["on_screen_visual"] = PLACEHOLDER_IMAGES.get(st, "/placeholders/slides_and_diagrams.png")

            # Ensure visual_direction is a list
            vd = screen.get("visual_direction", [])
            if isinstance(vd, str):
                screen["visual_direction"] = [vd]
            elif not isinstance(vd, list):
                screen["visual_direction"] = []

            # Ensure action_notes exists
            if "action_notes" not in screen:
                screen["action_notes"] = ""

        return screens

    def _adjust_total_duration(self, screens: list, target_seconds: float) -> list:
        """Proportionally adjust durations if total is off by more than 5%."""
        if not screens:
            return screens

        total = sum(s.get("duration", 0) for s in screens)
        if total == 0:
            return screens

        deviation = abs(total - target_seconds) / target_seconds
        if deviation <= 0.05:
            return screens  # Within 5%, no adjustment needed

        # Scale proportionally
        scale = target_seconds / total
        for screen in screens:
            original = screen.get("duration", 6.0)
            adjusted = original * scale
            # Round to nearest 0.5, apply min/max
            adjusted = round(adjusted * 2) / 2
            adjusted = max(15.0, min(90.0, adjusted))
            screen["duration"] = adjusted

        return screens

    # =========================================================================
    # Legacy Support
    # =========================================================================

    def _process_legacy_screens(self, screen_list: list, story_brief: dict) -> list:
        """Backward compat: process pre-built screen list by adding visual assets."""
        storyboard = []
        for screen in screen_list:
            screen_type = screen.get("screen_type", "slides")
            storyboard.append({
                "screen_number": screen.get("screen_number", 1),
                "screen_type": screen_type,
                "duration": screen.get("duration", 6.0),
                "voiceover_text": screen.get("voiceover_text", ""),
                "visual_direction": screen.get("visual_direction", []),
                "on_screen_visual": PLACEHOLDER_IMAGES.get(screen_type, "/placeholders/slides_and_diagrams.png"),
                "action_notes": screen.get("action_notes", ""),
            })
        return storyboard

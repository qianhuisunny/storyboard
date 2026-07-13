"""
Storyboard Writer Agent - Expands section-level outlines into screen-by-screen storyboards.

Takes Director's text outline + evidence research → single LLM call for entire storyboard →
post-processes with DurationCalculator → returns production-ready screen list.
"""

import re
from typing import Any, Optional

from app.services.legacy_storyboard import legacy_section_assignments
from app.services.production_formats import resolve_production_formats
from app.services.prompt_context import render_prompt_value

from .base import BaseAgent
from .duration_calculator import DurationCalculator


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

    prompt_file = "storyboard_writer_prompt_v0712.md"
    SECTION_DURATION_TOLERANCE = 0.20

    def __init__(self):
        super().__init__()
        self.duration_calculator = DurationCalculator()

    def run(self, state: Any, **kwargs) -> list:
        """
        Process outline into production storyboard.

        For text outlines: parse sections, compute word budgets, single LLM call,
        post-process, validate per-section duration (±20%), retry individual sections.
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
        revision_instruction = kwargs.get("revision_instruction")
        existing_storyboard = kwargs.get("existing_storyboard")
        quality_feedback = kwargs.get("quality_feedback")
        if existing_storyboard is None:
            existing_storyboard = getattr(state, "storyboard", None)

        # 1. Parse outline into sections (stores target_seconds on each section)
        sections = self.validate_outline_contract(outline_text)

        # 2. Extract context from brief
        brief_context = self._extract_brief_context(story_brief)
        allowed_types = self._get_allowed_screen_types(story_brief)
        target_duration = self._get_target_duration(story_brief)

        # 3. Compute word budgets per section from target_seconds
        self._compute_section_budgets(sections, allowed_types)

        # 4. Gather all evidence across sections
        all_evidence = {}
        for section in sections:
            title = section.get("title", "")
            section_evidence = self._get_evidence_for_section(
                evidence_research, title
            )
            if section_evidence:
                all_evidence[title] = section_evidence

        # 5. Generate full storyboard (single LLM call, no whole-storyboard retry)
        user_prompt = self._build_full_storyboard_prompt(
            sections=sections,
            all_evidence=all_evidence,
            full_outline=outline_text,
            brief_context=brief_context,
            allowed_types=allowed_types,
            target_duration=target_duration,
            revision_instruction=revision_instruction,
            existing_storyboard=existing_storyboard,
            quality_feedback=quality_feedback,
        )
        all_screens = self._call_storyboard_llm(user_prompt, project_id)
        if not all_screens:
            raise ValueError("StoryboardWriter could not generate a valid storyboard")

        all_screens = self._post_process_screens(all_screens, allowed_types)

        # 6. Per-section duration validation and retry
        if target_duration > 0:
            all_screens = self._validate_and_retry_sections(
                all_screens, sections, all_evidence, brief_context,
                allowed_types, project_id, revision_instruction,
                existing_storyboard, quality_feedback,
            )

        # 7. Ensure sequential numbering
        for i, screen in enumerate(all_screens):
            screen["screen_number"] = i + 1

        return all_screens

    def _call_storyboard_llm(self, user_prompt: str, project_id: Optional[str] = None) -> list:
        """Single LLM call for full storyboard, with one retry on failure."""
        response = self.call_llm(user_prompt, max_tokens=16000, temperature=0.7)
        parsed = self._extract_json(response)

        if not parsed or not isinstance(parsed, list):
            response = self.call_llm(user_prompt, max_tokens=16000, temperature=0.4)
            parsed = self._extract_json(response)
            if not parsed or not isinstance(parsed, list):
                return []

        return parsed

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

    def _parse_duration_range(self, duration_str: str) -> Optional[tuple[int, int]]:
        """Parse duration ranges into (min_seconds, max_seconds).

        Handles formats:
        - '1:30–2:00' (mm:ss)
        - '1.5–2 min' (minutes)
        - '90–120' (seconds)
        - '2–2.5 min'
        """
        if not duration_str or not duration_str.strip():
            return None

        # Check if "min" appears → values are in minutes
        is_minutes = "min" in duration_str.lower()
        clean = re.sub(r"\s*min(utes?)?\s*", "", duration_str, flags=re.IGNORECASE).strip()

        if not re.search(r"\S\s*[—–-]\s*\S", clean):
            return None
        parts = [part.strip() for part in re.split(r"[—–\-]", clean) if part.strip()]
        if len(parts) != 2:
            return None

        def to_seconds(t: str) -> Optional[int]:
            t = t.strip()
            if ":" in t:
                pieces = t.split(":")
                if len(pieces) != 2 or not all(piece.isdigit() for piece in pieces):
                    return None
                return int(pieces[0]) * 60 + int(pieces[1])
            try:
                val = float(t)
                if val <= 0:
                    return None
                return round(val * 60) if is_minutes else round(val)
            except ValueError:
                return None

        min_sec = to_seconds(parts[0])
        max_sec = to_seconds(parts[1])
        if min_sec is None or max_sec is None or min_sec <= 0 or max_sec <= 0:
            return None
        return (min(min_sec, max_sec), max(min_sec, max_sec))

    def _parse_target_seconds(self, duration_str: str) -> Optional[int]:
        """Parse Director's Duration field as a single target in seconds.

        Handles: '90', '90 seconds', '90s'.
        Falls back to range midpoint for legacy v0324 outlines (e.g. '1:30–2:00').
        """
        if not duration_str or not duration_str.strip():
            return None
        canonical = re.fullmatch(
            r"\s*([1-9]\d*)\s*(?:seconds?|secs?|s)?\s*",
            duration_str,
            re.IGNORECASE,
        )
        if canonical:
            return int(canonical.group(1))
        parsed = self._parse_duration_range(duration_str)
        if parsed:
            return (parsed[0] + parsed[1]) // 2
        return None

    def validate_outline_contract(self, outline_text: str) -> list:
        """
        Validate the writer-facing outline contract before we commit to
        storyboard generation. Bad or missing duration fields should fail fast
        instead of silently defaulting to 120-180 seconds.

        Stores parsed `target_seconds` on each section dict for downstream use.
        """
        sections = self._parse_outline(outline_text)
        if not sections:
            raise ValueError("Could not parse any sections from outline")

        errors = []
        section_numbers = [section.get("section_number") for section in sections]
        if section_numbers != list(range(1, len(sections) + 1)):
            errors.append(
                "Section numbers must be unique and sequential from 1"
            )
        for section in sections:
            section_number = section.get("section_number", "?")
            if not section.get("title", "").strip():
                errors.append(f"Section {section_number} is missing a title")
            if not section.get("purpose", "").strip():
                errors.append(f"Section {section_number} is missing Purpose")
            if not section.get("entry_assumption", "").strip():
                errors.append(
                    f"Section {section_number} is missing Entry assumption"
                )
            if not section.get("exit_state", "").strip():
                errors.append(f"Section {section_number} is missing Exit state")
            duration_raw = section.get("duration_range", "")
            target_sec = self._parse_target_seconds(duration_raw)
            if not duration_raw.strip():
                errors.append(f"Section {section_number} is missing Duration")
            elif target_sec is None:
                errors.append(
                    f"Section {section_number} has an invalid Duration value: {duration_raw!r}"
                )
            else:
                section["target_seconds"] = target_sec
            if not section.get("talking_points"):
                errors.append(f"Section {section_number} must include at least one talking point")

        if errors:
            raise ValueError("Outline contract invalid: " + "; ".join(errors[:5]))

        return sections

    # =========================================================================
    # Brief Context Extraction
    # =========================================================================

    @staticmethod
    def _unwrap_brief_value(value: Any) -> Any:
        if isinstance(value, dict) and "value" in value:
            return value["value"]
        return value

    @staticmethod
    def _brief_value_present(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, tuple, dict, set)):
            return bool(value)
        return True

    def _extract_brief_aliases(
        self, story_brief: dict, aliases: tuple[str, ...], default=None
    ) -> Any:
        story_brief = story_brief or {}
        for name in aliases:
            if name in story_brief:
                value = self._unwrap_brief_value(story_brief[name])
                if self._brief_value_present(value):
                    return value
        fields = story_brief.get("fields", {})
        if isinstance(fields, dict):
            for name in aliases:
                if name in fields:
                    value = self._unwrap_brief_value(fields[name])
                    if self._brief_value_present(value):
                        return value
        return default

    def _extract_brief_field(self, story_brief: dict, field_name: str, default=None):
        """Compatibility helper for a direct key or old nested field."""
        return self._extract_brief_aliases(story_brief, (field_name,), default)

    def _brief_has_field(self, story_brief: dict, name: str) -> bool:
        if name in (story_brief or {}):
            return True
        fields = (story_brief or {}).get("fields", {})
        return isinstance(fields, dict) and name in fields

    def _extract_brief_context(self, story_brief: dict) -> dict:
        """Return only canonical intake and source values that are present."""
        definitions = (
            ("prompt", ("prompt", "topic", "description", "video_goal")),
            ("viewer_outcome", ("viewer_outcome",)),
            ("target_audience", ("target_audience",)),
            ("audience_level", ("audience_level",)),
            ("platform", ("platform",)),
            ("aspect_ratio", ("aspect_ratio",)),
            ("delivery_tone", ("delivery_tone",)),
            ("source_snapshot", ("source_snapshot", "source_context", "key_points")),
            ("sources", ("sources",)),
        )
        context = {}
        for canonical, aliases in definitions:
            value = self._extract_brief_aliases(story_brief, aliases)
            if self._brief_value_present(value):
                context[canonical] = value

        duration_value = self._extract_brief_aliases(
            story_brief, ("duration_seconds", "duration")
        )
        duration = self._parse_positive_duration(duration_value)
        if duration is not None:
            context["duration_seconds"] = duration

        formats_declared = self._brief_has_field(
            story_brief, "production_formats"
        ) or self._brief_has_field(story_brief, "broll_type")
        formats = self._get_allowed_screen_types(
            story_brief, fallback=formats_declared
        )
        if formats:
            context["production_formats"] = formats
        return context

    def _get_allowed_screen_types(
        self, story_brief: dict, fallback: bool = True
    ) -> list:
        """Use canonical production formats, with old visual fields as fallback."""
        uses_legacy_fields = not self._brief_has_field(
            story_brief, "production_formats"
        )
        formats = self._extract_brief_aliases(
            story_brief, ("production_formats",), []
        )
        if uses_legacy_fields:
            formats = self._extract_brief_aliases(story_brief, ("broll_type",), [])
        if isinstance(formats, str):
            formats = [formats] if formats else []

        additional = []
        if uses_legacy_fields:
            on_camera = self._extract_brief_aliases(
                story_brief, ("on_camera_presence",), ""
            )
            if str(on_camera).strip().lower() not in {
                "", "no", "none", "false", "0"
            }:
                additional.append("talking_head")

        return resolve_production_formats(
            formats,
            fallback_when_empty=fallback,
            additional=additional,
        )

    @staticmethod
    def _parse_positive_duration(value: Any) -> Optional[float]:
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, str):
            clean = re.sub(
                r"\s*(seconds?|secs?|s)\s*$", "", value.strip(), flags=re.IGNORECASE
            )
            value = clean
        try:
            duration = float(value)
        except (ValueError, TypeError):
            return None
        return duration if duration > 0 else None

    def _get_target_duration(self, story_brief: dict) -> float:
        """Get a safe positive target duration for deterministic budgeting."""
        value = self._extract_brief_aliases(
            story_brief, ("duration_seconds", "duration")
        )
        return self._parse_positive_duration(value) or 60.0

    # =========================================================================
    # Word Budget Computation & Per-Section Validation
    # =========================================================================

    def _compute_section_budgets(self, sections: list, allowed_types: list) -> None:
        """Add word_budget to each section dict based on target_seconds."""
        default_type = allowed_types[0] if allowed_types else "slides"
        for section in sections:
            target_sec = section.get("target_seconds", 0)
            if target_sec > 0:
                section["word_budget"] = self.duration_calculator.compute_word_budget(
                    target_sec, default_type
                )
            else:
                section["word_budget"] = 0

    def _validate_and_retry_sections(
        self, screens, sections, all_evidence, brief_context,
        allowed_types, project_id, revision_instruction=None,
        existing_storyboard=None, quality_feedback=None,
    ) -> list:
        """Validate each section's duration; retry individual failing sections."""
        screens_by_section: dict[int, list] = {}
        for s in screens:
            sec_num = s.get("section_number")
            if sec_num is not None:
                screens_by_section.setdefault(sec_num, []).append(s)

        section_map = {s["section_number"]: s for s in sections}

        for sec_num, sec_screens in list(screens_by_section.items()):
            section = section_map.get(sec_num)
            if not section:
                continue
            target_sec = section.get("target_seconds", 0)
            if target_sec <= 0:
                continue

            validation = self.duration_calculator.validate_section_duration(
                sec_screens, target_sec, self.SECTION_DURATION_TOLERANCE
            )
            if validation["is_valid"]:
                continue

            retry_screens = self._retry_section(
                section, sec_screens, validation, all_evidence,
                brief_context, allowed_types, project_id,
                revision_instruction, existing_storyboard, quality_feedback,
            )
            if retry_screens is not None:
                screens_by_section[sec_num] = retry_screens
            else:
                # Retry failed — annotate original screens with warning
                deviation = validation["deviation_percent"]
                direction = validation["direction"]
                for s in sec_screens:
                    note = s.get("action_notes", "")
                    s["action_notes"] = f"{note} [Duration warning: section {direction} target by {deviation:.0f}%]".strip()

        result = []
        for sec_num in sorted(screens_by_section.keys()):
            result.extend(screens_by_section[sec_num])
        return result

    def _retry_section(
        self, section, current_screens, validation, all_evidence,
        brief_context, allowed_types, project_id,
        revision_instruction=None, existing_storyboard=None,
        quality_feedback=None,
    ) -> Optional[list]:
        """Retry generation for a single failing section. Returns new screens or None."""
        title = section.get("title", "")
        title_prompt = render_prompt_value(title, 500)
        purpose_prompt = render_prompt_value(section.get("purpose", ""), 2000)
        target_sec = section.get("target_seconds", 0)
        word_budget = section.get("word_budget", 0)
        direction = validation["direction"]
        deviation = validation["deviation_percent"]

        evidence = all_evidence.get(title, [])
        evidence_text = self._format_evidence_for_prompt(evidence)
        tp_text = render_prompt_value(
            "\n".join(
                f"- {tp}" for tp in section.get("talking_points", [])
            ),
            5000,
        )

        if direction == "over":
            adjust = "SHORTEN voiceover text — cut filler, tighten phrasing, remove redundant screens."
        else:
            adjust = "EXPAND voiceover text — add detail, examples, or split concepts across more screens."

        revision_context = ""
        if revision_instruction:
            revision_context += (
                "\nOriginal revision request (continue to follow it exactly):\n"
                f"{render_prompt_value(revision_instruction, 2000)}\n"
            )
        if existing_storyboard is not None:
            revision_context += (
                "\nExisting storyboard supplied for this revision:\n"
                f"{render_prompt_value(existing_storyboard, 8000)}\n"
            )
        if quality_feedback:
            revision_context += (
                "\nHolistic review feedback to address:\n"
                f"{render_prompt_value(quality_feedback, 3000)}\n"
            )
        current_screen_context = render_prompt_value(current_screens, 6000)

        intake_context = self._format_brief_context_for_prompt(brief_context)
        prompt = f"""Rewrite ONLY the screens for Section {section['section_number']} — {title_prompt}.

The current section is {deviation:.0f}% {direction} its {target_sec}s target.
Word budget for this section: ~{word_budget} words.

Section details:
Purpose: {purpose_prompt}
Talking points:
{tp_text}

Supporting evidence:
{evidence_text}

Approved intake values:
{intake_context}

Current generated screens for this section:
{current_screen_context}
{revision_context}

{adjust}

Return a JSON array of screens for this section only. Each element has exactly 7 fields:
- screen_number (integer)
- section_number ({section['section_number']})
- section_title ("{title_prompt}")
- screen_type (one of: {', '.join(allowed_types)})
- voiceover_text
- visual_direction (array of 2-4 elements)
- action_notes"""

        try:
            response = self.call_llm(prompt, max_tokens=8000, temperature=0.5)
            parsed = self._extract_json(response)
        except Exception:
            return None

        if not parsed or not isinstance(parsed, list):
            return None

        retry_screens = self._post_process_screens(parsed, allowed_types)

        retry_validation = self.duration_calculator.validate_section_duration(
            retry_screens, target_sec, self.SECTION_DURATION_TOLERANCE
        )
        if retry_validation["is_valid"]:
            for s in retry_screens:
                s["section_number"] = section["section_number"]
                s["section_title"] = title
            return retry_screens

        return None

    # =========================================================================
    # Evidence Research Integration
    # =========================================================================

    def _get_evidence_for_section(self, evidence_research: dict, section_title: str) -> list:
        """
        Get evidence for a section from EvidenceResearcher output.
        Handles both v0317 (evidence_items) and v0316 (talking_points) schemas.
        Returns list of evidence dicts with high/medium confidence research blocks.
        """
        if not evidence_research:
            return []

        sections = evidence_research.get("sections", [])
        for section in sections:
            # Match by section title (fuzzy: check if title appears in section_title)
            ev_title = section.get("section_title", "")
            if section_title.lower() in ev_title.lower() or ev_title.lower() in f"section {section_title}".lower():
                results = []

                # v0317 schema: evidence_items
                if "evidence_items" in section:
                    for item in section.get("evidence_items", []):
                        for block in item.get("research_blocks", []):
                            if block.get("confidence") in ("high", "medium"):
                                results.append({
                                    "evidence_needed": item.get("evidence_needed", ""),
                                    "research_question": block.get("research_question", ""),
                                    "storyboard_usable_phrasing": block.get("storyboard_usable_phrasing", []),
                                    "full_answer": block.get("full_answer", ""),
                                    "sources": block.get("sources", []),
                                    "confidence": block.get("confidence", ""),
                                })
                # v0316 fallback: talking_points
                else:
                    for tp in section.get("talking_points", []):
                        for block in tp.get("research_blocks", []):
                            if block.get("confidence") in ("high", "medium"):
                                results.append({
                                    "talking_point": tp.get("talking_point", ""),
                                    "research_question": block.get("research_question", ""),
                                    "storyboard_usable_phrasing": block.get("storyboard_usable_phrasing", []),
                                    "full_answer": block.get("full_answer", ""),
                                    "sources": block.get("sources", []),
                                    "confidence": block.get("confidence", ""),
                                })
                return results

        return []

    def _format_evidence_for_prompt(self, evidence: list, research_brief: str = "") -> str:
        """Format evidence into prompt-friendly text for the Writer LLM."""
        if not evidence:
            return "No evidence research available for this section."

        lines = []
        for item in evidence:
            label = item.get("evidence_needed") or item.get("talking_point", "")
            lines.append(f"Evidence: {label}")
            phrasing = item.get("storyboard_usable_phrasing", [])
            if phrasing:
                lines.append("  Usable phrasing:")
                for p in phrasing:
                    lines.append(f"    - {p}")
            sources = item.get("sources", [])
            if sources:
                lines.append(f"  Sources: {'; '.join(sources)}")
            lines.append("")

        return render_prompt_value("\n".join(lines), 5000)

    # =========================================================================
    # Full Storyboard Prompt (single LLM call)
    # =========================================================================

    @staticmethod
    def _format_brief_context_for_prompt(brief_context: dict) -> str:
        labels = (
            ("prompt", "Video goal"),
            ("viewer_outcome", "Viewer outcome"),
            ("target_audience", "Target audience"),
            ("audience_level", "Audience level"),
            ("duration_seconds", "Total duration (seconds)"),
            ("platform", "Platform"),
            ("aspect_ratio", "Aspect ratio"),
            ("delivery_tone", "Delivery tone"),
            ("production_formats", "Production formats"),
            ("source_snapshot", "Source snapshot"),
            ("sources", "Sources"),
        )
        lines = []
        for key, label in labels:
            if key not in brief_context:
                continue
            value = brief_context[key]
            cap = 4000 if key in {"source_snapshot", "sources"} else 1000
            rendered = render_prompt_value(value, cap)
            lines.append(f"{label}: {rendered}")
        rendered_context = "\n".join(lines) or "No additional intake values were provided."
        return render_prompt_value(rendered_context, 10000)

    def _build_full_storyboard_prompt(
        self,
        sections: list,
        all_evidence: dict,
        full_outline: str,
        brief_context: dict,
        allowed_types: list,
        target_duration: float,
        revision_instruction: Optional[str] = None,
        existing_storyboard: Optional[list] = None,
        quality_feedback: Optional[str] = None,
    ) -> str:
        """Construct the user prompt for the full storyboard in one LLM call."""

        # Build per-section detail blocks
        section_blocks = []
        for section in sections:
            title = section.get("title", "")
            tp_text = "\n".join(f"  - {tp}" for tp in section.get("talking_points", [])) or "  - (none)"

            # Evidence research for this section
            evidence = all_evidence.get(title, [])
            evidence_text = self._format_evidence_for_prompt(evidence)

            target_sec = section.get("target_seconds", 0)
            word_budget = section.get("word_budget", 0)

            block = f"""### Section {section.get('section_number', '?')} — {title}
Purpose: {section.get('purpose', '')}
Entry assumption: {section.get('entry_assumption', 'None')}
Exit state: {section.get('exit_state', '')}
Target duration: {target_sec}s — Word budget: ~{word_budget} words

Talking points:
{tp_text}

Evidence research:
{evidence_text}"""
            section_blocks.append(block)

        # The duplicated outline views serve different purposes (verbatim edit
        # fidelity vs. computed budgets/evidence). Their 8k + 10k caps keep the
        # complete contextual payload below roughly 45k characters.
        sections_text = render_prompt_value("\n\n".join(section_blocks), 10000)

        revision_context = ""
        if existing_storyboard:
            existing_text = render_prompt_value(existing_storyboard, 8000)
            instruction_text = (
                f"\nUser instruction: {render_prompt_value(revision_instruction, 2000)}\n"
                if revision_instruction
                else ""
            )
            revision_context = f"""

=== EXISTING STORYBOARD ===
{existing_text}
{instruction_text}

Update the existing storyboard against the approved outline instead of regenerating it from scratch. Preserve unaffected screens and their exact details. Return the complete updated storyboard using the same exact screen schema.
"""
        elif revision_instruction:
            revision_context = f"""

=== REVISION REQUEST ===
Apply this instruction while producing the storyboard: {render_prompt_value(revision_instruction, 2000)}
"""

        feedback_context = ""
        if quality_feedback:
            feedback_context = f"""

=== HOLISTIC REVIEW FEEDBACK ===
Address this feedback in the result: {render_prompt_value(quality_feedback, 3000)}
"""

        intake_context = self._format_brief_context_for_prompt(brief_context)

        prompt = f"""Generate the COMPLETE storyboard for this video — all sections, all screens, in one pass.

=== APPROVED INTAKE ===
{intake_context}

=== REQUIRED SCREEN TYPES ===
The user selected these visual formats: {', '.join(allowed_types)}
Default behavior: USE these types. Every type the user selected should appear in at least one screen unless the content genuinely has no use for it — in which case, state the reason in that screen's action_notes.
You may use any type from the allowed list as many times as needed. But do NOT drop a user-selected type without justification.

=== FULL OUTLINE ===
{render_prompt_value(full_outline, 8000)}

=== SECTIONS WITH EVIDENCE ===
{sections_text}
{revision_context}
{feedback_context}

=== INSTRUCTIONS ===
**Word budget (hard):** Each section above has a word budget — the approximate number of voiceover words that will produce the target duration at ~2.2 words/second. Stay within ±20% of each section's word budget. This is the primary duration control mechanism.

**Constraints:**
- Every talking point from every section MUST appear in at least one screen's voiceover. Do not skip or vaguely paraphrase any talking point.
- The ONE principle for when to start a new screen: does the content need a different visual? If the visual stays the same, keep it in the current screen. If the viewer needs to see something new, start a new screen.
- Visuals must build progressively across the entire video — no resets between sections.
- The first screen of each section should transition naturally from the previous section's ending.
- Treat the video as one continuous narrative, not isolated section chunks.

Return a JSON array. Each element has exactly 7 fields:
- screen_number (integer, sequential from 1)
- section_number (integer, which section this screen belongs to)
- section_title (string, title of the section)
- screen_type (one of: {', '.join(allowed_types)})
- voiceover_text (as long as the visual stays the same — new screen only when the visual changes)
- visual_direction (array of 2–4 specific visual elements that EXPLAIN the voiceover content)
- action_notes (1–2 sentences: cognitive function + execution guidance)

Follow your system prompt rules strictly. Every sentence of voiceover must teach — no filler, no announcements, no motivation."""

        return prompt

    # =========================================================================
    # Post-Processing
    # =========================================================================

    def _post_process_screens(self, screens: list, allowed_types: list) -> list:
        """Add server-computed fields and split screens that exceed max duration."""
        processed = []
        for screen in screens:
            # Validate screen_type
            st = screen.get("screen_type", "slides")
            if st not in PLACEHOLDER_IMAGES or st not in allowed_types:
                st = allowed_types[0] if allowed_types else "slides"
            screen["screen_type"] = st

            # Calculate duration from voiceover word count
            voiceover = screen.get("voiceover_text", "")
            chunks = self.duration_calculator.split_voiceover(voiceover, st)
            if not chunks:
                chunks = [{
                    "voiceover_text": "",
                    "duration": self.duration_calculator.MIN_DURATION,
                }]

            for chunk_index, chunk in enumerate(chunks, start=1):
                chunk_screen = dict(screen)
                chunk_screen["voiceover_text"] = chunk["voiceover_text"]
                chunk_screen["duration"] = chunk["duration"]

                # Assign placeholder image
                chunk_screen["on_screen_visual"] = PLACEHOLDER_IMAGES.get(
                    st, "/placeholders/slides_and_diagrams.png"
                )

                # Ensure visual_direction is a list
                vd = chunk_screen.get("visual_direction", [])
                if isinstance(vd, str):
                    chunk_screen["visual_direction"] = [vd]
                elif not isinstance(vd, list):
                    chunk_screen["visual_direction"] = []

                # Ensure action_notes exists
                if "action_notes" not in chunk_screen:
                    chunk_screen["action_notes"] = ""

                if len(chunks) > 1:
                    note = "Auto-split from an overlong voiceover to keep spoken duration aligned with screen timing."
                    chunk_screen["action_notes"] = (
                        f"{chunk_screen['action_notes']} {note} Part {chunk_index} of {len(chunks)}."
                    ).strip()

                processed.append(chunk_screen)

        return processed

    # =========================================================================
    # Legacy Support
    # =========================================================================

    def _process_legacy_screens(self, screen_list: list, story_brief: dict) -> list:
        """Backward compat: process pre-built screen list by adding visual assets."""
        storyboard = []
        allowed_types = self._get_allowed_screen_types(story_brief)
        formats_declared = self._brief_has_field(
            story_brief, "production_formats"
        ) or self._brief_has_field(story_brief, "broll_type")
        assignments = legacy_section_assignments(screen_list)
        for index, (screen, section) in enumerate(
            zip(screen_list, assignments), start=1
        ):
            if not isinstance(screen, dict):
                raise ValueError("Legacy storyboard screens must be objects")
            migrated = dict(screen)
            original_screen_number = screen.get("screen_number")
            if (
                original_screen_number != index
                and original_screen_number is not None
            ):
                migrated.setdefault("legacy_screen_number", original_screen_number)
            original_section_number = screen.get("section_number")
            if (
                original_section_number != section[0]
                and original_section_number is not None
            ):
                migrated.setdefault("legacy_section_number", original_section_number)
            original_section_title = screen.get("section_title")
            if (
                original_section_title
                and str(original_section_title).strip() != section[1]
            ):
                migrated.setdefault("legacy_section_title", original_section_title)

            original_screen_type = screen.get("screen_type", "slides")
            resolved_type = resolve_production_formats(
                [original_screen_type], fallback_when_empty=False
            )
            screen_type = resolved_type[0] if resolved_type else allowed_types[0]
            if formats_declared and screen_type not in allowed_types:
                screen_type = allowed_types[0]
            if screen_type != original_screen_type:
                migrated.setdefault("legacy_screen_type", original_screen_type)
            voiceover = screen.get("voiceover_text")
            if not isinstance(voiceover, str):
                voiceover = screen.get("voiceover") or screen.get("Description") or ""
            visual_direction = screen.get("visual_direction", [])
            if isinstance(visual_direction, str):
                visual_direction = [visual_direction]
            elif not isinstance(visual_direction, list):
                visual_direction = []
            action_notes = screen.get("action_notes")
            if not isinstance(action_notes, str):
                action_notes = screen.get("Notes") or ""
            duration = screen.get("duration", 6.0)
            if (
                isinstance(duration, bool)
                or not isinstance(duration, (int, float))
                or duration <= 0
            ):
                duration = 6.0

            migrated.update(
                {
                    "screen_number": index,
                    "section_number": section[0],
                    "section_title": section[1],
                    "screen_type": screen_type,
                    "duration": duration,
                    "voiceover_text": str(voiceover),
                    "visual_direction": visual_direction,
                    "on_screen_visual": screen.get("on_screen_visual")
                    or PLACEHOLDER_IMAGES.get(
                        screen_type, "/placeholders/slides_and_diagrams.png"
                    ),
                    "action_notes": str(action_notes),
                }
            )
            storyboard.append(migrated)
        return storyboard

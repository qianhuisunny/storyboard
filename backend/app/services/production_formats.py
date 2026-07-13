"""Canonical production-format normalization shared by Writer and QualityGate."""

from typing import Any


VALID_SCREEN_TYPES = {
    "screen_recording",
    "slides",
    "whiteboard_animation",
    "whiteboard",
    "code_editor",
    "stock_footage",
    "real_world",
    "talking_head",
    "talking_head_with_split_screens",
    "talking_head_left_with_notes",
}

LEGACY_PRODUCTION_FORMAT_MAP = {
    "slides": "slides",
    "whiteboard_animation": "whiteboard_animation",
    "whiteboard": "whiteboard_animation",
    "diagrams": "whiteboard_animation",
    "screen_recording": "screen_recording",
    "code_editor": "code_editor",
    "stock_footage": "stock_footage",
    "real_world": "real_world",
    "talking_head": "talking_head",
    "talking_head_with_split_screens": "talking_head_with_split_screens",
    "talking_head_left_with_notes": "talking_head_left_with_notes",
}


def normalize_production_formats(value: Any) -> list[str]:
    """Normalize legacy aliases, remove unknown values, and preserve order."""
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple, set)):
        return []
    normalized = []
    for item in value:
        raw = str(item).lower().strip()
        mapped = LEGACY_PRODUCTION_FORMAT_MAP.get(raw, raw)
        if mapped in VALID_SCREEN_TYPES and mapped not in normalized:
            normalized.append(mapped)
    return normalized

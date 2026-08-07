"""Deterministically map persisted list outlines onto canonical sections."""

from typing import Any


def _positive_integer(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def legacy_section_assignments(screen_list: list[Any]) -> list[tuple[int, str]]:
    """Return one canonical section identity per persisted legacy screen."""
    key_to_number: dict[tuple[str, Any], int] = {}
    key_to_title: dict[tuple[str, Any], str] = {}
    assignments = []

    for screen in screen_list:
        data = screen if isinstance(screen, dict) else {}
        raw_number = _positive_integer(data.get("section_number"))
        raw_title = data.get("section_title") or data.get("section_name")
        title = str(raw_title).strip() if raw_title is not None else ""
        if raw_number is not None:
            key = ("number", raw_number)
        elif title:
            key = ("title", title)
        else:
            key = ("default", 1)

        if key not in key_to_number:
            canonical_number = len(key_to_number) + 1
            key_to_number[key] = canonical_number
            key_to_title[key] = title or f"Legacy Section {canonical_number}"
        assignments.append((key_to_number[key], key_to_title[key]))

    return assignments


def legacy_outline_sections(screen_list: list[Any]) -> list[tuple[int, str]]:
    """Return ordered unique section pairs for QualityGate cross-stage checks."""
    sections = []
    seen = set()
    for section in legacy_section_assignments(screen_list):
        if section[0] not in seen:
            sections.append(section)
            seen.add(section[0])
    return sections

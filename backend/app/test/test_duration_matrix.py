"""
Duration Matrix Integration Tests — 10 scenarios exercising the full pipeline
with real DurationCalculator, state machine, quality_log, and outline validation.
Only LLM calls are mocked.
"""

import math
import sqlite3
import pytest
from unittest.mock import patch

from app.services.orchestrator import StoryboardOrchestrator
from app.services.agents.storyboard_writer import StoryboardWriter
from app.services.agents.duration_calculator import DurationCalculator
from app.services.state import StateManager
from app.infra.quality_log import QualityLog

from conftest import MockBriefBuilder, MockQualityGate


# =========================================================================
# Helpers
# =========================================================================

_CALC = DurationCalculator()


def words_for_duration(target_seconds: float, screen_type: str) -> str:
    """Generate voiceover text whose word count yields target_seconds via DurationCalculator."""
    buffer = _CALC.COMPLEXITY_BUFFERS.get(screen_type, 0.5)
    raw_wc = (target_seconds - buffer) * _CALC.WORDS_PER_SECOND
    wc = max(1, round(raw_wc))
    # Forward-check and adjust ±1 word until we hit the target
    text = " ".join(f"word{i}" for i in range(wc))
    result = _CALC.calculate(text, screen_type)
    if result["duration"] != target_seconds and wc > 1:
        for adj in (wc - 1, wc + 1):
            t = " ".join(f"word{i}" for i in range(adj))
            r = _CALC.calculate(t, screen_type)
            if r["duration"] == target_seconds:
                return t
    return text


def make_outline(sections: list[dict]) -> str:
    """Build Director-format outline text from section specs."""
    blocks = []
    for s in sections:
        tps = "\n".join(f"- {tp}" for tp in s.get("talking_points", ["Key concept to cover."]))
        duration = s.get("target_seconds", s.get("target_seconds", "60"))
        blocks.append(
            f"Section {s['number']} \u2014 {s['title']}\n\n"
            f"Purpose\n{s.get('purpose', 'Teach the viewer a concept.')}\n\n"
            f"Entry assumption\n{s.get('entry_assumption', 'Viewer has basic context.')}\n\n"
            f"Exit state\n{s.get('exit_state', 'Viewer understands the concept.')}\n\n"
            f"Duration\n{duration}\n\n"
            f"Talking points\n{tps}"
        )
    return "\n\n".join(blocks)


def make_screens(specs: list[dict]) -> list[dict]:
    """Build Writer-format screen list from screen specifications."""
    screens = []
    for i, spec in enumerate(specs, 1):
        screens.append({
            "screen_number": i,
            "section_number": spec["section_number"],
            "section_title": spec.get("section_title", f"Section {spec['section_number']}"),
            "screen_type": spec["screen_type"],
            "voiceover_text": words_for_duration(spec["target_duration"], spec["screen_type"]),
            "visual_direction": ["Visual element 1", "Visual element 2"],
            "action_notes": "Teaching the concept.",
        })
    return screens


def make_brief(duration_seconds: int, **overrides) -> dict:
    """Build KS-format story_brief."""
    fields = {
        "topic": {"value": overrides.pop("topic", "Test Topic"), "source": "extracted", "confirmed": True},
        "viewer_outcome": {"value": "Understand the concept", "source": "extracted", "confirmed": True},
        "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
        "audience_level": {"value": "intermediate", "source": "extracted", "confirmed": True},
        "duration": {"value": str(duration_seconds), "source": "extracted", "confirmed": True},
        "platform": {"value": "youtube", "source": "extracted", "confirmed": True},
        "delivery_tone": {"value": "educational", "source": "extracted", "confirmed": True},
        "point_of_view": {"value": "Practical perspective", "source": "generated", "confirmed": True},
        "core_talking_points": {"value": ["Point A", "Point B", "Point C"], "source": "generated", "confirmed": True},
        "on_camera_presence": {"value": "yes", "source": "extracted", "confirmed": True},
        "broll_type": {"value": ["slides", "talking_head"], "source": "extracted", "confirmed": True},
    }
    for k, v in overrides.items():
        fields[k] = {"value": v, "source": "extracted", "confirmed": True}
    return {"fields": fields}


def query_qlog(db_path, project_id: str) -> list[dict]:
    """Query all quality_log entries for a project."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM quality_log WHERE project_id = ? ORDER BY id", (project_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _make_n_screens(section_specs: list[tuple], screen_type="slides") -> list[dict]:
    """
    Quick helper: section_specs = [(section_number, count, per_screen_duration), ...]
    Returns a flat screen list.
    """
    specs = []
    for sec_num, count, dur in section_specs:
        for _ in range(count):
            specs.append({
                "section_number": sec_num,
                "section_title": f"Section {sec_num}",
                "screen_type": screen_type,
                "target_duration": dur,
            })
    return make_screens(specs)


# =========================================================================
# Fixtures
# =========================================================================


@pytest.fixture
def patch_qlog(tmp_path, monkeypatch):
    """Monkeypatch qlog singleton to use temp DB."""
    test_qlog = QualityLog(db_path=tmp_path / "quality_test.db")
    monkeypatch.setattr("app.infra.quality_log.qlog", test_qlog)
    return test_qlog


class FixedDirector:
    """Director mock that returns a predetermined outline."""
    prompt_file = "storyboard_director_prompt_v0324.md"

    def __init__(self, outline_text: str):
        self._outline = outline_text

    def run(self, state, **kwargs):
        return self._outline

    def regenerate_section(self, *a, **kw):
        return self._outline

    def refine_outline(self, *a, **kw):
        return self._outline


@pytest.fixture
def tmp_data_dir(tmp_path):
    return tmp_path


@pytest.fixture
def patch_state_manager(tmp_data_dir, monkeypatch):
    _original_init = StateManager.__init__
    def _patched_init(self, project_id, data_dir=None):
        _original_init(self, project_id, data_dir=tmp_data_dir)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched_init)


def _build_orchestrator(outline_text, screen_responses, monkeypatch):
    """
    Build an orchestrator with:
    - MockBriefBuilder
    - FixedDirector returning outline_text
    - Real StoryboardWriter with _call_storyboard_llm mocked
    - MockQualityGate (calls agent.run → triggers real Writer logic)
    """
    writer = StoryboardWriter()
    call_counter = {"i": 0}

    def fake_call_storyboard_llm(user_prompt, project_id=None):
        idx = call_counter["i"]
        call_counter["i"] += 1
        if idx < len(screen_responses):
            return list(screen_responses[idx])
        return list(screen_responses[-1])

    monkeypatch.setattr(writer, "_call_storyboard_llm", fake_call_storyboard_llm)

    orch = StoryboardOrchestrator()
    orch.agents = {
        "brief_builder": MockBriefBuilder(),
        "director": FixedDirector(outline_text),
        "writer": writer,
    }
    qg = MockQualityGate()
    qg.model = "gpt-4o-test"
    orch.quality_gate = qg
    return orch, call_counter


async def run_ks_to_gate2(orch, project_id, duration_seconds):
    """Drive orchestrator through the streamlined KS brief flow to gate2."""
    duration_minutes = duration_seconds / 60

    await orch.process_event(project_id, "submit_knowledge_share", {
        "intake_form": {
            "topic": "Test Topic",
            "video_type": "knowledge_sharing",
            "target_audience": "Engineers",
            "duration_minutes": duration_minutes,
        }
    })
    r = await orch.process_event(project_id, "chat_brief_approve", {
        "all_fields": {
            "topic": {"value": "Test Topic", "source": "extracted", "confirmed": True},
            "viewer_outcome": {"value": "Understand concept", "source": "extracted", "confirmed": True},
            "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
            "duration": {"value": str(duration_seconds), "source": "extracted", "confirmed": True},
            "audience_level": {"value": "intermediate", "source": "extracted", "confirmed": True},
            "platform": {"value": "youtube", "source": "extracted", "confirmed": True},
            "on_camera_presence": {"value": "yes", "source": "extracted", "confirmed": True},
            "broll_type": {"value": ["slides", "talking_head"], "source": "extracted", "confirmed": True},
            "delivery_tone": {"value": "educational", "source": "extracted", "confirmed": True},
            "point_of_view": {"value": "Practical perspective", "source": "extracted", "confirmed": True},
            "core_talking_points": {"value": ["Point A", "Point B", "Point C"], "source": "generated", "confirmed": True},
        }
    })
    assert r["success"] is True, f"chat_brief_approve failed: {r.get('error')}"
    r = await orch.process_event(project_id, "approve", {})
    assert r["success"] is True, f"gate1 approve failed: {r.get('error')}"
    return r


def _common_storyboard_asserts(storyboard, target_seconds, tolerance=0.10):
    """Shared assertions for all successful storyboard tests."""
    assert isinstance(storyboard, list)
    assert len(storyboard) > 0

    total = sum(s["duration"] for s in storyboard)
    deviation = abs(total - target_seconds) / target_seconds
    assert deviation <= tolerance, (
        f"Duration {total:.1f}s deviates {deviation*100:.1f}% from target {target_seconds}s "
        f"(tolerance {tolerance*100}%)"
    )

    for s in storyboard:
        assert s["duration"] >= _CALC.MIN_DURATION, f"Screen {s['screen_number']} duration {s['duration']} < min {_CALC.MIN_DURATION}"
        assert s["duration"] <= _CALC.MAX_DURATION, f"Screen {s['screen_number']} duration {s['duration']} > max {_CALC.MAX_DURATION}"

    numbers = [s["screen_number"] for s in storyboard]
    assert numbers == list(range(1, len(storyboard) + 1)), f"Non-sequential numbering: {numbers}"


# =========================================================================
# Test 1: Short (60s) — 2 sections, ~8 screens
# =========================================================================

@pytest.mark.asyncio
async def test_short_60s(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 60
    outline = make_outline([
        {"number": 1, "title": "Hook and Context", "target_seconds": 15,
         "talking_points": ["Set the stage for the concept"]},
        {"number": 2, "title": "Core Idea and Takeaway", "target_seconds": 45,
         "talking_points": ["Explain the main idea", "Action step"]},
    ])
    screens = _make_n_screens([
        (1, 2, 7.5),   # 2 screens at 7.5s = 15s
        (2, 6, 7.5),   # 6 screens at 7.5s = 45s  → total 60s
    ])

    orch, counter = _build_orchestrator(outline, [screens], monkeypatch)
    await run_ks_to_gate2(orch, "test-short-60", target)
    r = await orch.process_event("test-short-60", "approve", {})
    assert r["success"], f"gate2 approve failed: {r.get('error')}"

    storyboard = r["storyboard"]
    _common_storyboard_asserts(storyboard, target)
    assert counter["i"] == 1  # no retry needed

    logs = query_qlog(patch_qlog._db_path, "test-short-60")
    generate_events = [l for l in logs if l["event"] == "generate"]
    assert len(generate_events) >= 1, f"Expected quality_log generate entries, got {len(logs)} total"
    stages = {l["stage"] for l in generate_events}
    assert "outline" in stages, "Missing outline generate event"
    assert "storyboard" in stages, "Missing storyboard generate event"


# =========================================================================
# Test 2: Standard (120s) — 3 sections, ~14 screens
# =========================================================================

@pytest.mark.asyncio
async def test_standard_120s(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 120
    outline = make_outline([
        {"number": 1, "title": "Introduction", "target_seconds": 32,
         "talking_points": ["Why this matters"]},
        {"number": 2, "title": "Deep Dive", "target_seconds": 54,
         "talking_points": ["Core concept explained", "Example walkthrough"]},
        {"number": 3, "title": "Wrap Up", "target_seconds": 34,
         "talking_points": ["Key takeaway", "Next steps"]},
    ])
    screens = _make_n_screens([
        (1, 4, 8.0),   # 32s
        (2, 6, 9.0),   # 54s
        (3, 4, 8.5),   # 34s → total 120s
    ])

    orch, counter = _build_orchestrator(outline, [screens], monkeypatch)
    await run_ks_to_gate2(orch, "test-std-120", target)
    r = await orch.process_event("test-std-120", "approve", {})
    assert r["success"]

    _common_storyboard_asserts(r["storyboard"], target)


# =========================================================================
# Test 3: Medium (180s) — 4 sections, ~20 screens, seconds format
# =========================================================================

@pytest.mark.asyncio
async def test_medium_180s(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 180
    outline = make_outline([
        {"number": 1, "title": "The Problem", "target_seconds": 30,
         "talking_points": ["Problem statement"]},
        {"number": 2, "title": "The Approach", "target_seconds": 51,
         "talking_points": ["Methodology", "Tools"]},
        {"number": 3, "title": "Results", "target_seconds": 54,
         "talking_points": ["Findings", "Data"]},
        {"number": 4, "title": "Next Steps", "target_seconds": 45,
         "talking_points": ["Action items"]},
    ])
    screens = _make_n_screens([
        (1, 4, 7.5),   # 30s
        (2, 6, 8.5),   # 51s
        (3, 6, 9.0),   # 54s
        (4, 5, 9.0),   # 45s → total 180s
    ])

    orch, _ = _build_orchestrator(outline, [screens], monkeypatch)
    await run_ks_to_gate2(orch, "test-med-180", target)
    r = await orch.process_event("test-med-180", "approve", {})
    assert r["success"]
    _common_storyboard_asserts(r["storyboard"], target)


# =========================================================================
# Test 4: Long (300s) — 5 sections, ~34 screens, mm:ss format
# =========================================================================

@pytest.mark.asyncio
async def test_long_300s(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 300
    outline = make_outline([
        {"number": 1, "title": "Context Setting", "target_seconds": 34,
         "talking_points": ["Background"]},
        {"number": 2, "title": "First Pillar", "target_seconds": 60,
         "talking_points": ["Pillar one explained"]},
        {"number": 3, "title": "Second Pillar", "target_seconds": 76,
         "talking_points": ["Pillar two explained"]},
        {"number": 4, "title": "Third Pillar", "target_seconds": 60,
         "talking_points": ["Pillar three explained"]},
        {"number": 5, "title": "Synthesis", "target_seconds": 70,
         "talking_points": ["Bringing it together"]},
    ])
    screens = _make_n_screens([
        (1, 4, 8.5),   # 34s
        (2, 7, 8.5),   # 59.5s
        (3, 9, 8.5),   # 76.5s
        (4, 7, 8.5),   # 59.5s
        (5, 8, 9.0),   # 72s → total ~301.5s
    ])

    orch, _ = _build_orchestrator(outline, [screens], monkeypatch)
    await run_ks_to_gate2(orch, "test-long-300", target)
    r = await orch.process_event("test-long-300", "approve", {})
    assert r["success"]
    _common_storyboard_asserts(r["storyboard"], target)


# =========================================================================
# Test 5: Very long (600s) — 7 sections, ~68 screens
# =========================================================================

@pytest.mark.asyncio
async def test_very_long_600s(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 600
    outline = make_outline([
        {"number": i, "title": f"Topic {i}", "target_seconds": target_sec,
         "talking_points": [f"Concept {i}"]}
        for i, target_sec in enumerate([51, 81, 90, 99, 81, 90, 108], 1)
    ])
    screens = _make_n_screens([
        (1, 6, 8.5),    # 51s
        (2, 9, 9.0),    # 81s
        (3, 10, 9.0),   # 90s
        (4, 11, 9.0),   # 99s
        (5, 9, 9.0),    # 81s
        (6, 10, 9.0),   # 90s
        (7, 12, 9.0),   # 108s → total 600s
    ])

    orch, _ = _build_orchestrator(outline, [screens], monkeypatch)
    await run_ks_to_gate2(orch, "test-vlong-600", target)
    r = await orch.process_event("test-vlong-600", "approve", {})
    assert r["success"]
    _common_storyboard_asserts(r["storyboard"], target)


# =========================================================================
# Test 6: Overlong voiceover triggers split_voiceover
# =========================================================================

@pytest.mark.asyncio
async def test_overlong_voiceover_triggers_split(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 60
    outline = make_outline([
        {"number": 1, "title": "Hook", "target_seconds": 15,
         "talking_points": ["Set the stage"]},
        {"number": 2, "title": "Main Content", "target_seconds": 45,
         "talking_points": ["Core idea"]},
    ])

    # Screen 2 has ~60 words → ~28s for slides → exceeds 12s max → will split
    overlong_voiceover = " ".join(f"word{i}" for i in range(60))
    raw_screens = [
        {
            "screen_number": 1, "section_number": 1, "section_title": "Hook",
            "screen_type": "slides",
            "voiceover_text": words_for_duration(7.5, "slides"),
            "visual_direction": ["V1", "V2"], "action_notes": "Hook.",
        },
        {
            "screen_number": 2, "section_number": 2, "section_title": "Main Content",
            "screen_type": "slides",
            "voiceover_text": overlong_voiceover,
            "visual_direction": ["V1", "V2"], "action_notes": "Core.",
        },
        {
            "screen_number": 3, "section_number": 2, "section_title": "Main Content",
            "screen_type": "talking_head",
            "voiceover_text": words_for_duration(7.5, "talking_head"),
            "visual_direction": ["V1", "V2"], "action_notes": "Wrap.",
        },
    ]

    orch, _ = _build_orchestrator(outline, [raw_screens], monkeypatch)
    await run_ks_to_gate2(orch, "test-split", target)

    # The total will be off because we intentionally have an overlong voiceover
    # that expands to more screens. We care about the splitting behavior, not
    # the tolerance check. If the writer raises ValueError for duration drift,
    # catch it and inspect the writer's internal state instead.
    writer = orch.agents["writer"]

    # Call the writer directly to inspect post-processing behavior
    from app.services.state import StoryboardState
    state = StoryboardState(
        project_id="test-split-direct",
        phase="write",
        story_brief=make_brief(target),
        screen_outline=outline,
    )
    # Monkeypatch _call_storyboard_llm on this writer instance
    monkeypatch.setattr(writer, "_call_storyboard_llm", lambda prompt, pid=None: list(raw_screens))

    # Test _post_process_screens directly
    processed = writer._post_process_screens(list(raw_screens), ["slides", "talking_head"])

    # The overlong screen should have been split
    assert len(processed) > len(raw_screens), (
        f"Expected split: input {len(raw_screens)} screens, got {len(processed)}"
    )

    # All screens must be within duration limits
    for s in processed:
        assert s["duration"] <= _CALC.MAX_DURATION, (
            f"Screen duration {s['duration']} exceeds max {_CALC.MAX_DURATION}"
        )
        assert s["duration"] >= _CALC.MIN_DURATION

    # Split screens should have "Auto-split" in action_notes
    split_screens = [s for s in processed if "Auto-split" in s.get("action_notes", "")]
    assert len(split_screens) >= 2, f"Expected auto-split annotations, found {len(split_screens)}"

    # Total word count should be preserved
    original_words = sum(len(s["voiceover_text"].split()) for s in raw_screens)
    processed_words = sum(len(s["voiceover_text"].split()) for s in processed)
    assert processed_words == original_words, (
        f"Word count mismatch: {original_words} → {processed_words}"
    )


# =========================================================================
# Test 7: Section over budget — per-section retry succeeds
# =========================================================================

@pytest.mark.asyncio
async def test_section_over_budget_retry_succeeds(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 60
    outline = make_outline([
        {"number": 1, "title": "Hook", "target_seconds": 15,
         "talking_points": ["Set the stage"]},
        {"number": 2, "title": "Main", "target_seconds": 45,
         "talking_points": ["Core idea"]},
    ])

    # Section 1 is on budget, section 2 is ~33% over (exceeds ±20%)
    screens = _make_n_screens([
        (1, 2, 7.5),    # 15s — on target
        (2, 6, 10.0),   # 60s — 33% over 45s target
    ])

    orch, counter = _build_orchestrator(outline, [screens], monkeypatch)

    # Mock the per-section retry LLM call to return good screens
    writer = orch.agents["writer"]
    good_section2 = _make_n_screens([(2, 5, 9.0)])  # ~45s
    original_call_llm = writer.call_llm

    def mock_retry_call_llm(prompt, **kwargs):
        return str(good_section2)

    monkeypatch.setattr(writer, "call_llm", mock_retry_call_llm)
    monkeypatch.setattr(writer, "_extract_json", lambda _: list(good_section2))

    await run_ks_to_gate2(orch, "test-retry-ok", target)
    r = await orch.process_event("test-retry-ok", "approve", {})

    assert r["success"], f"Expected success after per-section retry: {r.get('error')}"


# =========================================================================
# Test 8: All section retries fail → pipeline succeeds with warnings
# =========================================================================

@pytest.mark.asyncio
async def test_section_retry_fails_adds_warning(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 60
    outline = make_outline([
        {"number": 1, "title": "Hook", "target_seconds": 15,
         "talking_points": ["Set the stage"]},
        {"number": 2, "title": "Main", "target_seconds": 45,
         "talking_points": ["Core idea"]},
    ])

    # Both sections over budget
    screens = _make_n_screens([
        (1, 3, 10.0),   # 30s — 100% over 15s target
        (2, 6, 10.0),   # 60s — 33% over 45s target
    ])

    orch, counter = _build_orchestrator(outline, [screens], monkeypatch)

    # Make per-section retry also return over-budget screens
    writer = orch.agents["writer"]
    monkeypatch.setattr(writer, "call_llm", lambda prompt, **kw: "[]")
    monkeypatch.setattr(writer, "_extract_json", lambda _: None)

    await run_ks_to_gate2(orch, "test-retry-fail", target)
    r = await orch.process_event("test-retry-fail", "approve", {})

    # Pipeline succeeds — no more ValueError crash
    assert r["success"] is True, f"Expected success with warnings, got: {r.get('error')}"
    storyboard = r["storyboard"]
    warned = [s for s in storyboard if "Duration warning" in s.get("action_notes", "")]
    assert len(warned) > 0, "Expected warning annotations on over-budget sections"


# =========================================================================
# Test 9: Missing Duration field → validate_outline_contract fails fast
# =========================================================================

@pytest.mark.asyncio
async def test_missing_duration_field_fails_fast(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 60
    # Outline missing the Duration field entirely
    bad_outline = (
        "Section 1 \u2014 Introduction\n\n"
        "Purpose\nTeach the concept.\n\n"
        "Entry assumption\nViewer knows basics.\n\n"
        "Exit state\nViewer understands.\n\n"
        "Talking points\n- Key concept\n"
    )

    # Screens should never be reached
    screens = _make_n_screens([(1, 4, 8.0)])

    orch, counter = _build_orchestrator(bad_outline, [screens], monkeypatch)
    await run_ks_to_gate2(orch, "test-no-dur", target)

    r = await orch.process_event("test-no-dur", "approve", {})
    assert r["success"] is False
    assert "duration" in r.get("error", "").lower() or "missing" in r.get("error", "").lower(), (
        f"Expected 'missing Duration' error, got: {r.get('error')}"
    )
    # Writer LLM should never be called — validation fails before writer runs
    assert counter["i"] == 0, f"Writer LLM was called {counter['i']} times but should not have been"


# =========================================================================
# Test 10: Legacy range formats parsed via _parse_target_seconds fallback
# =========================================================================

@pytest.mark.asyncio
async def test_legacy_range_formats_backward_compat(tmp_path, monkeypatch, patch_qlog):
    _orig = StateManager.__init__
    def _patched(self, pid, data_dir=None):
        _orig(self, pid, data_dir=tmp_path)
    monkeypatch.setattr("app.services.state.StateManager.__init__", _patched)

    target = 300
    # Legacy v0324 outlines used range strings — _parse_target_seconds converts
    # them to midpoint integers via _parse_duration_range fallback
    outline = make_outline([
        {"number": 1, "title": "Part A", "target_seconds": "1:30\u20132:00",  # mm:ss → midpoint 105
         "talking_points": ["Concept A"]},
        {"number": 2, "title": "Part B", "target_seconds": "1.5\u20132 min",  # minutes → midpoint 105
         "talking_points": ["Concept B"]},
        {"number": 3, "title": "Part C", "target_seconds": "90\u2013120",     # seconds → midpoint 105
         "talking_points": ["Concept C"]},
    ])

    # Verify _parse_target_seconds handles legacy formats → midpoint integers
    writer = StoryboardWriter()
    assert writer._parse_target_seconds("1:30\u20132:00") == 105   # (90+120)//2
    assert writer._parse_target_seconds("1.5\u20132 min") == 105
    assert writer._parse_target_seconds("90\u2013120") == 105

    # Also verify native integer formats
    assert writer._parse_target_seconds("90") == 90
    assert writer._parse_target_seconds("90 seconds") == 90
    assert writer._parse_target_seconds("90s") == 90

    # Screens roughly matching midpoint targets (105s each)
    screens = _make_n_screens([
        (1, 12, 8.5),   # 102s
        (2, 12, 8.5),   # 102s
        (3, 11, 8.5),   # 93.5s → total ~297.5s
    ])

    orch, _ = _build_orchestrator(outline, [screens], monkeypatch)
    await run_ks_to_gate2(orch, "test-mixed-fmt", target)
    r = await orch.process_event("test-mixed-fmt", "approve", {})
    assert r["success"], f"Failed: {r.get('error')}"
    _common_storyboard_asserts(r["storyboard"], target)

    logs = query_qlog(patch_qlog._db_path, "test-mixed-fmt")
    generate_events = [l for l in logs if l["event"] == "generate"]
    assert len(generate_events) >= 1, "Expected quality_log entries for legacy format test"

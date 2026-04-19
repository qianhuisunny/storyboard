"""Tests for batch report aggregation (no LLM calls)."""


def test_parse_duration_midpoint():
    from app.services.offline_prompt_bench import _parse_duration_midpoint

    assert _parse_duration_midpoint("1:30–2:00") == 105  # (90+120)/2
    assert _parse_duration_midpoint("3:00") == 180
    assert _parse_duration_midpoint("0:45–1:15") == 60  # (45+75)/2
    assert _parse_duration_midpoint("") == 0
    assert _parse_duration_midpoint("bad") == 0


def test_compute_batch_report_empty():
    from app.services.offline_prompt_bench import compute_batch_report

    report = compute_batch_report([], [])
    assert report["videos_completed"] == 0
    assert report["videos_failed"] == 0
    assert report["descriptive_stats"]["outline"]["section_count"]["gold_avg"] == 0


def test_compute_batch_report_with_data(tmp_path, monkeypatch):
    """Test aggregation with mocked cached eval data."""
    import json
    from app.services.offline_prompt_bench import compute_batch_report, GOLD_SETS_DIR
    from app.services import offline_prompt_bench_gold
    import app.services.offline_prompt_bench as eb

    # Create fake gold set dirs with cached evals
    fake_dir = tmp_path / "gold_sets"
    for name in ["video_a", "video_b"]:
        d = fake_dir / name
        d.mkdir(parents=True)
        cached = {
            "analysis": {
                "director": {
                    "section_count": {"gold": 5, "ai": 4},
                    "ai_duration_estimate": "5:00–6:00",
                    "gold_duration_sec": 300,
                },
                "writer_path_b": {
                    "screen_count": {"gold": 10, "ai": 12},
                    "avg_words_per_screen": {"gold": 100, "ai": 50},
                    "ai_total_duration_sec": 280,
                },
            },
            "judge": {
                "outline_quality": {
                    "flow_coherence": {"tags": ["abrupt_transition"], "notes": "test"},
                    "brief_pov_alignment": {"tags": [], "notes": ""},
                },
                "storyboard_quality": {
                    "context_rot": {"tags": ["empty_elaboration"], "notes": "test"},
                },
            },
        }
        (d / "cached_eval.json").write_text(json.dumps(cached))

    # Monkeypatch GOLD_SETS_DIR and get_cached_eval
    monkeypatch.setattr(offline_prompt_bench_gold, "GOLD_SETS_DIR", fake_dir)
    monkeypatch.setattr(eb, "GOLD_SETS_DIR", fake_dir)
    monkeypatch.setattr(eb, "BATCH_REPORT_PATH", fake_dir / "batch_report.json")

    def mock_get_cached(name):
        p = fake_dir / name / "cached_eval.json"
        if p.exists():
            return json.loads(p.read_text())
        return None
    monkeypatch.setattr(eb, "get_cached_eval", mock_get_cached)

    report = compute_batch_report(["video_a", "video_b"], [])

    assert report["videos_completed"] == 2
    assert report["descriptive_stats"]["outline"]["section_count"]["gold_avg"] == 5.0
    assert report["descriptive_stats"]["outline"]["section_count"]["ai_avg"] == 4.0
    assert report["descriptive_stats"]["storyboard"]["screen_count"]["gold_avg"] == 10.0
    # Tag frequency
    assert report["tag_frequency"]["outline"]["abrupt_transition"]["count"] == 2
    assert report["tag_frequency"]["storyboard"]["empty_elaboration"]["count"] == 2
    assert len(report["tag_frequency"]["outline"]["abrupt_transition"]["videos"]) == 2

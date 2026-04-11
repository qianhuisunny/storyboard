import os
import tempfile
from unittest.mock import patch, MagicMock

import pytest

from video.stock_video import (
    generate_pexels_query,
    search_pexels,
    pick_best_video,
    _pick_best_variant,
    PexelsError,
)


# ---------- generate_pexels_query ----------

def test_generate_pexels_query_uses_llm_and_cleans_output():
    """The LLM is asked for a short query; we clean punctuation + whitespace.

    Ensures:
      - We pass the visual_direction bullets in a prompt
      - We strip quotes, punctuation, and collapse whitespace
      - We lowercase the result
    """
    mock_msg = MagicMock()
    mock_msg.content = '  "Woman, Whiteboard; presenting!"  '
    mock_choice = MagicMock(message=mock_msg)
    mock_response = MagicMock(choices=[mock_choice])

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    q = generate_pexels_query(
        [
            "Professional woman presenting at whiteboard",
            "Clean modern office background",
        ],
        client=mock_client,
    )
    assert q == "woman whiteboard presenting"
    # Verify the call used gpt-4o and low temperature
    mock_client.chat.completions.create.assert_called_once()
    call_kwargs = mock_client.chat.completions.create.call_args.kwargs
    assert call_kwargs["model"] == "gpt-4o"
    assert call_kwargs["temperature"] <= 0.3
    assert len(call_kwargs["messages"]) == 2
    assert "Professional woman" in call_kwargs["messages"][1]["content"]


# ---------- search_pexels ----------

def _pexels_success_response(videos):
    m = MagicMock()
    m.status_code = 200
    m.json.return_value = {"videos": videos, "total_results": len(videos)}
    return m


def _pexels_error_response(status_code, text="err"):
    m = MagicMock()
    m.status_code = status_code
    m.json.return_value = {}
    m.text = text
    return m


def test_search_pexels_returns_videos_on_success():
    with patch("video.stock_video.httpx.get") as mock_get:
        mock_get.return_value = _pexels_success_response([
            {"id": 1, "duration": 11, "video_files": []},
            {"id": 2, "duration": 23, "video_files": []},
        ])
        result = search_pexels("test query", api_key="fake-key")
        assert len(result) == 2
        # Auth header + orientation param
        _, kwargs = mock_get.call_args
        assert kwargs["headers"]["Authorization"] == "fake-key"
        assert kwargs["params"]["orientation"] == "landscape"


def test_search_pexels_raises_on_zero_results():
    with patch("video.stock_video.httpx.get") as mock_get:
        mock_get.return_value = _pexels_success_response([])
        with pytest.raises(PexelsError, match="zero videos"):
            search_pexels("query with no matches", api_key="fake-key")


def test_search_pexels_raises_on_http_error():
    with patch("video.stock_video.httpx.get") as mock_get:
        mock_get.return_value = _pexels_error_response(401, text="bad key")
        with pytest.raises(PexelsError, match="401"):
            search_pexels("q", api_key="fake-key")


def test_search_pexels_raises_without_api_key(monkeypatch):
    monkeypatch.delenv("PEXEL_API_KEY", raising=False)
    monkeypatch.delenv("PEXELS_API_KEY", raising=False)
    with pytest.raises(PexelsError, match="PEXEL_API_KEY"):
        search_pexels("q", api_key=None)


# ---------- _pick_best_variant ----------

def test_pick_best_variant_prefers_exact_1080p():
    video = {
        "video_files": [
            {"file_type": "video/mp4", "width": 1280, "height": 720, "link": "720p"},
            {"file_type": "video/mp4", "width": 1920, "height": 1080, "link": "1080p"},
            {"file_type": "video/mp4", "width": 3840, "height": 2160, "link": "4k"},
            {"file_type": "video/quicktime", "width": 1920, "height": 1080, "link": "mov"},
        ]
    }
    variant = _pick_best_variant(video)
    assert variant["link"] == "1080p"


def test_pick_best_variant_falls_back_to_720p_then_largest():
    # No 1080p → prefer 720p
    video_a = {"video_files": [
        {"file_type": "video/mp4", "width": 960, "height": 540, "link": "sd"},
        {"file_type": "video/mp4", "width": 1280, "height": 720, "link": "hd720"},
    ]}
    assert _pick_best_variant(video_a)["link"] == "hd720"

    # No 720p either → largest mp4
    video_b = {"video_files": [
        {"file_type": "video/mp4", "width": 960, "height": 540, "link": "sd"},
        {"file_type": "video/mp4", "width": 3840, "height": 2160, "link": "4k"},
    ]}
    assert _pick_best_variant(video_b)["link"] == "4k"


def test_pick_best_variant_returns_none_when_no_mp4():
    video = {"video_files": [
        {"file_type": "video/quicktime", "width": 1920, "height": 1080, "link": "mov"},
    ]}
    assert _pick_best_variant(video) is None


# ---------- pick_best_video ----------

def _video(vid_id: int, duration: int, variants: list[tuple[int, int]]) -> dict:
    """Helper: build a minimal video record with given mp4 variants."""
    return {
        "id": vid_id,
        "duration": duration,
        "video_files": [
            {
                "file_type": "video/mp4",
                "width": w,
                "height": h,
                "link": f"https://fake/{vid_id}_{w}x{h}.mp4",
            }
            for w, h in variants
        ],
    }


def test_pick_best_video_prefers_long_enough_with_1080p():
    videos = [
        _video(1, duration=11, variants=[(1920, 1080)]),  # too short
        _video(2, duration=40, variants=[(1280, 720)]),  # long enough but only 720p
        _video(3, duration=35, variants=[(1920, 1080)]),  # long enough + 1080p ← best
        _video(4, duration=60, variants=[(1920, 1080)]),  # too long, wasteful
    ]
    video, variant = pick_best_video(videos, target_duration=32.0)
    assert video["id"] == 3
    assert variant["width"] == 1920


def test_pick_best_video_falls_back_to_shorter_if_nothing_long_enough():
    videos = [
        _video(1, duration=10, variants=[(1920, 1080)]),
        _video(2, duration=15, variants=[(1920, 1080)]),  # closest to 20, still short
        _video(3, duration=8, variants=[(1920, 1080)]),
    ]
    video, _ = pick_best_video(videos, target_duration=20.0)
    assert video["id"] == 2  # closest to target even though still short


def test_pick_best_video_raises_on_empty_list():
    with pytest.raises(PexelsError, match="empty list"):
        pick_best_video([], target_duration=10.0)


def test_pick_best_video_skips_videos_with_no_mp4_variants():
    videos = [
        {"id": 99, "duration": 40, "video_files": [
            {"file_type": "video/quicktime", "width": 1920, "height": 1080, "link": "mov"}
        ]},
        _video(2, duration=35, variants=[(1920, 1080)]),
    ]
    video, _ = pick_best_video(videos, target_duration=30.0)
    assert video["id"] == 2


def test_pick_best_video_raises_if_all_videos_lack_mp4():
    videos = [
        {"id": 99, "duration": 40, "video_files": [
            {"file_type": "video/quicktime", "width": 1920, "height": 1080, "link": "mov"}
        ]},
    ]
    with pytest.raises(PexelsError, match="No usable mp4"):
        pick_best_video(videos, target_duration=30.0)

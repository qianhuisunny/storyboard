import pytest
from unittest.mock import patch, MagicMock

from video.heygen import (
    HeygenClient,
    DEFAULT_AVATAR_ID,
    DEFAULT_VOICE_ID,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
)


# ---------- HeygenClient construction ----------

def test_init_raises_without_api_key(monkeypatch):
    monkeypatch.delenv("HEYGEN_API_KEY", raising=False)
    with pytest.raises(ValueError, match="HEYGEN_API_KEY is required"):
        HeygenClient(api_key=None)


def test_init_accepts_explicit_key():
    c = HeygenClient(api_key="explicit-test-key")
    assert c.api_key == "explicit-test-key"


# ---------- build_video_request ----------

def test_build_video_request_default_shape():
    c = HeygenClient(api_key="test")
    body = c.build_video_request(input_text="Hello world")
    assert body["video_inputs"][0]["character"]["type"] == "avatar"
    assert body["video_inputs"][0]["character"]["avatar_id"] == DEFAULT_AVATAR_ID
    assert body["video_inputs"][0]["character"]["avatar_style"] == "normal"
    assert body["video_inputs"][0]["voice"]["type"] == "text"
    assert body["video_inputs"][0]["voice"]["input_text"] == "Hello world"
    assert body["video_inputs"][0]["voice"]["voice_id"] == DEFAULT_VOICE_ID
    assert body["dimension"] == {"width": DEFAULT_WIDTH, "height": DEFAULT_HEIGHT}
    # Deliberately no "test" field — an earlier version of this module
    # supported test=True under the belief it produced a free preview.
    # Empirically it billed normally, so the field was removed to avoid
    # misleading future maintainers.
    assert "test" not in body


def test_build_video_request_custom_avatar_and_voice():
    c = HeygenClient(api_key="test")
    body = c.build_video_request(
        avatar_id="Custom_avatar_id",
        input_text="Custom script",
        voice_id="custom-voice-id",
    )
    assert body["video_inputs"][0]["character"]["avatar_id"] == "Custom_avatar_id"
    assert body["video_inputs"][0]["voice"]["voice_id"] == "custom-voice-id"
    assert body["video_inputs"][0]["voice"]["input_text"] == "Custom script"


def test_build_video_request_custom_dimensions():
    c = HeygenClient(api_key="test")
    body = c.build_video_request(input_text="Hello", width=1280, height=720)
    assert body["dimension"] == {"width": 1280, "height": 720}


def test_build_video_request_rejects_empty_text():
    c = HeygenClient(api_key="test")
    with pytest.raises(ValueError, match="input_text must be a non-empty string"):
        c.build_video_request(input_text="")
    with pytest.raises(ValueError, match="input_text must be a non-empty string"):
        c.build_video_request(input_text="   ")


def test_build_video_request_custom_avatar_style():
    c = HeygenClient(api_key="test")
    body = c.build_video_request(input_text="Hi", avatar_style="happy")
    assert body["video_inputs"][0]["character"]["avatar_style"] == "happy"


# ---------- submit ----------

def _mock_response(status_code: int, json_body=None, text: str = ""):
    m = MagicMock()
    m.status_code = status_code
    if json_body is not None:
        m.json.return_value = json_body
    else:
        m.json.side_effect = ValueError("not json")
    m.text = text
    return m


def test_submit_success():
    c = HeygenClient(api_key="test")
    with patch("video.heygen.httpx.post") as mock_post:
        mock_post.return_value = _mock_response(
            200, {"data": {"video_id": "vid-abc-123"}, "error": None}
        )
        vid = c.submit({"dummy": "request"})
        assert vid == "vid-abc-123"
        mock_post.assert_called_once()
        # Verify headers include X-Api-Key, not Authorization
        _, kwargs = mock_post.call_args
        assert kwargs["headers"]["X-Api-Key"] == "test"
        assert "Authorization" not in kwargs["headers"]


def test_submit_raises_on_4xx_with_structured_error():
    """HeyGen returns 404 with {error: {code, message}} when avatar look is not found.
    submit() must extract that message, not raise a bare HTTPStatusError.
    """
    c = HeygenClient(api_key="test")
    with patch("video.heygen.httpx.post") as mock_post:
        mock_post.return_value = _mock_response(
            404,
            {
                "data": None,
                "error": {
                    "code": "internal_error",
                    "message": "avatar look not found, look_id: xyz, space_id: abc",
                },
            },
            text="...",
        )
        with pytest.raises(RuntimeError, match="avatar look not found"):
            c.submit({"dummy": "request"})


def test_submit_raises_on_4xx_without_structured_body():
    c = HeygenClient(api_key="test")
    with patch("video.heygen.httpx.post") as mock_post:
        mock_post.return_value = _mock_response(500, None, text="Internal Server Error")
        with pytest.raises(RuntimeError, match="HeyGen submit failed \\(500\\)"):
            c.submit({"dummy": "request"})


def test_submit_raises_on_200_with_error_envelope():
    """Some HeyGen errors are 200 with a populated error field."""
    c = HeygenClient(api_key="test")
    with patch("video.heygen.httpx.post") as mock_post:
        mock_post.return_value = _mock_response(
            200,
            {"data": None, "error": {"code": "oops", "message": "something"}},
        )
        with pytest.raises(RuntimeError, match="returned error envelope"):
            c.submit({"dummy": "request"})


def test_submit_raises_when_video_id_missing():
    c = HeygenClient(api_key="test")
    with patch("video.heygen.httpx.post") as mock_post:
        mock_post.return_value = _mock_response(
            200, {"data": {}, "error": None}
        )
        with pytest.raises(RuntimeError, match="no video_id"):
            c.submit({"dummy": "request"})


# ---------- poll_result ----------

def test_poll_result_success_on_first_poll():
    c = HeygenClient(api_key="test")
    with patch("video.heygen.httpx.get") as mock_get, \
         patch("video.heygen.time.sleep"):
        mock_get.return_value = _mock_response(
            200,
            {
                "data": {
                    "status": "completed",
                    "video_url": "https://heygen.example/vid.mp4",
                    "duration": 3.24,
                },
                "error": None,
            },
        )
        result = c.poll_result("vid-xyz")
        assert result["video_url"] == "https://heygen.example/vid.mp4"
        assert result["duration"] == 3.24


def test_poll_result_transitions_from_processing_to_completed():
    c = HeygenClient(api_key="test")
    responses = [
        _mock_response(200, {"data": {"status": "processing"}, "error": None}),
        _mock_response(200, {"data": {"status": "processing"}, "error": None}),
        _mock_response(
            200,
            {
                "data": {
                    "status": "completed",
                    "video_url": "https://heygen.example/done.mp4",
                    "duration": 5.0,
                },
                "error": None,
            },
        ),
    ]
    with patch("video.heygen.httpx.get", side_effect=responses), \
         patch("video.heygen.time.sleep"):
        result = c.poll_result("vid-xyz", interval=0)
        assert result["video_url"] == "https://heygen.example/done.mp4"


def test_poll_result_raises_on_failed_status():
    c = HeygenClient(api_key="test")
    with patch("video.heygen.httpx.get") as mock_get, \
         patch("video.heygen.time.sleep"):
        mock_get.return_value = _mock_response(
            200,
            {
                "data": {"status": "failed", "error": "something broke"},
                "error": None,
            },
        )
        with pytest.raises(RuntimeError, match="HeyGen task failed"):
            c.poll_result("vid-xyz")


def test_poll_result_raises_when_completed_without_video_url():
    c = HeygenClient(api_key="test")
    with patch("video.heygen.httpx.get") as mock_get, \
         patch("video.heygen.time.sleep"):
        mock_get.return_value = _mock_response(
            200,
            {"data": {"status": "completed"}, "error": None},
        )
        with pytest.raises(RuntimeError, match="no video_url"):
            c.poll_result("vid-xyz")

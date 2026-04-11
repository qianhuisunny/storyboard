import pytest
from video.avatar import RunwareAvatarClient, DEFAULT_POSITIVE_PROMPT


def test_build_request_body():
    """Test that the Runware request body is correctly structured."""
    client = RunwareAvatarClient(api_key="test_key")
    body = client.build_request(
        image_url="https://example.com/speaker.png",
        audio_url="https://example.com/audio.mp3",
        model="standard",
    )
    assert body["taskType"] == "videoInference"
    assert body["model"] == "klingai:avatar@2.0-standard"
    assert body["inputs"]["image"] == "https://example.com/speaker.png"
    assert body["inputs"]["audio"] == "https://example.com/audio.mp3"
    assert "taskUUID" in body
    # Runware rejects requests without a positivePrompt; the builder must
    # always produce one, defaulting to DEFAULT_POSITIVE_PROMPT.
    assert body["positivePrompt"] == DEFAULT_POSITIVE_PROMPT


def test_build_request_body_custom_prompt():
    """Caller-supplied positive_prompt overrides the default."""
    client = RunwareAvatarClient(api_key="test_key")
    body = client.build_request(
        image_url="https://example.com/speaker.png",
        audio_url="https://example.com/audio.mp3",
        model="standard",
        positive_prompt="a specific panel description",
    )
    assert body["positivePrompt"] == "a specific panel description"


def test_build_request_body_empty_prompt_falls_back_to_default():
    """Empty/whitespace positive_prompt falls back to the default."""
    client = RunwareAvatarClient(api_key="test_key")
    body = client.build_request(
        image_url="https://example.com/speaker.png",
        audio_url="https://example.com/audio.mp3",
        model="standard",
        positive_prompt="   ",
    )
    assert body["positivePrompt"] == DEFAULT_POSITIVE_PROMPT


def test_build_request_body_pro():
    """Test pro model variant."""
    client = RunwareAvatarClient(api_key="test_key")
    body = client.build_request(
        image_url="https://example.com/speaker.png",
        audio_url="https://example.com/audio.mp3",
        model="pro",
    )
    assert body["model"] == "klingai:avatar@2.0-pro"


def test_init_raises_without_api_key(monkeypatch):
    """Missing RUNWARE_API_KEY should raise ValueError."""
    monkeypatch.delenv("RUNWARE_API_KEY", raising=False)
    with pytest.raises(ValueError, match="RUNWARE_API_KEY is required"):
        RunwareAvatarClient(api_key=None)


def test_build_request_rejects_invalid_model():
    """Invalid model name should raise ValueError."""
    client = RunwareAvatarClient(api_key="test_key")
    with pytest.raises(ValueError, match="model must be one of"):
        client.build_request(
            image_url="https://example.com/speaker.png",
            audio_url="https://example.com/audio.mp3",
            model="typo",
        )

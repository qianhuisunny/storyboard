from video.avatar import RunwareAvatarClient


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


def test_build_request_body_pro():
    """Test pro model variant."""
    client = RunwareAvatarClient(api_key="test_key")
    body = client.build_request(
        image_url="https://example.com/speaker.png",
        audio_url="https://example.com/audio.mp3",
        model="pro",
    )
    assert body["model"] == "klingai:avatar@2.0-pro"

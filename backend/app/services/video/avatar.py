import os
import uuid
import time
import httpx
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

RUNWARE_API_URL = "https://api.runware.ai/v1"
VALID_AVATAR_MODELS = ("standard", "pro")

# Fallback prompt when the caller doesn't supply one. Runware's Kling Avatar
# API requires a non-empty positivePrompt; a generic safe-for-any-talking-head
# default keeps build_request useful in tests and quick experiments.
DEFAULT_POSITIVE_PROMPT = (
    "A polished talking avatar speaking naturally to camera with accurate lip "
    "sync, subtle head movements, composed shoulders, expressive but "
    "professional delivery, crisp facial detail, steady framing, smooth "
    "realistic mouth shapes."
)


class RunwareAvatarClient:
    """Client for generating talking head videos via Runware's Kling Avatar API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("RUNWARE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "RUNWARE_API_KEY is required (pass api_key or set RUNWARE_API_KEY env var)"
            )

    def build_request(
        self,
        image_url: str,
        audio_url: str,
        model: str = "standard",
        positive_prompt: Optional[str] = None,
    ) -> dict:
        """Build the Runware API request body for Kling Avatar 2.0.

        Note: Runware requires a non-empty `positivePrompt` at the top level.
        If `positive_prompt` is None or empty, `DEFAULT_POSITIVE_PROMPT` is
        used so the request always validates.
        """
        if model not in VALID_AVATAR_MODELS:
            raise ValueError(f"model must be one of {VALID_AVATAR_MODELS}, got {model!r}")
        prompt = (positive_prompt or "").strip() or DEFAULT_POSITIVE_PROMPT
        model_id = f"klingai:avatar@2.0-{model}"
        return {
            "taskType": "videoInference",
            "taskUUID": str(uuid.uuid4()),
            "model": model_id,
            "positivePrompt": prompt,
            "inputs": {
                "image": image_url,
                "audio": audio_url,
            },
            "deliveryMethod": "async",
            "includeCost": True,
        }

    def submit(self, request_body: dict) -> str:
        """Submit a video generation task. Returns the taskUUID."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        response = httpx.post(
            RUNWARE_API_URL,
            json=[request_body],
            headers=headers,
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Runware submit failed ({response.status_code}): {response.text}"
            )
        return request_body["taskUUID"]

    def poll_result(self, task_uuid: str, timeout: int = 600, interval: int = 5) -> str:
        """Poll for async task completion. Returns the video URL.

        Runware wraps responses as ``{"data": [{...}], "errors": [...]}``.
        Older versions of this method checked ``isinstance(data, list)`` on the
        top-level response, which was always False — the polling loop silently
        spun without reading any task state and then raised TimeoutError.
        Now we explicitly unwrap ``response_json["data"]`` before inspecting
        the first task entry. Default timeout raised from 300s to 600s
        because Kling Avatar 2.0 Standard can take 4-8 minutes end-to-end.
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        poll_body = [{
            "taskType": "getResponse",
            "taskUUID": task_uuid,
        }]
        deadline = time.time() + timeout
        while time.time() < deadline:
            response = httpx.post(
                RUNWARE_API_URL,
                json=poll_body,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()
            response_json = response.json()
            # Surface any errors first — errors live at the top level, not
            # inside the data array.
            errors = response_json.get("errors") or []
            if errors:
                raise RuntimeError(f"Runware poll returned errors: {errors}")
            data = response_json.get("data") or []
            if isinstance(data, list) and len(data) > 0:
                result = data[0]
                status = result.get("status")
                if status == "success":
                    video_url = (
                        result.get("videoURL")
                        or result.get("outputURL")
                        or result.get("videoUrl")
                    )
                    if not video_url:
                        raise RuntimeError(
                            f"Runware returned success but no video URL: {result}"
                        )
                    cost = result.get("cost")
                    if cost is not None:
                        print(f"  [Avatar] Done. cost=${cost}")
                    return video_url
                if status == "error":
                    raise RuntimeError(f"Runware task failed: {result}")
                # Unknown/processing status — log and continue polling
                print(f"  [Avatar] Polling... status={status!r}")
            else:
                # Empty data array can mean "not yet in DB" just after submit;
                # log and continue so we don't lose visibility during the wait.
                print(f"  [Avatar] Polling... (no data yet)")
            time.sleep(interval)
        raise TimeoutError(f"Kling avatar generation timed out after {timeout}s")

    def download_video(self, video_url: str, output_path: str) -> str:
        """Download the generated video to a local file."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", video_url, timeout=60) as r:
            r.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in r.iter_bytes(chunk_size=8192):
                    f.write(chunk)
        return output_path


def generate_avatar_video(
    image_url: str,
    audio_url: str,
    output_path: str,
    model: str = "standard",
    positive_prompt: Optional[str] = None,
    client: Optional[RunwareAvatarClient] = None,
) -> str:
    """End-to-end: submit avatar generation, poll, download.

    Args:
        image_url: URL of the speaker portrait image.
        audio_url: URL of the TTS audio file.
        output_path: Local path to save the video.
        model: "standard" or "pro".
        positive_prompt: Optional stylistic description of the desired output.
            If None, falls back to DEFAULT_POSITIVE_PROMPT.
        client: Optional RunwareAvatarClient (for testing).

    Returns:
        The output_path.
    """
    if client is None:
        client = RunwareAvatarClient()

    request = client.build_request(image_url, audio_url, model, positive_prompt)
    task_uuid = client.submit(request)
    print(f"  [Avatar] Submitted task {task_uuid}, polling...")
    video_url = client.poll_result(task_uuid)
    print(f"  [Avatar] Done, downloading...")
    client.download_video(video_url, output_path)
    return output_path

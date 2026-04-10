import os
import uuid
import time
import httpx
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

RUNWARE_API_URL = "https://api.runware.ai/v1"


class RunwareAvatarClient:
    """Client for generating talking head videos via Runware's Kling Avatar API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("RUNWARE_API_KEY")

    def build_request(
        self,
        image_url: str,
        audio_url: str,
        model: str = "standard",
    ) -> dict:
        """Build the Runware API request body for Kling Avatar 2.0."""
        model_id = f"klingai:avatar@2.0-{model}"
        return {
            "taskType": "videoInference",
            "taskUUID": str(uuid.uuid4()),
            "model": model_id,
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
        response.raise_for_status()
        return request_body["taskUUID"]

    def poll_result(self, task_uuid: str, timeout: int = 300, interval: int = 5) -> str:
        """Poll for async task completion. Returns the video URL."""
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
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                result = data[0]
                if result.get("status") == "success":
                    return result.get("videoURL") or result.get("outputURL")
                if result.get("status") == "error":
                    raise RuntimeError(f"Runware task failed: {result}")
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
    client: Optional[RunwareAvatarClient] = None,
) -> str:
    """End-to-end: submit avatar generation, poll, download.

    Args:
        image_url: URL of the speaker portrait image.
        audio_url: URL of the TTS audio file.
        output_path: Local path to save the video.
        model: "standard" or "pro".
        client: Optional RunwareAvatarClient (for testing).

    Returns:
        The output_path.
    """
    if client is None:
        client = RunwareAvatarClient()

    request = client.build_request(image_url, audio_url, model)
    task_uuid = client.submit(request)
    print(f"  [Avatar] Submitted task {task_uuid}, polling...")
    video_url = client.poll_result(task_uuid)
    print(f"  [Avatar] Done, downloading...")
    client.download_video(video_url, output_path)
    return output_path

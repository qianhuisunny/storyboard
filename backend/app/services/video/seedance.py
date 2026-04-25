"""
Seedance 2.0 video generation client via BytePlus ARK.

Seedance generates video from text, images, and/or audio references.
Three generation modes:

  - **Text-to-video**: prompt → cinematic AI video (B-roll, backgrounds)
  - **Image-to-video**: reference image + prompt → animated version
  - **Reference-to-video**: character image + audio → lip-synced talking head

API pattern mirrors HeyGen: submit task → poll status → download MP4.
Typical generation time: 60-120s per clip (max 15s duration each).

Key ARK quirks:

1. Content filter can reject prompts with no clear reason — retry with
   softer language or split long prompts.

2. Audio-driven lip sync (reference-to-video) requires a publicly
   accessible audio URL — local file paths won't work. Upload to
   litterbox or similar first.

3. Max clip duration is 15 seconds. For longer panels, generate
   multiple clips and concatenate.

4. generate_audio=True in reference-to-video is required even when
   providing your own audio — it enables the audio processing pipeline.
"""
import os
import time
import base64
from pathlib import Path
from typing import Optional

import httpx

BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"
POLL_INTERVAL = 10
DEFAULT_TIMEOUT = 600
DEFAULT_MODEL = "dreamina-seedance-2-0-260128"


def _image_to_data_url(image_path: str) -> str:
    data = Path(image_path).read_bytes()
    b64 = base64.b64encode(data).decode()
    suffix = Path(image_path).suffix.lower().lstrip(".")
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(suffix, "image/png")
    return f"data:{mime};base64,{b64}"


class SeedanceClient:
    """Thin client for BytePlus ARK Seedance 2.0 content generation."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("ARK_API_KEY")
        if not self.api_key:
            raise ValueError(
                "ARK_API_KEY is required (pass api_key or set ARK_API_KEY env var)"
            )
        self.model = model or os.getenv("SEEDANCE_MODEL_ID", DEFAULT_MODEL)
        from byteplussdkarkruntime import Ark
        self._ark = Ark(api_key=self.api_key, base_url=BASE_URL)

    def submit_text_to_video(
        self,
        prompt: str,
        duration: int = 10,
        resolution: str = "720p",
        ratio: str = "16:9",
    ) -> str:
        task = self._ark.content_generation.tasks.create(
            model=self.model,
            content=[{"type": "text", "text": prompt}],
            duration=duration,
            resolution=resolution,
            ratio=ratio,
        )
        print(f"  [Seedance] text-to-video → task {task.id}")
        return task.id

    def submit_image_to_video(
        self,
        image_path: str,
        prompt: str = "",
        duration: int = 10,
        resolution: str = "720p",
        ratio: str = "16:9",
        generate_audio: bool = False,
    ) -> str:
        content = [
            {"type": "image_url", "image_url": {"url": _image_to_data_url(image_path)}},
            {"type": "text", "text": prompt},
        ]
        task = self._ark.content_generation.tasks.create(
            model=self.model,
            content=content,
            duration=duration,
            resolution=resolution,
            ratio=ratio,
            generate_audio=generate_audio,
        )
        print(f"  [Seedance] image-to-video → task {task.id}")
        return task.id

    def submit_reference_to_video(
        self,
        prompt: str,
        image_paths: Optional[list[str]] = None,
        audio_url: Optional[str] = None,
        duration: int = 10,
        resolution: str = "720p",
        ratio: str = "16:9",
    ) -> str:
        content = []
        if image_paths:
            for path in image_paths:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": _image_to_data_url(path)},
                })
        if audio_url:
            content.append({
                "type": "audio_url",
                "audio_url": {"url": audio_url},
            })
        content.append({"type": "text", "text": prompt})
        task = self._ark.content_generation.tasks.create(
            model=self.model,
            content=content,
            duration=duration,
            resolution=resolution,
            ratio=ratio,
            generate_audio=True,
        )
        print(f"  [Seedance] reference-to-video → task {task.id}")
        return task.id

    def poll_result(
        self,
        task_id: str,
        timeout: int = DEFAULT_TIMEOUT,
        interval: int = POLL_INTERVAL,
    ) -> str:
        deadline = time.time() + timeout
        while time.time() < deadline:
            result = self._ark.content_generation.tasks.get(task_id=task_id)
            if result.status == "succeeded":
                print(f"  [Seedance] Task {task_id} done ({result.duration}s {result.resolution})")
                return result.content.video_url
            elif result.status in ("failed", "cancelled"):
                raise RuntimeError(f"Seedance task {task_id} {result.status}: {result.error}")
            else:
                elapsed = timeout - (deadline - time.time())
                print(f"  [Seedance] {task_id} status={result.status} ({elapsed:.0f}s)")
                time.sleep(interval)
        raise TimeoutError(f"Seedance task {task_id} timed out after {timeout}s")

    def download_video(self, video_url: str, output_path: str) -> str:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", video_url, timeout=120, follow_redirects=True) as r:
            r.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in r.iter_bytes(chunk_size=8192):
                    f.write(chunk)
        size_mb = Path(output_path).stat().st_size / 1024 / 1024
        print(f"  [Seedance] Downloaded {size_mb:.1f}MB → {output_path}")
        return output_path


def generate_seedance_video(
    output_path: str,
    prompt: str,
    duration: int = 10,
    resolution: str = "720p",
    image_path: Optional[str] = None,
    audio_url: Optional[str] = None,
    client: Optional[SeedanceClient] = None,
) -> dict:
    """End-to-end: submit a Seedance task, poll until done, download the MP4.

    Dispatches to the appropriate submission method based on inputs:
      - image_path + audio_url → reference-to-video (lip sync)
      - image_path only → image-to-video (animated still)
      - neither → text-to-video (AI-generated footage)

    Returns dict with task_id, video_url, and output_path.
    """
    if client is None:
        client = SeedanceClient()

    if image_path and audio_url:
        task_id = client.submit_reference_to_video(
            prompt=prompt, image_paths=[image_path], audio_url=audio_url,
            duration=duration, resolution=resolution,
        )
    elif image_path:
        task_id = client.submit_image_to_video(
            image_path=image_path, prompt=prompt,
            duration=duration, resolution=resolution,
        )
    else:
        task_id = client.submit_text_to_video(
            prompt=prompt, duration=duration, resolution=resolution,
        )

    video_url = client.poll_result(task_id)
    client.download_video(video_url, output_path)

    return {"task_id": task_id, "video_url": video_url, "output_path": output_path}

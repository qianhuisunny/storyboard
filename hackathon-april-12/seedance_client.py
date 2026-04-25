"""
BytePlus ARK SDK client for Seedance 2.0 video generation.

Uses the official byteplus-python-sdk-v2 package.
API pattern: create task → poll status → download video.
"""
import os
import time
import base64
import httpx
from pathlib import Path
from dotenv import load_dotenv
from byteplussdkarkruntime import Ark

load_dotenv()

BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"
POLL_INTERVAL = 10
DEFAULT_TIMEOUT = 600


def _get_client() -> Ark:
    return Ark(
        api_key=os.environ["ARK_API_KEY"],
        base_url=BASE_URL,
    )


def _get_model() -> str:
    return os.environ.get("SEEDANCE_MODEL_ID", "dreamina-seedance-2-0-260128")


def _image_to_data_url(image_path: str) -> str:
    data = Path(image_path).read_bytes()
    b64 = base64.b64encode(data).decode()
    suffix = Path(image_path).suffix.lower().lstrip(".")
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(suffix, "image/png")
    return f"data:{mime};base64,{b64}"


def submit_text_to_video(
    prompt: str,
    duration: int = 10,
    resolution: str = "720p",
    ratio: str = "16:9",
    model: str | None = None,
) -> str:
    client = _get_client()
    model = model or _get_model()
    task = client.content_generation.tasks.create(
        model=model,
        content=[{"type": "text", "text": prompt}],
        duration=duration,
        resolution=resolution,
        ratio=ratio,
    )
    print(f"  [Seedance] text-to-video → task {task.id}")
    return task.id


def submit_image_to_video(
    image_path: str,
    prompt: str = "",
    duration: int = 10,
    resolution: str = "720p",
    ratio: str = "16:9",
    generate_audio: bool = False,
    model: str | None = None,
) -> str:
    client = _get_client()
    model = model or _get_model()
    image_url = _image_to_data_url(image_path)
    content = [
        {"type": "image_url", "image_url": {"url": image_url}},
        {"type": "text", "text": prompt},
    ]
    task = client.content_generation.tasks.create(
        model=model,
        content=content,
        duration=duration,
        resolution=resolution,
        ratio=ratio,
        generate_audio=generate_audio,
    )
    print(f"  [Seedance] image-to-video → task {task.id}")
    return task.id


def submit_reference_to_video(
    prompt: str,
    image_paths: list[str] | None = None,
    audio_url: str | None = None,
    duration: int = 10,
    resolution: str = "720p",
    ratio: str = "16:9",
    model: str | None = None,
) -> str:
    client = _get_client()
    model = model or _get_model()
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
    task = client.content_generation.tasks.create(
        model=model,
        content=content,
        duration=duration,
        resolution=resolution,
        ratio=ratio,
        generate_audio=True,
    )
    print(f"  [Seedance] reference-to-video → task {task.id}")
    return task.id


def poll_until_done(task_id: str, timeout: int = DEFAULT_TIMEOUT) -> str:
    client = _get_client()
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = client.content_generation.tasks.get(task_id=task_id)
        if result.status == "succeeded":
            print(f"  [Seedance] Task {task_id} done ({result.duration}s {result.resolution})")
            return result.content.video_url
        elif result.status in ("failed", "cancelled"):
            raise RuntimeError(f"Seedance task {task_id} {result.status}: {result.error}")
        else:
            elapsed = timeout - (deadline - time.time())
            print(f"  [Seedance] {task_id} status={result.status} ({elapsed:.0f}s)")
            time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Seedance task {task_id} timed out after {timeout}s")


def download_video(url: str, output_path: str) -> str:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=120, follow_redirects=True) as resp:
        resp.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in resp.iter_bytes(chunk_size=8192):
                f.write(chunk)
    size_mb = Path(output_path).stat().st_size / 1024 / 1024
    print(f"  [Seedance] Downloaded {size_mb:.1f}MB → {output_path}")
    return output_path


def generate_video(
    output_path: str,
    prompt: str,
    duration: int = 10,
    resolution: str = "720p",
    image_path: str | None = None,
    audio_url: str | None = None,
    model: str | None = None,
) -> dict:
    """High-level: submit + poll + download. Returns metadata dict."""
    if image_path and audio_url:
        task_id = submit_reference_to_video(
            prompt=prompt, image_paths=[image_path], audio_url=audio_url,
            duration=duration, resolution=resolution, model=model,
        )
    elif image_path:
        task_id = submit_image_to_video(
            image_path=image_path, prompt=prompt,
            duration=duration, resolution=resolution, model=model,
        )
    else:
        task_id = submit_text_to_video(
            prompt=prompt, duration=duration, resolution=resolution, model=model,
        )

    video_url = poll_until_done(task_id)
    download_video(video_url, output_path)
    return {"task_id": task_id, "video_url": video_url, "output_path": output_path}

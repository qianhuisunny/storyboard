"""
HeyGen video generation client.

HeyGen's v2 create-video API takes a character (avatar_id + style) and a
voice (text or audio asset) and returns a video_id. We then poll
/v1/video_status.get until the job is done and download the MP4.

Replaces the Runware/Kling client that previously lived in avatar.py.
Why the swap: Kling Avatar 2.0 at ~$0.044/sec put a 5-min video at ~$5
— about 3x over our $1.50/5min unit-economics target. HeyGen Photo
Avatar bills at ~$0.50-0.99 per credit (1 credit ≈ 1 min of video), so
the same 28s of talking-head content costs roughly $0.23-0.46 — well
under target even at Pro tier.

Key HeyGen quirks discovered the hard way:

1. Response envelope: every endpoint wraps the payload in
   ``{"error": null | {...}, "data": {...}}``. Always check ``error``
   even when status is 200, and parse structured errors out of 4xx
   bodies instead of relying on r.raise_for_status().

2. ``character.avatar_id`` in a create-video request is actually
   interpreted as a ``look_id``. Public avatar strings like
   "Lisa_public" work; bare hash IDs only work if that specific look
   is available in the workspace's pool. A hash from a different
   workspace produces the error:
   "avatar look not found, look_id: <hash>, space_id: <workspace>"

3. Auth header is ``X-Api-Key: <key>``, NOT ``Authorization: Bearer``.

4. There's no ``/v2/video/status`` — the status endpoint is the older
   ``/v1/video_status.get?video_id=<id>``. v2 vs v1 mixing is on
   purpose, not a typo.

Historical note: an earlier version of this file supported a
``test: True`` parameter under the belief that it produced a
watermarked 720p preview with zero credit consumption. Empirical
testing showed that is NOT the case for this workspace's product tier
— test mode billed normally and produced an unwatermarked 1080p video.
The parameter has been removed to avoid misleading future maintainers.
Use ``--dry-run`` for fixture-parse-only validation with zero API calls.
"""
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

HEYGEN_API_BASE = "https://api.heygen.com"
CREATE_VIDEO_PATH = "/v2/video/generate"
STATUS_PATH = "/v1/video_status.get"

# Default avatar is HeyGen's public "Lisa" — confirmed working via a free
# test probe. If you pass a different avatar_id that HeyGen rejects with
# "avatar look not found", the ID is either from a different workspace or
# points to a premium look variant that hasn't been unlocked for this
# account. Use GET /v2/avatars to see what's actually available.
DEFAULT_AVATAR_ID = "Lisa_public"

# Observed working voice_id from an earlier probe. Not necessarily the
# "canonical" Lisa voice — it's the default voice that came back from the
# avatar_group.list endpoint for another public avatar (Monica) and was
# accepted by HeyGen for Lisa_public without complaint. Swap for a
# different voice by passing voice_id= to build_video_request or running
# the pipeline with --voice-id.
DEFAULT_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8"

# 1920x1080 matches the Remotion slide dimensions, so mixed talking-head
# + slides videos can be stitched with ffmpeg -c copy (no re-encode).
DEFAULT_WIDTH = 1920
DEFAULT_HEIGHT = 1080


class HeygenClient:
    """Thin client for HeyGen's v2 create-video + v1 status endpoints."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("HEYGEN_API_KEY")
        if not self.api_key:
            raise ValueError(
                "HEYGEN_API_KEY is required (pass api_key or set HEYGEN_API_KEY env var)"
            )

    def _headers(self, content_type: Optional[str] = None) -> dict:
        h = {"X-Api-Key": self.api_key, "Accept": "application/json"}
        if content_type:
            h["Content-Type"] = content_type
        return h

    def build_video_request(
        self,
        avatar_id: str = DEFAULT_AVATAR_ID,
        input_text: str = "",
        voice_id: str = DEFAULT_VOICE_ID,
        width: int = DEFAULT_WIDTH,
        height: int = DEFAULT_HEIGHT,
        avatar_style: str = "normal",
    ) -> dict:
        """Build a v2/video/generate request body for a text-driven talking-head.

        Args:
            avatar_id: HeyGen avatar identifier. HeyGen internally treats
                this as a look_id — see module docstring.
            input_text: The voiceover script. HeyGen TTSes it using
                voice_id and lip-syncs the avatar to the generated audio.
            voice_id: HeyGen voice identifier.
            width: Output width in pixels. Defaults to 1920.
            height: Output height in pixels. Defaults to 1080.
            avatar_style: "normal" | "happy" | "serious" etc. HeyGen docs
                are ambiguous on the full enum; "normal" is the safe default.

        Returns:
            The request body as a dict ready to POST.
        """
        if not input_text or not input_text.strip():
            raise ValueError("input_text must be a non-empty string")

        return {
            "video_inputs": [
                {
                    "character": {
                        "type": "avatar",
                        "avatar_id": avatar_id,
                        "avatar_style": avatar_style,
                    },
                    "voice": {
                        "type": "text",
                        "input_text": input_text,
                        "voice_id": voice_id,
                    },
                }
            ],
            "dimension": {"width": width, "height": height},
        }

    def submit(self, request_body: dict) -> str:
        """Submit a create-video request. Returns the video_id.

        Handles HeyGen's mixed 4xx-with-structured-body pattern by
        parsing the JSON error envelope before raising, so callers get
        the useful "avatar look not found, look_id: ..." message instead
        of a bare "HTTP 404".
        """
        r = httpx.post(
            f"{HEYGEN_API_BASE}{CREATE_VIDEO_PATH}",
            json=request_body,
            headers=self._headers("application/json"),
            timeout=30,
        )

        body = None
        try:
            body = r.json()
        except Exception:
            pass

        if r.status_code >= 400:
            if body and body.get("error"):
                err = body["error"]
                raise RuntimeError(
                    f"HeyGen submit failed ({r.status_code}): "
                    f"{err.get('code', 'unknown')}: "
                    f"{err.get('message', 'no message')}"
                )
            raise RuntimeError(
                f"HeyGen submit failed ({r.status_code}): {r.text[:500]}"
            )

        if not body or body.get("error"):
            raise RuntimeError(
                f"HeyGen submit returned error envelope: "
                f"{body.get('error') if body else 'no body'}"
            )

        data = body.get("data") or {}
        video_id = data.get("video_id")
        if not video_id:
            raise RuntimeError(
                f"HeyGen submit returned no video_id: {body}"
            )
        return video_id

    def poll_result(
        self,
        video_id: str,
        timeout: int = 600,
        interval: int = 5,
    ) -> dict:
        """Poll until the video is completed, failed, or timeout.

        Returns the completed ``data`` dict (contains ``video_url``,
        ``duration``, ``thumbnail_url``, etc.). Only logs a status line
        when the status actually changes, so long polls don't spam the
        console.
        """
        deadline = time.time() + timeout
        last_status = None
        while time.time() < deadline:
            r = httpx.get(
                f"{HEYGEN_API_BASE}{STATUS_PATH}",
                params={"video_id": video_id},
                headers=self._headers(),
                timeout=30,
            )
            r.raise_for_status()
            body = r.json()
            data = body.get("data") or {}
            status = data.get("status")

            if status != last_status:
                print(f"  [HeyGen] Polling... status={status!r}")
                last_status = status

            if status == "completed":
                if not data.get("video_url"):
                    raise RuntimeError(
                        f"HeyGen reported completed but no video_url: {data}"
                    )
                return data

            if status == "failed":
                err = data.get("error") or "no error details"
                raise RuntimeError(f"HeyGen task failed: {err}")

            time.sleep(interval)

        raise TimeoutError(
            f"HeyGen video generation timed out after {timeout}s"
        )

    def download_video(self, video_url: str, output_path: str) -> str:
        """Download the generated video to a local file."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream(
            "GET",
            video_url,
            timeout=120,
            follow_redirects=True,
        ) as r:
            r.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in r.iter_bytes(chunk_size=8192):
                    f.write(chunk)
        return output_path


def generate_avatar_video(
    input_text: str,
    output_path: str,
    avatar_id: str = DEFAULT_AVATAR_ID,
    voice_id: str = DEFAULT_VOICE_ID,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    avatar_style: str = "normal",
    client: Optional[HeygenClient] = None,
) -> dict:
    """End-to-end: submit a HeyGen video, poll until done, download the MP4.

    Args:
        input_text: The voiceover script. HeyGen handles TTS internally.
        output_path: Local path to save the downloaded MP4.
        avatar_id: Which HeyGen avatar to use. Defaults to Lisa_public.
        voice_id: Which HeyGen voice to use.
        width: Output width (default 1920).
        height: Output height (default 1080).
        avatar_style: "normal" | "happy" | "serious" etc.
        client: Optional pre-built HeygenClient (for testing).

    Returns:
        Dict with ``output_path``, ``video_id``, ``duration``, and
        ``video_url`` (signed, time-limited).
    """
    if client is None:
        client = HeygenClient()

    request = client.build_video_request(
        avatar_id=avatar_id,
        input_text=input_text,
        voice_id=voice_id,
        width=width,
        height=height,
        avatar_style=avatar_style,
    )
    video_id = client.submit(request)
    print(f"  [HeyGen] Submitted video {video_id}, polling...")

    result = client.poll_result(video_id)
    duration = result.get("duration")
    print(f"  [HeyGen] Done. duration={duration}s")

    client.download_video(result["video_url"], output_path)

    return {
        "output_path": output_path,
        "video_id": video_id,
        "duration": duration,
        "video_url": result["video_url"],
    }

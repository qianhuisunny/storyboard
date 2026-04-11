"""
Ephemeral public-file upload helper.

Runware Kling Avatar and similar APIs require publicly-accessible HTTPS URLs
for their inputs (they fetch the asset over HTTP, they don't accept uploads).
This module uploads a local file to litterbox.catbox.moe — the ephemeral
sibling of catbox.moe — and returns the public URL. Files expire on their
own according to `expiry` (1h / 12h / 24h / 72h); we don't have to clean
them up. Multi-fetch is allowed, so Runware's download can safely retry.

We use litterbox (not catbox, not 0x0.st) because:
  - 0x0.st is intercepted by some ISPs / filtering software (SafeBrowse
    warning pages), which breaks TLS from this machine.
  - file.io deletes files after the first download — risky if Runware
    retries.
  - catbox.moe files are permanent — we don't want to leave assets lying
    around after a smoke test.

Usage:
    from video.public_upload import upload_file
    url = upload_file("/path/to/clip.mp3")
    # -> "https://litter.catbox.moe/xxxxxx.mp3"
"""
from pathlib import Path
from typing import Optional

import httpx

HOST_URL = "https://litterbox.catbox.moe/resources/internals/api.php"
USER_AGENT = "plotline-video-pipeline/1.0"
# Valid litterbox expiry values. Anything else gets rejected by the host.
VALID_EXPIRIES = ("1h", "12h", "24h", "72h")


def upload_file(path: str, expiry: str = "1h", timeout: int = 120) -> str:
    """Upload a local file to litterbox.catbox.moe and return the public HTTPS URL.

    Args:
        path: Absolute or relative filesystem path to the file to upload.
        expiry: How long litterbox should keep the file. One of
            "1h", "12h", "24h", "72h". Defaults to "1h" — long enough for
            a Runware job to download the asset, short enough that nothing
            lingers after a smoke test.
        timeout: HTTP timeout in seconds for the upload request.

    Returns:
        The public HTTPS URL of the uploaded file
        (e.g. "https://litter.catbox.moe/xxxxxx.mp3").

    Raises:
        FileNotFoundError: If `path` does not exist.
        ValueError: If `expiry` is not one of the valid options.
        RuntimeError: If the host returns a non-2xx status or a response body
            that doesn't look like a URL.
    """
    if expiry not in VALID_EXPIRIES:
        raise ValueError(
            f"expiry must be one of {VALID_EXPIRIES}, got {expiry!r}"
        )

    file_path = Path(path)
    if not file_path.is_file():
        raise FileNotFoundError(f"upload_file: no such file: {path}")

    with file_path.open("rb") as f:
        response = httpx.post(
            HOST_URL,
            data={"reqtype": "fileupload", "time": expiry},
            files={"fileToUpload": (file_path.name, f)},
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"upload to litterbox failed (status={response.status_code}): "
            f"{response.text[:500]}"
        )

    url = response.text.strip()
    if not url.startswith("https://") or "catbox.moe" not in url:
        raise RuntimeError(
            f"unexpected response from litterbox: {response.text[:500]!r}"
        )

    return url


def verify_url(url: str, timeout: int = 15) -> tuple[int, Optional[str], Optional[str]]:
    """HEAD a public URL and return (status_code, content_type, content_length).

    Useful for confirming an uploaded file is actually reachable before we
    hand the URL to an external API that will try to download it.
    """
    r = httpx.head(url, timeout=timeout, follow_redirects=True)
    return (
        r.status_code,
        r.headers.get("content-type"),
        r.headers.get("content-length"),
    )

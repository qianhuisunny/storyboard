"""Bounded, SSRF-safe primitives for project source ingestion."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Optional
from urllib.parse import urljoin, urlsplit

import httpx


MAX_FETCH_BYTES = 2 * 1024 * 1024
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_EXTRACTED_CHARS = 50_000
MAX_EXTRACTED_BYTES = 200_000
MAX_DOCX_FILES = 1_000
MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024
MAX_REDIRECTS = 4
SAFE_CONTENT_TYPES = {"text/html", "text/plain", "application/xhtml+xml"}
REDIRECT_STATUSES = {301, 302, 303, 307, 308}

Resolver = Callable[[str, int], Awaitable[list[str]]]


class SourceIngestionError(ValueError):
    """Raised when a source is unsafe, unsupported, or exceeds a bound."""


@dataclass(frozen=True)
class FetchedText:
    final_url: str
    content_type: str
    text: str


def truncate_utf8(value: str, max_bytes: int = MAX_EXTRACTED_BYTES) -> str:
    """Bound persisted/returned text by bytes without leaving broken UTF-8."""
    encoded = value.encode("utf-8")
    if len(encoded) <= max_bytes:
        return value
    return encoded[:max_bytes].decode("utf-8", errors="ignore")


def _require_global_address(value: str) -> None:
    try:
        address = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError as error:
        raise SourceIngestionError("URL resolved to an invalid address") from error
    if not address.is_global:
        raise SourceIngestionError("URL must resolve only to public addresses")


async def _default_resolver(hostname: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    try:
        records = await loop.getaddrinfo(
            hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as error:
        raise SourceIngestionError("URL hostname could not be resolved") from error
    return sorted({record[4][0] for record in records})


async def validate_public_url(
    url: str,
    *,
    resolver: Resolver = _default_resolver,
) -> str:
    """Validate syntax and require every resolved address to be globally routable."""
    if not isinstance(url, str) or len(url) > 2_048:
        raise SourceIngestionError("URL is invalid or too long")
    if url != url.strip() or any(ord(character) < 32 for character in url):
        raise SourceIngestionError("URL contains invalid whitespace")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise SourceIngestionError("URL contains an invalid port") from error
    if parsed.scheme.lower() not in {"http", "https"}:
        raise SourceIngestionError("Only http and https URLs are supported")
    if not parsed.hostname or parsed.username is not None or parsed.password is not None:
        raise SourceIngestionError("URL credentials are not allowed")
    if parsed.fragment:
        # Fragments never reach the server and are removed from the canonical target.
        parsed = parsed._replace(fragment="")
        url = parsed.geturl()
    port = (443 if parsed.scheme.lower() == "https" else 80) if port is None else port
    if port < 1 or port > 65_535:
        raise SourceIngestionError("URL contains an invalid port")

    try:
        literal = ipaddress.ip_address(parsed.hostname.split("%", 1)[0])
    except ValueError:
        addresses = await resolver(parsed.hostname, port)
        if not addresses:
            raise SourceIngestionError("URL hostname did not resolve")
        for address in addresses:
            _require_global_address(address)
    else:
        _require_global_address(str(literal))
    return url


async def fetch_public_text(
    url: str,
    *,
    resolver: Resolver = _default_resolver,
    transport: Optional[httpx.AsyncBaseTransport] = None,
    max_bytes: int = MAX_FETCH_BYTES,
    max_redirects: int = MAX_REDIRECTS,
) -> FetchedText:
    """Fetch safe textual content while validating every redirect target."""
    current_url = url
    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,
        transport=transport,
        trust_env=False,
    ) as client:
        for redirect_count in range(max_redirects + 1):
            current_url = await validate_public_url(current_url, resolver=resolver)
            try:
                async with client.stream(
                    "GET",
                    current_url,
                    headers={"User-Agent": "Plotline/1.0 source reader"},
                ) as response:
                    if response.status_code in REDIRECT_STATUSES:
                        location = response.headers.get("location")
                        if not location:
                            raise SourceIngestionError("Redirect response omitted its target")
                        if redirect_count >= max_redirects:
                            raise SourceIngestionError("URL redirected too many times")
                        current_url = urljoin(current_url, location)
                        continue
                    if response.status_code < 200 or response.status_code >= 300:
                        raise SourceIngestionError(
                            f"URL returned HTTP {response.status_code}"
                        )
                    content_type = response.headers.get("content-type", "")
                    media_type = content_type.split(";", 1)[0].strip().lower()
                    if media_type not in SAFE_CONTENT_TYPES:
                        raise SourceIngestionError("URL content type is not supported")
                    declared_length = response.headers.get("content-length")
                    if declared_length and declared_length.isdigit() and int(declared_length) > max_bytes:
                        raise SourceIngestionError("URL content is too large")
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(body) + len(chunk) > max_bytes:
                            raise SourceIngestionError("URL content is too large")
                        body.extend(chunk)
                    encoding = response.encoding or "utf-8"
                    try:
                        text = bytes(body).decode(encoding, errors="replace")
                    except LookupError:
                        text = bytes(body).decode("utf-8", errors="replace")
                    return FetchedText(
                        final_url=current_url,
                        content_type=media_type,
                        text=text,
                    )
            except httpx.RequestError as error:
                raise SourceIngestionError("URL request failed") from error
    raise SourceIngestionError("URL redirected too many times")


def ensure_contained(path: Path, root: Path) -> Path:
    resolved_root = root.resolve()
    resolved = path.resolve()
    if not resolved.is_relative_to(resolved_root):
        raise SourceIngestionError("Source path escaped the project directory")
    return resolved


def validate_docx_archive(
    path: Path,
    *,
    max_files: int = MAX_DOCX_FILES,
    max_uncompressed_bytes: int = MAX_DOCX_UNCOMPRESSED_BYTES,
) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise SourceIngestionError("DOCX signature is invalid")
            if len(entries) > max_files:
                raise SourceIngestionError("DOCX contains too many files")
            expanded = sum(entry.file_size for entry in entries)
            if expanded > max_uncompressed_bytes:
                raise SourceIngestionError("DOCX expanded size is too large")
            for entry in entries:
                if entry.file_size > max_uncompressed_bytes:
                    raise SourceIngestionError("DOCX expanded size is too large")
                if entry.compress_size == 0 and entry.file_size > 0:
                    raise SourceIngestionError("DOCX compression ratio is unsafe")
                if entry.compress_size and entry.file_size / entry.compress_size > 200:
                    raise SourceIngestionError("DOCX compression ratio is unsafe")
    except zipfile.BadZipFile as error:
        raise SourceIngestionError("DOCX signature is invalid") from error


def validate_upload_signature(path: Path, extension: str) -> None:
    with path.open("rb") as handle:
        prefix = handle.read(8)
    if extension == ".pdf" and not prefix.startswith(b"%PDF-"):
        raise SourceIngestionError("PDF signature does not match its extension")
    if extension == ".docx":
        if not prefix.startswith(b"PK"):
            raise SourceIngestionError("DOCX signature does not match its extension")
        validate_docx_archive(path)
    if extension in {".txt", ".md"}:
        if b"\x00" in prefix:
            raise SourceIngestionError("Text source contains binary data")


async def extract_with_timeout(
    extractor: Callable[[Path], str],
    path: Path,
    *,
    timeout_seconds: float = 10.0,
    max_chars: int = MAX_EXTRACTED_CHARS,
) -> str:
    try:
        extracted = await asyncio.wait_for(
            asyncio.to_thread(extractor, path),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError as error:
        raise SourceIngestionError("Source extraction timed out") from error
    if not isinstance(extracted, str):
        raise SourceIngestionError("Source extraction returned invalid content")
    return truncate_utf8(extracted[:max_chars])

"""Project artifact storage for local development and Vercel Blob."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


REPO_ROOT = Path(__file__).resolve().parents[3]


def project_data_root() -> Path:
    configured = os.getenv("PLOTLINE_DATA_ROOT")
    if configured:
        return Path(configured)
    if os.getenv("VERCEL"):
        return Path("/tmp/plotline-data")
    return REPO_ROOT / "data"


class ProjectStorage:
    """Persist project artifacts remotely when a Blob token is configured."""

    @property
    def remote_enabled(self) -> bool:
        return bool(os.getenv("BLOB_READ_WRITE_TOKEN"))

    @staticmethod
    def blob_path(project_id: str, relative_path: str) -> str:
        clean_path = relative_path.strip("/")
        if not clean_path or ".." in Path(clean_path).parts:
            raise ValueError("Invalid project artifact path")
        return f"projects/{project_id}/{clean_path}"

    async def put_file(
        self,
        project_id: str,
        relative_path: str,
        local_path: Path,
        *,
        content_type: Optional[str] = None,
        overwrite: bool = False,
    ) -> str:
        if not self.remote_enabled:
            return relative_path
        from vercel.blob import AsyncBlobClient

        client = AsyncBlobClient()
        try:
            blob = await client.upload_file(
                local_path,
                self.blob_path(project_id, relative_path),
                access="private",
                content_type=content_type,
                overwrite=overwrite,
            )
            return blob.pathname
        finally:
            await client.aclose()

    async def put_bytes(
        self,
        project_id: str,
        relative_path: str,
        content: bytes,
        *,
        content_type: Optional[str] = None,
        overwrite: bool = False,
    ) -> str:
        if not self.remote_enabled:
            local_path = project_data_root() / f"project_{project_id}" / relative_path
            local_path.parent.mkdir(parents=True, exist_ok=True)
            local_path.write_bytes(content)
            return relative_path
        from vercel.blob import AsyncBlobClient

        client = AsyncBlobClient()
        try:
            blob = await client.put(
                self.blob_path(project_id, relative_path),
                content,
                access="private",
                content_type=content_type,
                overwrite=overwrite,
            )
            return blob.pathname
        finally:
            await client.aclose()

    async def get_bytes(self, project_id: str, relative_path: str):
        if not self.remote_enabled:
            local_path = project_data_root() / f"project_{project_id}" / relative_path
            if not local_path.is_file():
                return None
            return {
                "content": local_path.read_bytes(),
                "content_type": None,
                "etag": None,
            }
        from vercel.blob import AsyncBlobClient

        client = AsyncBlobClient()
        try:
            blob = await client.get(
                self.blob_path(project_id, relative_path),
                access="private",
                use_cache=True,
            )
            return {
                "content": blob.content,
                "content_type": blob.content_type,
                "etag": blob.etag,
            }
        finally:
            await client.aclose()

    async def delete_project(self, project_id: str) -> None:
        if not self.remote_enabled:
            return
        from vercel.blob import AsyncBlobClient

        client = AsyncBlobClient()
        try:
            paths: list[str] = []
            objects = await client.iter_objects(prefix=f"projects/{project_id}/")
            async for blob in objects:
                paths.append(blob.pathname)
                if len(paths) >= 100:
                    await client.delete(paths)
                    paths.clear()
            if paths:
                await client.delete(paths)
        finally:
            await client.aclose()


project_storage = ProjectStorage()

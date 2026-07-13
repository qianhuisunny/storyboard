"""Opaque, database-verifiable anonymous browser sessions."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AnonymousSession


SESSION_COOKIE = "plotline_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class SessionIdentity:
    id: str
    legacy_user_id: Optional[str]

    @property
    def owner_id(self) -> str:
        return f"session:{self.id}"

    def owns(self, stored_owner: str) -> bool:
        return stored_owner == self.owner_id or (
            self.legacy_user_id is not None and stored_owner == self.legacy_user_id
        )


async def find_session(db: AsyncSession, raw_token: Optional[str]) -> Optional[AnonymousSession]:
    if not raw_token or len(raw_token) > 512:
        return None
    result = await db.execute(
        select(AnonymousSession).where(
            AnonymousSession.token_hash == hash_session_token(raw_token)
        )
    )
    return result.scalar_one_or_none()


async def require_session(request: Request, db: AsyncSession) -> SessionIdentity:
    record = await find_session(db, request.cookies.get(SESSION_COOKIE))
    if record is None:
        raise HTTPException(status_code=401, detail="A valid browser session is required")
    return SessionIdentity(id=record.id, legacy_user_id=record.legacy_user_id)


async def issue_session(
    db: AsyncSession, *, legacy_user_id: Optional[str] = None
) -> tuple[AnonymousSession, str]:
    raw_token = secrets.token_urlsafe(32)
    record = AnonymousSession(
        id=str(uuid4()),
        token_hash=hash_session_token(raw_token),
        legacy_user_id=legacy_user_id,
    )
    db.add(record)
    await db.commit()
    return record, raw_token

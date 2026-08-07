"""Opaque, database-verifiable anonymous browser sessions."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
        return self.legacy_user_id or self.session_owner_id

    @property
    def session_owner_id(self) -> str:
        return f"session:{self.id}"

    def owns(self, stored_owner: str) -> bool:
        return stored_owner == self.session_owner_id or (
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
    """Issue a session, rotating the token when a browser identity returns."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_session_token(raw_token)

    if legacy_user_id:
        result = await db.execute(
            select(AnonymousSession).where(
                AnonymousSession.legacy_user_id == legacy_user_id
            )
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            existing.token_hash = token_hash
            existing.last_seen_at = datetime.now(timezone.utc)
            await db.commit()
            return existing, raw_token

    record = AnonymousSession(
        id=str(uuid4()),
        token_hash=token_hash,
        legacy_user_id=legacy_user_id,
    )
    db.add(record)
    try:
        await db.commit()
        return record, raw_token
    except IntegrityError:
        # A concurrent request may have created the legacy identity after the
        # lookup above. Rotate that record instead of dropping the identity.
        await db.rollback()
        if not legacy_user_id:
            raise
        result = await db.execute(
            select(AnonymousSession).where(
                AnonymousSession.legacy_user_id == legacy_user_id
            )
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            raise
        existing.token_hash = token_hash
        existing.last_seen_at = datetime.now(timezone.utc)
        await db.commit()
        return existing, raw_token

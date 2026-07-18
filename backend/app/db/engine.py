"""Async SQLAlchemy engine for local SQLite and hosted Postgres."""

import os
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Default DB path: data/plotline.db (relative to repo root)
_default_db_path = Path(__file__).parent.parent.parent.parent / "data" / "plotline.db"
_raw_database_url = os.environ.get(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{_default_db_path}",
)


def normalize_async_database_url(database_url: str) -> str:
    """Select an async SQLAlchemy driver without changing credentials/options."""
    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql", "postgresql+psycopg2"}:
        url = url.set(drivername="postgresql+psycopg")
    return url.render_as_string(hide_password=False)


DATABASE_URL = normalize_async_database_url(_raw_database_url)


def create_database_async_engine(database_url: str, **kwargs) -> AsyncEngine:
    """Create an async engine with safe defaults for the selected backend."""
    normalized_url = normalize_async_database_url(database_url)
    url = make_url(normalized_url)
    if url.get_backend_name() == "postgresql":
        kwargs.setdefault("pool_pre_ping", True)
        kwargs.setdefault("pool_recycle", 300)
    database_engine = create_async_engine(normalized_url, **kwargs)
    if database_engine.url.get_backend_name() == "sqlite":

        @event.listens_for(database_engine.sync_engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
            finally:
                cursor.close()

    return database_engine


def create_sqlite_async_engine(database_url: str, **kwargs) -> AsyncEngine:
    """Backward-compatible alias retained for temp/test database callers."""
    return create_database_async_engine(database_url, **kwargs)


engine = create_database_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """Get an async database session."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    """Create all tables (for development / first run)."""
    from .models import Base
    if engine.url.get_backend_name() == "sqlite":
        _default_db_path.parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

"""
Async SQLite engine via SQLAlchemy 2.0 + aiosqlite.
"""

import os
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Default DB path: data/plotline.db (relative to repo root)
_default_db_path = Path(__file__).parent.parent.parent.parent / "data" / "plotline.db"
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite+aiosqlite:///{_default_db_path}")


def create_sqlite_async_engine(database_url: str, **kwargs) -> AsyncEngine:
    """Create an async engine with SQLite referential integrity enabled."""
    database_engine = create_async_engine(database_url, **kwargs)
    if database_engine.url.get_backend_name() == "sqlite":

        @event.listens_for(database_engine.sync_engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
            finally:
                cursor.close()

    return database_engine


engine = create_sqlite_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """Get an async database session."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    """Create all tables (for development / first run)."""
    from .models import Base
    # Ensure the data directory exists
    _default_db_path.parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

"""
Async SQLite engine via SQLAlchemy 2.0 + aiosqlite.
"""

import os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Default DB path: data/plotline.db (relative to repo root)
_default_db_path = Path(__file__).parent.parent.parent.parent / "data" / "plotline.db"
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite+aiosqlite:///{_default_db_path}")

engine = create_async_engine(DATABASE_URL, echo=False)
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

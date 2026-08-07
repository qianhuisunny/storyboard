"""Vercel entrypoint for the Plotline FastAPI backend."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402


__all__ = ["app"]

"""
Storyboard Agents - Multi-agent system for video storyboard generation.

Agents:
- BriefBuilder: Creates Story Brief from intake form + context
- StoryboardDirector: Creates screen outline (initial and revision modes)
- StoryboardWriter: Converts outline to production-ready storyboard
- EvidenceResearcher: Generates evidence research for outline sections

Sub-agents (called by Writer):
- DurationCalculator: Calculates precise screen durations
"""

from .base import BaseAgent
from .brief_builder import BriefBuilder
from .storyboard_director import StoryboardDirector
from .storyboard_writer import StoryboardWriter
from .duration_calculator import DurationCalculator
from .evidence_researcher import EvidenceResearcher

__all__ = [
    "BaseAgent",
    "BriefBuilder",
    "StoryboardDirector",
    "StoryboardWriter",
    "DurationCalculator",
    "EvidenceResearcher",
]

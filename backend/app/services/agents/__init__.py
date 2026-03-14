"""
Storyboard Agents - Multi-agent system for video storyboard generation.

Agents:
- BriefBuilder: Creates Story Brief from intake form + context
- StoryboardDirector: Creates screen outline (initial and revision modes)
- StoryboardWriter: Converts outline to production-ready storyboard

Sub-agents (called by Writer):
- DurationCalculator: Calculates precise screen durations

NOTE: TopicResearcher is commented out — research is disabled for now.
"""

from .base import BaseAgent
from .topic_researcher import TopicResearcher  # Re-enabled for angle/perspective generation
from .brief_builder import BriefBuilder
from .storyboard_director import StoryboardDirector
from .storyboard_writer import StoryboardWriter
from .duration_calculator import DurationCalculator
from .evidence_researcher import EvidenceResearcher

__all__ = [
    "BaseAgent",
    "TopicResearcher",
    "BriefBuilder",
    "StoryboardDirector",
    "StoryboardWriter",
    "DurationCalculator",
    "EvidenceResearcher",
]

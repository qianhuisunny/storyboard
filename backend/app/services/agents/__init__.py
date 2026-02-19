"""
Storyboard Agents - Multi-agent system for video storyboard generation.

Agents:
- TopicResearcher: Gathers context about company/product/industry
- BriefBuilder: Creates Story Brief from intake form + context
- StoryboardDirector: Creates screen outline (initial and revision modes)
- StoryboardWriter: Converts outline to production-ready storyboard

Sub-agents (called by Writer):
- DurationCalculator: Calculates precise screen durations
- ImageResearcher: Finds visual assets for screens
"""

from .base import BaseAgent
from .topic_researcher import TopicResearcher
from .brief_builder import BriefBuilder
from .storyboard_director import StoryboardDirector
from .storyboard_writer import StoryboardWriter
from .duration_calculator import DurationCalculator
from .image_researcher import ImageResearcher

__all__ = [
    "BaseAgent",
    "TopicResearcher",
    "BriefBuilder",
    "StoryboardDirector",
    "StoryboardWriter",
    "DurationCalculator",
    "ImageResearcher",
]

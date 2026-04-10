from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ScreenType(str, Enum):
    TALKING_HEAD = "talking_head"
    SLIDES = "slides"


@dataclass
class Panel:
    panel_number: int
    screen_type: ScreenType
    duration_seconds: float
    voiceover_script: str
    visual_direction: list[str]
    # Populated during pipeline execution
    audio_path: Optional[str] = None
    clip_path: Optional[str] = None


@dataclass
class Storyboard:
    title: str
    total_duration: str
    total_panels: int
    panels: list[Panel]

    @property
    def talking_head_panels(self) -> list[Panel]:
        return [p for p in self.panels if p.screen_type == ScreenType.TALKING_HEAD]

    @property
    def slides_panels(self) -> list[Panel]:
        return [p for p in self.panels if p.screen_type == ScreenType.SLIDES]


@dataclass
class PipelineConfig:
    storyboard_path: str
    avatar_image_path: str
    output_dir: str
    voice: str = "alloy"
    kling_model: str = "standard"  # "standard" or "pro"
    max_parallel: int = 4
    skip_tts: bool = False
    skip_avatar: bool = False
    only_panels: Optional[list[int]] = None

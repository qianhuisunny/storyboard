from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ScreenType(str, Enum):
    TALKING_HEAD = "talking_head"
    SLIDES = "slides"
    # Stock video (B-roll) panels — driven by Pexels search + ffmpeg
    # audio overlay, see backend/app/services/video/stock_video.py
    STOCK_VIDEO = "stock_video"


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

    @property
    def stock_video_panels(self) -> list[Panel]:
        return [p for p in self.panels if p.screen_type == ScreenType.STOCK_VIDEO]


@dataclass
class PipelineConfig:
    storyboard_path: str
    output_dir: str
    voice: str = "alloy"  # OpenAI TTS voice for slides panels
    # HeyGen talking-head settings. See backend/app/services/video/heygen.py
    # for defaults and how avatar_id is interpreted (it's actually a
    # look_id internally).
    heygen_avatar_id: str = "Lisa_public"
    heygen_voice_id: str = "1bd001e7e50f421d891986aad5158bc8"
    heygen_avatar_style: str = "normal"
    max_parallel: int = 4
    skip_tts: bool = False
    skip_avatar: bool = False
    only_panels: Optional[list[int]] = None

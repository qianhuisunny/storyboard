from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class ScreenType(str, Enum):
    TALKING_HEAD = "talking_head"
    STOCK_VIDEO = "stock_video"
    PRODUCT_DEMO = "product_demo"
    SOLID_BG = "solid_bg"


class Composition(str, Enum):
    SINGLE_CENTER = "single_center"
    PRIMARY_WITH_SIDECAR = "primary_with_sidecar"
    TWO_PANEL_SPLIT = "two_panel_split"
    THREE_UP_GRID = "three_up_grid"
    FOUR_UP_GRID = "four_up_grid"
    MOSAIC = "mosaic"
    FREE_OVERLAY = "free_overlay"


class CanvasMode(str, Enum):
    FULL_BLEED = "full_bleed"
    BOUNDED = "bounded"
    FLOATING = "floating"
    NONE = "none"


@dataclass
class Panel:
    panel_number: int
    screen_type: ScreenType
    composition: Composition
    duration_seconds: float
    voiceover_script: str
    overlay_elements: list[dict[str, Any]] = field(default_factory=list)
    design_brief: list[str] = field(default_factory=list)
    canvas_mode: CanvasMode = CanvasMode.NONE
    base_media_path: Optional[str] = None
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
    def stock_video_panels(self) -> list[Panel]:
        return [p for p in self.panels if p.screen_type == ScreenType.STOCK_VIDEO]

    @property
    def product_demo_panels(self) -> list[Panel]:
        return [p for p in self.panels if p.screen_type == ScreenType.PRODUCT_DEMO]

    @property
    def solid_bg_panels(self) -> list[Panel]:
        return [p for p in self.panels if p.screen_type == ScreenType.SOLID_BG]


@dataclass
class PipelineConfig:
    storyboard_path: str
    output_dir: str
    voice: str = "alloy"
    heygen_avatar_id: str = "Lisa_public"
    heygen_voice_id: str = "1bd001e7e50f421d891986aad5158bc8"
    heygen_avatar_style: str = "normal"
    max_parallel: int = 4
    skip_tts: bool = False
    skip_avatar: bool = False
    only_panels: Optional[list[int]] = None
    talking_head_provider: str = "heygen"
    seedance_ref_image: Optional[str] = None
    enable_overlay: bool = False
    skip_overlay_gen: bool = False

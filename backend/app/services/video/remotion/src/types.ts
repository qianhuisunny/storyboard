export type ScreenType =
  | "talking_head"
  | "stock_video"
  | "product_demo"
  | "solid_bg";

export type Composition =
  | "single_center"
  | "primary_with_sidecar"
  | "two_panel_split"
  | "three_up_grid"
  | "four_up_grid"
  | "mosaic"
  | "free_overlay";

export type CanvasMode =
  | "full_bleed"
  | "bounded"
  | "floating"
  | "none";

export interface OverlayStyle {
  color?: string;
  bg?: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface OverlayPlacement {
  colStart?: number;
  colSpan?: number;
  rowStart?: number;
  rowSpan?: number;
  alignX?: "start" | "center" | "end" | "stretch";
  alignY?: "start" | "center" | "end" | "stretch";
}

export interface OverlayElement {
  id?: string;
  kind:
    | "headline"
    | "subhead"
    | "stat"
    | "stat_pill"
    | "label"
    | "badge"
    | "icon_card"
    | "screenshot_card"
    | "image_card"
    | "example_card"
    | "ui_window"
    | "presenter_video"
    | "arrow"
    | "pros_cons_block";
  text?: string;
  title?: string;
  value?: string;
  items?: string[];
  imageSrc?: string;
  videoSrc?: string;
  icon?: string;
  zone?: "primary" | "sidecar";
  position?: string;
  placement?: OverlayPlacement;
  t?: number;
  dur?: number;
  style?: OverlayStyle;
}

export interface SceneCompositionProps {
  screenType: ScreenType;
  composition: Composition;
  canvasMode?: CanvasMode;
  durationSeconds: number;
  audioSrc?: string;
  baseVideoPath?: string;
  overlayElements: OverlayElement[];
}

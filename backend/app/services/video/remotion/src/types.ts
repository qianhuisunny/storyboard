export interface KeyframeStyle {
  color?: string;
  bg?: string;
  fontSize?: number;
}

export interface Keyframe {
  t: number;
  dur?: number;
  type: "stat" | "badge" | "quote" | "label" | "divider" | "transition";
  text?: string;
  position?: string;
  style?: KeyframeStyle;
  accent_word?: string;
  effect?: "scroll_up" | "fade" | "wipe";
}

export interface KeyframeOverlayProps {
  seedanceVideoPath: string;
  durationSeconds: number;
  keyframes: Keyframe[];
}

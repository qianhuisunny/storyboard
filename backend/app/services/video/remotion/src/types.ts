export interface KeyframeStyle {
  color?: string;
  bg?: string;
  fontSize?: number;
}

export interface Keyframe {
  t: number;
  dur?: number;
  type: "stat" | "callout" | "quote" | "label" | "divider";
  text?: string;
  position?: string;
  style?: KeyframeStyle;
  accent_word?: string;
  icon?: string;
}

export interface KeyframeOverlayProps {
  seedanceVideoPath: string;
  durationSeconds: number;
  keyframes: Keyframe[];
}

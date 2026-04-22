import React from "react";
import { interpolate } from "remotion";
import { FADE_FRAMES, FPS } from "../../theme";
import { Keyframe } from "../../types";
import { Stat } from "./Stat";
import { Badge } from "./Badge";
import { Label } from "./Label";
import { Quote } from "./Quote";
import { Divider } from "./Divider";

interface KeyframeElementProps {
  kf: Keyframe;
  currentFrame: number;
}

export const KeyframeElement: React.FC<KeyframeElementProps> = ({
  kf,
  currentFrame,
}) => {
  if (kf.type === "transition") return null;

  const startFrame = Math.round(kf.t * FPS);

  // Fade in
  const fadeIn = interpolate(
    currentFrame,
    [startFrame, startFrame + FADE_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Fade out (only if duration is specified)
  let fadeOut = 1;
  if (kf.dur != null) {
    const endFrame = Math.round((kf.t + kf.dur) * FPS);
    fadeOut = interpolate(
      currentFrame,
      [endFrame - FADE_FRAMES, endFrame],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  const opacity = fadeIn * fadeOut;
  if (opacity <= 0) return null;

  switch (kf.type) {
    case "stat":
      return <Stat kf={kf} opacity={opacity} />;
    case "badge":
      return <Badge kf={kf} opacity={opacity} />;
    case "label":
      return <Label kf={kf} opacity={opacity} />;
    case "quote":
      return <Quote kf={kf} opacity={opacity} />;
    case "divider":
      return <Divider kf={kf} opacity={opacity} />;
    default:
      return null;
  }
};

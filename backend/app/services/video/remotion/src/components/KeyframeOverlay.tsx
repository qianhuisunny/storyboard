import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { KeyframeOverlayProps } from "../types";
import { KeyframeElement } from "./overlays/KeyframeElement";

export const KeyframeOverlay: React.FC<KeyframeOverlayProps> = ({
  seedanceVideoPath,
  keyframes,
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      {seedanceVideoPath && (
        <OffthreadVideo
          src={staticFile(seedanceVideoPath)}
          style={{ width: "100%", height: "100%" }}
        />
      )}
      {keyframes.map((kf, i) => (
        <KeyframeElement key={i} kf={kf} currentFrame={frame} />
      ))}
    </AbsoluteFill>
  );
};

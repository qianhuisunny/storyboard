import React from "react";
import { FONT_FAMILY } from "../../theme";
import { Keyframe } from "../../types";

interface StatProps {
  kf: Keyframe;
  opacity: number;
}

export const Stat: React.FC<StatProps> = ({ kf, opacity }) => {
  const fontSize = kf.style?.fontSize ?? 96;
  const color = kf.style?.color ?? "#FFFFFF";
  const scale = 0.9 + 0.1 * opacity; // 0.9 → 1.0 during fade-in

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 800,
          color,
          textAlign: "center",
        }}
      >
        {kf.text}
      </span>
    </div>
  );
};

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
  const slideUp = (1 - opacity) * 20;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        opacity,
        transform: `translateY(${slideUp}px)`,
      }}
    >
      {kf.icon && (
        <span style={{ fontSize: 96, lineHeight: 1 }}>{kf.icon}</span>
      )}
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

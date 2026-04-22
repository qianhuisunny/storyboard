import React from "react";
import { FONT_FAMILY, BODY_SIZE } from "../../theme";
import { Keyframe } from "../../types";

interface LabelProps {
  kf: Keyframe;
  opacity: number;
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  center: {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  },
  top_center: {
    top: "8%",
    left: "50%",
    transform: "translateX(-50%)",
  },
  bottom_center: {
    bottom: "8%",
    left: "50%",
    transform: "translateX(-50%)",
  },
  left: {
    top: "50%",
    left: "5%",
    transform: "translateY(-50%)",
  },
  right: {
    top: "50%",
    right: "5%",
    transform: "translateY(-50%)",
  },
};

function getPositionStyle(position?: string): React.CSSProperties {
  if (!position) return POSITION_STYLES.center;
  return POSITION_STYLES[position] ?? POSITION_STYLES.center;
}

export const Label: React.FC<LabelProps> = ({ kf, opacity }) => {
  const color = kf.style?.color ?? "#FFFFFF";
  const fontSize = kf.style?.fontSize ?? BODY_SIZE;
  const posStyle = getPositionStyle(kf.position);

  return (
    <div
      style={{
        position: "absolute",
        ...posStyle,
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 400,
          color,
        }}
      >
        {kf.text}
      </span>
    </div>
  );
};

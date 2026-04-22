import React from "react";
import { FONT_FAMILY, HEADING_SIZE } from "../../theme";
import { Keyframe } from "../../types";

interface BadgeProps {
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
    top: "10%",
    left: "50%",
    transform: "translateX(-50%)",
  },
  bottom_center: {
    bottom: "10%",
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
  right_upper: {
    top: "20%",
    right: "5%",
  },
  right_lower: {
    bottom: "20%",
    right: "5%",
  },
};

/**
 * Parse row_NofM position format for evenly-spaced row layouts.
 * e.g. "row_1of3" → row 1 of 3, placed at 25% vertical.
 */
function parseRowPosition(pos: string): React.CSSProperties | null {
  const match = pos.match(/^row_(\d+)of(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  const pct = ((n) / (total + 1)) * 100;
  return {
    top: `${pct}%`,
    left: "50%",
    transform: "translateX(-50%)",
  };
}

function getPositionStyle(position?: string): React.CSSProperties {
  if (!position) return POSITION_STYLES.center;
  if (POSITION_STYLES[position]) return POSITION_STYLES[position];
  const rowStyle = parseRowPosition(position);
  if (rowStyle) return rowStyle;
  return POSITION_STYLES.center;
}

export const Badge: React.FC<BadgeProps> = ({ kf, opacity }) => {
  const bg = kf.style?.bg ?? "rgba(0,0,0,0.7)";
  const color = kf.style?.color ?? "#FFFFFF";
  const fontSize = kf.style?.fontSize ?? HEADING_SIZE;
  const posStyle = getPositionStyle(kf.position);
  const slideOffset = (1 - opacity) * 8; // 8px slide-in during fade

  return (
    <div
      style={{
        position: "absolute",
        ...posStyle,
        opacity,
        marginTop: slideOffset,
      }}
    >
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 700,
          color,
          backgroundColor: bg,
          borderRadius: 12,
          padding: "16px 32px",
          whiteSpace: "nowrap",
        }}
      >
        {kf.text}
      </div>
    </div>
  );
};

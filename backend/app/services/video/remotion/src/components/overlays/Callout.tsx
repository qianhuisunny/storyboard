import React from "react";
import { Keyframe } from "../../types";

interface CalloutProps {
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
    top: "30%",
    left: "8%",
  },
  right: {
    top: "30%",
    right: "8%",
  },
  left_lower: {
    top: "55%",
    left: "8%",
  },
  right_lower: {
    top: "55%",
    right: "8%",
  },
};

function parseRowPosition(pos: string): React.CSSProperties | null {
  const match = pos.match(/^row_(\d+)of(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  const pct = (n / (total + 1)) * 100;
  return {
    top: "60%",
    left: `${pct}%`,
    transform: "translate(-50%, -50%)",
  };
}

function getPositionStyle(position?: string): React.CSSProperties {
  if (!position) return POSITION_STYLES.center;
  if (POSITION_STYLES[position]) return POSITION_STYLES[position];
  const rowStyle = parseRowPosition(position);
  if (rowStyle) return rowStyle;
  return POSITION_STYLES.center;
}

export const Callout: React.FC<CalloutProps> = ({ kf, opacity }) => {
  const bg = kf.style?.bg ?? "rgba(248,180,180,0.9)";
  const color = kf.style?.color ?? "#CC3333";
  const fontSize = kf.style?.fontSize ?? 36;
  const posStyle = getPositionStyle(kf.position);
  const slideOffset = (1 - opacity) * 12;

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
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontSize,
          fontWeight: 700,
          fontStyle: "italic",
          color,
          backgroundColor: bg,
          borderRadius: 20,
          padding: "20px 40px",
          whiteSpace: "nowrap",
        }}
      >
        {kf.icon && <span style={{ fontSize: fontSize * 1.5, fontStyle: "normal" }}>{kf.icon}</span>}
        {kf.text}
      </div>
    </div>
  );
};

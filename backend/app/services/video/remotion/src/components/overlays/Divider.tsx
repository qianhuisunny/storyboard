import React from "react";
import { Keyframe } from "../../types";

interface DividerProps {
  kf: Keyframe;
  opacity: number;
}

const SERIF_FAMILY = "'Georgia', 'Times New Roman', serif";

export const Divider: React.FC<DividerProps> = ({ kf, opacity }) => {
  const text = kf.text ?? "";
  const parts = text.split("|").map((s) => s.trim());
  const partLabel = parts[0] ?? "";
  const title = parts[1] ?? text;

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
        gap: 24,
        opacity,
      }}
    >
      {kf.icon && (
        <div
          style={{
            fontSize: 120,
            lineHeight: 1,
            backgroundColor: "#FFFFFF",
            borderRadius: 24,
            padding: "20px 24px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          }}
        >
          {kf.icon}
        </div>
      )}
      {partLabel && (
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "#333333",
            backgroundColor: "#F5F5F5",
            borderRadius: 8,
            padding: "8px 24px",
          }}
        >
          {partLabel}
        </div>
      )}
      <div
        style={{
          fontFamily: SERIF_FAMILY,
          fontSize: 56,
          fontWeight: 800,
          color: kf.style?.color ?? "#FFFFFF",
          textAlign: "center",
          maxWidth: "80%",
        }}
      >
        {title}
      </div>
    </div>
  );
};

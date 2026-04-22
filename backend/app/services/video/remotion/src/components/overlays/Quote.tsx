import React from "react";
import { Keyframe } from "../../types";

interface QuoteProps {
  kf: Keyframe;
  opacity: number;
}

const SERIF_FAMILY = "'Georgia', 'Times New Roman', serif";
const DEFAULT_ACCENT_COLOR = "#C87941";

export const Quote: React.FC<QuoteProps> = ({ kf, opacity }) => {
  const fontSize = kf.style?.fontSize ?? 64;
  const color = kf.style?.color ?? "#FFFFFF";
  const accentColor = kf.style?.bg ?? DEFAULT_ACCENT_COLOR;
  const words = (kf.text ?? "").split(/\s+/);
  const accentWord = kf.accent_word?.toLowerCase();

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
        padding: "0 120px",
        opacity,
      }}
    >
      <p
        style={{
          fontFamily: SERIF_FAMILY,
          fontSize,
          fontWeight: 800,
          color,
          textAlign: "center",
          lineHeight: 1.3,
          margin: 0,
        }}
      >
        {words.map((word, i) => {
          const isAccent =
            accentWord && word.toLowerCase().includes(accentWord);
          return (
            <React.Fragment key={i}>
              {i > 0 && " "}
              <span style={isAccent ? { color: accentColor } : undefined}>
                {word}
              </span>
            </React.Fragment>
          );
        })}
      </p>
    </div>
  );
};

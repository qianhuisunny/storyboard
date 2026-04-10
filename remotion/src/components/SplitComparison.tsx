import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface Side {
  label: string;
  description: string;
  metric?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

interface SplitComparisonProps {
  title: string;
  left: Side;
  right: Side;
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
}

const sentimentColor = (s?: string) => {
  if (s === "positive") return "#2D6A4F";
  if (s === "negative") return "#A63228";
  return "#666";
};

export const SplitComparison: React.FC<SplitComparisonProps> = ({
  title,
  left,
  right,
  footnote,
  audioSrc,
}) => {
  const frame = useCurrentFrame();
  const leftOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const rightOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateRight: "clamp" });

  const renderSide = (side: Side, opacity: number) => (
    <div
      style={{
        flex: 1,
        backgroundColor: "#f8f9fa",
        borderRadius: 12,
        padding: 32,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 600, color: "#1a1a1a" }}>{side.label}</div>
      <div style={{ fontSize: 18, color: "#666", textAlign: "center" }}>{side.description}</div>
      {side.metric && (
        <div style={{ fontSize: 48, fontWeight: 700, color: sentimentColor(side.sentiment) }}>
          {side.metric}
        </div>
      )}
    </div>
  );

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div style={{ display: "flex", gap: 24, width: "100%" }}>
        {renderSide(left, leftOpacity)}
        <div style={{ display: "flex", alignItems: "center", fontSize: 32, color: "#ccc" }}>vs</div>
        {renderSide(right, rightOpacity)}
      </div>
      {footnote && (
        <div style={{ textAlign: "center", fontSize: 14, color: "#999", marginTop: 20 }}>
          Source: {footnote}
        </div>
      )}
    </SlideWrapper>
  );
};

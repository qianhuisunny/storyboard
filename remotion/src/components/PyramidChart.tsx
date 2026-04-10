import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface Level {
  label: string;
  percentage: number;
}

interface PyramidChartProps {
  title: string;
  levels: Level[];
  annotation?: string;
  annotationDirection?: "upward" | "downward";
  audioSrc?: string;
  durationInSeconds?: number;
}

export const PyramidChart: React.FC<PyramidChartProps> = ({
  title,
  levels,
  annotation,
  audioSrc,
}) => {
  const frame = useCurrentFrame();
  const maxWidth = 800;

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
        {levels.map((level, i) => {
          const widthFraction = 1 - i * (0.6 / levels.length);
          const opacity = interpolate(frame, [i * 10, i * 10 + 15], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                width: maxWidth * widthFraction,
                backgroundColor: `hsl(150, ${30 + i * 10}%, ${85 - i * 8}%)`,
                borderRadius: 8,
                padding: "16px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 600, color: "#2D6A4F" }}>{level.label}</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{level.percentage}%</span>
            </div>
          );
        })}
        {annotation && (
          <div
            style={{
              marginTop: 20,
              fontSize: 20,
              color: "#666",
              fontStyle: "italic",
              opacity: interpolate(frame, [levels.length * 10, levels.length * 10 + 15], [0, 1], { extrapolateRight: "clamp" }),
            }}
          >
            ↑ {annotation}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};

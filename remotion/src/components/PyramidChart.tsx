import React from "react";
import { useCurrentFrame } from "remotion";
import { SlideWrapper, elementOpacity, ElementTimings } from "./SlideWrapper";
import {
  HEADING_SIZE,
  HEADING_WEIGHT,
  METRIC_SIZE,
  METRIC_WEIGHT,
  BODY_SIZE,
  COLOR_TITLE,
  COLOR_MUTED,
  COLOR_ACCENT,
} from "../theme";

interface Level {
  label: string;
  percentage: number;
}

interface PyramidChartProps {
  title: string;
  subtitle?: string;
  levels: Level[];
  annotation?: string;
  annotationDirection?: "upward" | "downward";
  audioSrc?: string;
  durationInSeconds?: number;
  elementTimings?: ElementTimings;
}

export const PyramidChart: React.FC<PyramidChartProps> = ({
  title,
  subtitle,
  levels,
  annotation,
  annotationDirection,
  audioSrc,
  elementTimings,
}) => {
  const frame = useCurrentFrame();
  const maxWidth = 800;

  return (
    <SlideWrapper title={title} subtitle={subtitle} audioSrc={audioSrc}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          width: "100%",
        }}
      >
        {levels.map((level, i) => {
          const widthFraction = 1 - i * (0.6 / levels.length);
          const opacity = elementOpacity(
            frame,
            `level_${i}`,
            elementTimings,
            i,
          );
          return (
            <div
              key={i}
              style={{
                width: maxWidth * widthFraction,
                backgroundColor: `hsl(150, ${30 + i * 10}%, ${85 - i * 8}%)`,
                borderRadius: 8,
                padding: "20px 28px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity,
              }}
            >
              <span
                style={{
                  fontSize: HEADING_SIZE,
                  fontWeight: HEADING_WEIGHT,
                  color: COLOR_ACCENT,
                }}
              >
                {level.label}
              </span>
              <span
                style={{
                  fontSize: METRIC_SIZE,
                  fontWeight: METRIC_WEIGHT,
                  color: COLOR_TITLE,
                }}
              >
                {level.percentage}%
              </span>
            </div>
          );
        })}
        {annotation && (
          <div
            style={{
              marginTop: 24,
              fontSize: BODY_SIZE,
              color: COLOR_MUTED,
              fontStyle: "italic",
              opacity: elementOpacity(
                frame,
                "annotation",
                elementTimings,
                levels.length,
              ),
            }}
          >
            {annotationDirection === "downward" ? "↓" : "↑"} {annotation}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};

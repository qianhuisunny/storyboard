import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface TimelineEvent {
  label: string;
  description: string;
  highlight?: boolean;
}

interface TimelineProps {
  title: string;
  events: TimelineEvent[];
  direction?: "horizontal" | "vertical";
  audioSrc?: string;
  durationInSeconds?: number;
}

export const Timeline: React.FC<TimelineProps> = ({
  title,
  events,
  direction = "horizontal",
  audioSrc,
}) => {
  const frame = useCurrentFrame();
  const isVertical = direction === "vertical";

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div
        style={{
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
          gap: 16,
          width: "100%",
          alignItems: isVertical ? "flex-start" : "flex-end",
        }}
      >
        {events.map((event, i) => {
          const opacity = interpolate(frame, [i * 12, i * 12 + 15], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                flex: 1,
                opacity,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: event.highlight ? "#2D6A4F" : "#ccc",
                }}
              />
              <div style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a", textAlign: "center" }}>
                {event.label}
              </div>
              <div style={{ fontSize: 14, color: "#666", textAlign: "center" }}>
                {event.description}
              </div>
            </div>
          );
        })}
      </div>
    </SlideWrapper>
  );
};

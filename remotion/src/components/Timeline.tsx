import React from "react";
import { useCurrentFrame } from "remotion";
import { SlideWrapper, elementOpacity, ElementTimings } from "./SlideWrapper";
import {
  HEADING_SIZE,
  HEADING_WEIGHT,
  BODY_SIZE,
  COLOR_TITLE,
  COLOR_MUTED,
  COLOR_ACCENT,
} from "../theme";

interface TimelineEvent {
  label: string;
  description: string;
  highlight?: boolean;
}

interface TimelineProps {
  title: string;
  subtitle?: string;
  events: TimelineEvent[];
  direction?: "horizontal" | "vertical";
  audioSrc?: string;
  durationInSeconds?: number;
  elementTimings?: ElementTimings;
}

export const Timeline: React.FC<TimelineProps> = ({
  title,
  subtitle,
  events,
  direction = "horizontal",
  audioSrc,
  elementTimings,
}) => {
  const frame = useCurrentFrame();
  const isVertical = direction === "vertical";

  return (
    <SlideWrapper title={title} subtitle={subtitle} audioSrc={audioSrc}>
      <div
        style={{
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
          gap: 20,
          width: "100%",
          alignItems: isVertical ? "flex-start" : "flex-end",
        }}
      >
        {events.map((event, i) => {
          const opacity = elementOpacity(
            frame,
            `event_${i}`,
            elementTimings,
            i,
            0.5,
          );
          return (
            <div
              key={i}
              style={{
                flex: 1,
                opacity,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  backgroundColor: event.highlight ? COLOR_ACCENT : "#d0d0d0",
                }}
              />
              <div
                style={{
                  fontSize: HEADING_SIZE,
                  fontWeight: HEADING_WEIGHT,
                  color: COLOR_TITLE,
                  textAlign: "center",
                }}
              >
                {event.label}
              </div>
              <div
                style={{
                  fontSize: BODY_SIZE,
                  color: COLOR_MUTED,
                  textAlign: "center",
                }}
              >
                {event.description}
              </div>
            </div>
          );
        })}
      </div>
    </SlideWrapper>
  );
};

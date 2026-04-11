import React from "react";
import { useCurrentFrame } from "remotion";
import { SlideWrapper, elementOpacity, ElementTimings } from "./SlideWrapper";
import {
  HEADING_SIZE,
  HEADING_WEIGHT,
  METRIC_SIZE,
  METRIC_WEIGHT,
  BODY_SIZE,
  BODY_LINE_HEIGHT,
  META_SIZE,
  COLOR_TITLE,
  COLOR_MUTED,
  COLOR_META,
  COLOR_CARD_BG,
  sentimentColor,
} from "../theme";

interface Side {
  label: string;
  description: string;
  metric?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

interface SplitComparisonProps {
  title: string;
  subtitle?: string;
  left: Side;
  right: Side;
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
  elementTimings?: ElementTimings;
}

export const SplitComparison: React.FC<SplitComparisonProps> = ({
  title,
  subtitle,
  left,
  right,
  footnote,
  audioSrc,
  elementTimings,
}) => {
  const frame = useCurrentFrame();
  const leftOpacity = elementOpacity(frame, "left", elementTimings, 0, 0.0);
  const rightOpacity = elementOpacity(frame, "right", elementTimings, 1, 0.8);

  const renderSide = (side: Side, opacity: number) => (
    <div
      style={{
        flex: 1,
        backgroundColor: COLOR_CARD_BG,
        borderRadius: 12,
        padding: 40,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          fontSize: HEADING_SIZE,
          fontWeight: HEADING_WEIGHT,
          color: COLOR_TITLE,
        }}
      >
        {side.label}
      </div>
      <div
        style={{
          fontSize: BODY_SIZE,
          color: COLOR_MUTED,
          textAlign: "center",
          lineHeight: BODY_LINE_HEIGHT,
        }}
      >
        {side.description}
      </div>
      {side.metric && (
        <div
          style={{
            fontSize: METRIC_SIZE,
            fontWeight: METRIC_WEIGHT,
            color: sentimentColor(side.sentiment),
            marginTop: 8,
          }}
        >
          {side.metric}
        </div>
      )}
    </div>
  );

  return (
    <SlideWrapper title={title} subtitle={subtitle} audioSrc={audioSrc}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", gap: 24, width: "100%" }}>
          {renderSide(left, leftOpacity)}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: HEADING_SIZE,
              color: "#cccccc",
            }}
          >
            vs
          </div>
          {renderSide(right, rightOpacity)}
        </div>
        {footnote && (
          <div
            style={{
              textAlign: "center",
              fontSize: META_SIZE,
              color: COLOR_META,
            }}
          >
            Source: {footnote}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};

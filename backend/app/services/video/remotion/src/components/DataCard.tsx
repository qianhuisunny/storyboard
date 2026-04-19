import React from "react";
import { useCurrentFrame } from "remotion";
import { SlideWrapper, elementOpacity, ElementTimings } from "./SlideWrapper";
import {
  HEADING_SIZE,
  METRIC_SIZE,
  METRIC_WEIGHT,
  BODY_SIZE,
  BODY_LINE_HEIGHT,
  META_SIZE,
  COLOR_BODY,
  COLOR_MUTED,
  COLOR_META,
  COLOR_CARD_BG,
  sentimentColor,
} from "../theme";

interface Stat {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
}

interface DataCardProps {
  title: string;
  subtitle?: string;
  stats?: Stat[];
  bullets?: string[];
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
  elementTimings?: ElementTimings;
}

const trendIcon = (t?: string) => {
  if (t === "up") return "↑";
  if (t === "down") return "↓";
  return "→";
};

const trendToSentiment = (
  t?: string,
): "positive" | "negative" | "neutral" => {
  if (t === "up") return "positive";
  if (t === "down") return "negative";
  return "neutral";
};

export const DataCard: React.FC<DataCardProps> = ({
  title,
  subtitle,
  stats,
  bullets,
  footnote,
  audioSrc,
  elementTimings,
}) => {
  const frame = useCurrentFrame();

  return (
    <SlideWrapper title={title} subtitle={subtitle} audioSrc={audioSrc}>
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {stats && (
          <div
            style={{
              display: "flex",
              gap: 24,
              justifyContent: "center",
            }}
          >
            {stats.map((stat, i) => {
              const opacity = elementOpacity(
                frame,
                `stat_${i}`,
                elementTimings,
                i,
              );
              return (
                <div
                  key={i}
                  style={{
                    textAlign: "center",
                    opacity,
                    padding: 28,
                    backgroundColor: COLOR_CARD_BG,
                    borderRadius: 12,
                    minWidth: 200,
                  }}
                >
                  <div
                    style={{
                      fontSize: METRIC_SIZE,
                      fontWeight: METRIC_WEIGHT,
                      color: sentimentColor(trendToSentiment(stat.trend)),
                    }}
                  >
                    {stat.value} {trendIcon(stat.trend)}
                  </div>
                  <div
                    style={{
                      fontSize: BODY_SIZE,
                      color: COLOR_MUTED,
                      marginTop: 12,
                    }}
                  >
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {bullets && (
          <ul style={{ margin: 0, paddingLeft: 28 }}>
            {bullets.map((b, i) => {
              const opacity = elementOpacity(
                frame,
                `bullet_${i}`,
                elementTimings,
                i,
                0.5,
              );
              return (
                <li
                  key={i}
                  style={{
                    fontSize: HEADING_SIZE,
                    color: COLOR_BODY,
                    marginBottom: 16,
                    lineHeight: BODY_LINE_HEIGHT,
                    opacity,
                  }}
                >
                  {b}
                </li>
              );
            })}
          </ul>
        )}
        {footnote && (
          <div
            style={{
              textAlign: "center",
              fontSize: META_SIZE,
              color: COLOR_META,
            }}
          >
            {footnote}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};

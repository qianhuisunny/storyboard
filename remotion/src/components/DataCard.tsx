import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface Stat {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
}

interface DataCardProps {
  title: string;
  stats?: Stat[];
  bullets?: string[];
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
}

const trendIcon = (t?: string) => {
  if (t === "up") return "↑";
  if (t === "down") return "↓";
  return "→";
};

const trendColor = (t?: string) => {
  if (t === "up") return "#2D6A4F";
  if (t === "down") return "#A63228";
  return "#666";
};

export const DataCard: React.FC<DataCardProps> = ({
  title,
  stats,
  bullets,
  footnote,
  audioSrc,
}) => {
  const frame = useCurrentFrame();

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div style={{ width: "100%" }}>
        {stats && (
          <div style={{ display: "flex", gap: 24, marginBottom: 32, justifyContent: "center" }}>
            {stats.map((stat, i) => {
              const opacity = interpolate(frame, [i * 10, i * 10 + 15], [0, 1], { extrapolateRight: "clamp" });
              return (
                <div key={i} style={{ textAlign: "center", opacity, padding: 20, backgroundColor: "#f8f9fa", borderRadius: 12, minWidth: 160 }}>
                  <div style={{ fontSize: 40, fontWeight: 700, color: trendColor(stat.trend) }}>
                    {stat.value} {trendIcon(stat.trend)}
                  </div>
                  <div style={{ fontSize: 16, color: "#666", marginTop: 8 }}>{stat.label}</div>
                </div>
              );
            })}
          </div>
        )}
        {bullets && (
          <ul style={{ margin: 0, paddingLeft: 24 }}>
            {bullets.map((b, i) => {
              const opacity = interpolate(frame, [i * 8, i * 8 + 12], [0, 1], { extrapolateRight: "clamp" });
              return (
                <li key={i} style={{ fontSize: 22, color: "#333", marginBottom: 12, lineHeight: 1.5, opacity }}>
                  {b}
                </li>
              );
            })}
          </ul>
        )}
        {footnote && (
          <div style={{ textAlign: "center", fontSize: 14, color: "#999", marginTop: 24 }}>
            {footnote}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};

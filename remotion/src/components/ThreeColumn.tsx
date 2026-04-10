import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper } from "./SlideWrapper";

interface Column {
  header: string;
  items: string[];
  icon?: string;
}

interface ThreeColumnProps {
  title: string;
  columns: [Column, Column, Column];
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
}

export const ThreeColumn: React.FC<ThreeColumnProps> = ({
  title,
  columns,
  footnote,
  audioSrc,
}) => {
  const frame = useCurrentFrame();

  return (
    <SlideWrapper title={title} audioSrc={audioSrc}>
      <div style={{ display: "flex", gap: 24, width: "100%" }}>
        {columns.map((col, i) => {
          const opacity = interpolate(frame, [i * 12, i * 12 + 15], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                flex: 1,
                backgroundColor: "#f8f9fa",
                borderRadius: 12,
                padding: 24,
                opacity,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: "#2D6A4F", marginBottom: 16 }}>
                {col.header}
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {col.items.map((item, j) => (
                  <li key={j} style={{ fontSize: 16, color: "#444", marginBottom: 8, lineHeight: 1.4 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {footnote && (
        <div style={{ textAlign: "center", fontSize: 14, color: "#999", marginTop: 20 }}>
          {footnote}
        </div>
      )}
    </SlideWrapper>
  );
};

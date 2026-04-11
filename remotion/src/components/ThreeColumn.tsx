import React from "react";
import { useCurrentFrame } from "remotion";
import { SlideWrapper, elementOpacity, ElementTimings } from "./SlideWrapper";
import {
  HEADING_SIZE,
  HEADING_WEIGHT,
  BODY_SIZE,
  BODY_LINE_HEIGHT,
  META_SIZE,
  COLOR_BODY,
  COLOR_META,
  COLOR_ACCENT,
  COLOR_CARD_BG,
} from "../theme";

interface Column {
  header: string;
  items: string[];
}

interface ThreeColumnProps {
  title: string;
  subtitle?: string;
  columns: [Column, Column, Column];
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
  elementTimings?: ElementTimings;
}

export const ThreeColumn: React.FC<ThreeColumnProps> = ({
  title,
  subtitle,
  columns,
  footnote,
  audioSrc,
  elementTimings,
}) => {
  const frame = useCurrentFrame();

  return (
    <SlideWrapper title={title} subtitle={subtitle} audioSrc={audioSrc}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", gap: 24, width: "100%" }}>
          {columns.map((col, i) => {
            const opacity = elementOpacity(
              frame,
              `column_${i}`,
              elementTimings,
              i,
              0.6,
            );
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  backgroundColor: COLOR_CARD_BG,
                  borderRadius: 12,
                  padding: 28,
                  opacity,
                }}
              >
                <div
                  style={{
                    fontSize: HEADING_SIZE,
                    fontWeight: HEADING_WEIGHT,
                    color: COLOR_ACCENT,
                    marginBottom: 20,
                  }}
                >
                  {col.header}
                </div>
                <ul style={{ margin: 0, paddingLeft: 24 }}>
                  {col.items.map((item, j) => (
                    <li
                      key={j}
                      style={{
                        fontSize: BODY_SIZE,
                        color: COLOR_BODY,
                        marginBottom: 10,
                        lineHeight: BODY_LINE_HEIGHT,
                      }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {footnote && (
          <div
            style={{
              textAlign: "center",
              fontSize: META_SIZE,
              color: COLOR_META,
              marginTop: 8,
            }}
          >
            {footnote}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};

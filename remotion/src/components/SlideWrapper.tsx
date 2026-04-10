import React from "react";
import { AbsoluteFill, Audio } from "remotion";

interface SlideWrapperProps {
  title: string;
  audioSrc?: string;
  children: React.ReactNode;
}

export const SlideWrapper: React.FC<SlideWrapperProps> = ({
  title,
  audioSrc,
  children,
}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#FFFFFF",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 60,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h1
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: "#1a1a1a",
          marginBottom: 40,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h1>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};

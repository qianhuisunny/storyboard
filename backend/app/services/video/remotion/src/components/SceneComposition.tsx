import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BODY_SIZE, FADE_FRAMES, FONT_FAMILY, FPS } from "../theme";
import { OverlayElement, OverlayPlacement, SceneCompositionProps } from "../types";

const baseCanvasStyle = (canvasMode: SceneCompositionProps["canvasMode"]) => ({
  background:
    canvasMode === "full_bleed"
      ? "#F5F2EC"
      : "linear-gradient(180deg, #FBF8F2 0%, #F1EDE6 100%)",
});

function elementStartSeconds(element: OverlayElement, index: number): number {
  return element.t ?? index * 1.35;
}

function elementRevealStyle(
  element: OverlayElement,
  index: number,
  frame: number,
): React.CSSProperties {
  const start = Math.round(elementStartSeconds(element, index) * FPS);
  const opacity = interpolate(
    frame,
    [start, start + FADE_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const translateY = interpolate(
    frame,
    [start, start + FADE_FRAMES],
    [24, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scale = interpolate(
    frame,
    [start, start + FADE_FRAMES],
    [0.96, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return {
    opacity,
    transform: `translateY(${translateY}px) scale(${scale})`,
  };
}

function elementIsVisible(element: OverlayElement, index: number, frame: number): boolean {
  const start = Math.round(elementStartSeconds(element, index) * FPS);
  const end =
    element.dur == null
      ? Number.POSITIVE_INFINITY
      : Math.round((elementStartSeconds(element, index) + element.dur) * FPS);
  return frame >= start && frame <= end + FADE_FRAMES;
}

function cardStyle(bg = "#FFFFFF"): React.CSSProperties {
  return {
    background: bg,
    borderRadius: 28,
    boxShadow: "0 18px 40px rgba(20, 18, 15, 0.12)",
  };
}

function selfAlignment(
  align?: OverlayPlacement["alignX"] | OverlayPlacement["alignY"],
): React.CSSProperties["justifySelf"] {
  if (align === "start") return "start";
  if (align === "end") return "end";
  if (align === "stretch") return "stretch";
  return "center";
}

function renderElement(
  element: OverlayElement,
  options?: { fillCell?: boolean },
): React.ReactNode {
  const style = element.style ?? {};
  const fillCell = options?.fillCell ?? false;
  switch (element.kind) {
    case "headline":
      return (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: style.fontSize ?? 88,
            lineHeight: 0.95,
            color: style.color ?? "#111111",
            textAlign: "center",
          }}
        >
          {element.text}
        </div>
      );
    case "subhead":
    case "label":
      return (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: style.fontWeight ?? 500,
            fontSize: style.fontSize ?? 28,
            lineHeight: 1.2,
            color: style.color ?? "#333333",
            textAlign: "center",
          }}
        >
          {element.text}
        </div>
      );
    case "stat":
      return (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: style.fontSize ?? 180,
            lineHeight: 0.9,
            color: style.color ?? "#0F172A",
            textAlign: "center",
          }}
        >
          {element.value ?? element.text}
        </div>
      );
    case "stat_pill":
      return (
        <div
          style={{
            ...cardStyle(style.bg ?? "#3D6FE0"),
            padding: "34px 72px",
            minWidth: 760,
            textAlign: "center",
            color: style.color ?? "#FFFFFF",
          }}
        >
          <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: style.fontSize ?? 108 }}>
            {element.value ?? element.text}
          </div>
          {element.title && (
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 500,
                fontSize: 42,
                color: "#0E1320",
                marginTop: 8,
              }}
            >
              {element.title}
            </div>
          )}
        </div>
      );
    case "badge":
      return (
        <div
          style={{
            ...cardStyle(style.bg ?? "#E8F5EA"),
            padding: "14px 28px",
            borderRadius: 999,
            fontFamily: FONT_FAMILY,
            fontWeight: 700,
            fontSize: style.fontSize ?? 26,
            color: style.color ?? "#0F9D58",
          }}
        >
          {element.text}
        </div>
      );
    case "icon_card":
      return (
        <div
          style={{
            ...cardStyle(style.bg ?? "#FFFFFF"),
            width: fillCell ? "100%" : 360,
            minHeight: 320,
            maxWidth: 420,
            padding: "42px 34px 36px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            textAlign: "center",
            gap: 18,
          }}
        >
          {element.icon && (
            <div style={{ fontSize: 116, lineHeight: 1, marginBottom: 16 }}>{element.icon}</div>
          )}
          {element.title && (
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 800,
                fontSize: 32,
                lineHeight: 1.05,
                color: "#111111",
              }}
            >
              {element.title}
            </div>
          )}
          {element.text && (
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: BODY_SIZE,
                lineHeight: 1.35,
                color: "#47403A",
              }}
            >
              {element.text}
            </div>
          )}
        </div>
      );
    case "example_card":
    case "image_card":
    case "screenshot_card":
    case "ui_window":
      return (
        <div
          style={{
            ...cardStyle(style.bg ?? "#FFFFFF"),
            width: fillCell ? "100%" : element.kind === "ui_window" ? 760 : 320,
            maxWidth: fillCell ? undefined : element.kind === "ui_window" ? 760 : 320,
            minHeight: element.kind === "ui_window" ? 440 : 280,
            padding: 28,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            gap: 18,
          }}
        >
          {element.icon && (
            <div style={{ fontSize: 64, lineHeight: 1 }}>{element.icon}</div>
          )}
          {element.title && (
            <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 38 }}>
              {element.title}
            </div>
          )}
          {element.text && (
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: BODY_SIZE,
                lineHeight: 1.35,
                color: "#47403A",
              }}
            >
              {element.text}
            </div>
          )}
          {element.items && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontFamily: FONT_FAMILY,
                fontSize: 20,
                color: "#55514C",
              }}
            >
              {element.items.map((item, index) => (
                <div key={`${element.id ?? element.kind}-${index}`}>{item}</div>
              ))}
            </div>
          )}
        </div>
      );
    case "arrow":
      return (
        <div style={{ fontSize: 140, lineHeight: 1, color: style.color ?? "#111111" }}>
          →
        </div>
      );
    case "pros_cons_block":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ ...cardStyle("#CDEFD8"), padding: "16px 28px", borderRadius: 999, color: "#0F9D58", fontWeight: 800, fontSize: 38 }}>
            Pros
          </div>
          {(element.items ?? []).slice(0, 1).map((item) => (
            <div key={item} style={{ fontSize: 34, fontWeight: 500 }}>
              • {item}
            </div>
          ))}
          <div style={{ ...cardStyle("#FFD7D2"), padding: "16px 28px", borderRadius: 999, color: "#FF4B3A", fontWeight: 800, fontSize: 38 }}>
            Cons
          </div>
          {(element.items ?? []).slice(1, 2).map((item) => (
            <div key={item} style={{ fontSize: 34, fontWeight: 500, filter: "blur(1px)" }}>
              {item}
            </div>
          ))}
        </div>
      );
    case "presenter_video":
      return (
        <div
          style={{
            ...cardStyle("#0A0D12"),
            width: fillCell ? "100%" : 520,
            height: fillCell ? "100%" : 820,
            minHeight: 620,
            borderRadius: 42,
          }}
        />
      );
    default:
      return null;
  }
}

interface GridConfig {
  columns: number;
  rows: number;
  gap: number;
}

const structuredGridConfig = (
  composition: SceneCompositionProps["composition"],
): GridConfig => {
  switch (composition) {
    case "single_center":
      return { columns: 12, rows: 8, gap: 32 };
    case "two_panel_split":
      return { columns: 12, rows: 8, gap: 36 };
    case "three_up_grid":
      return { columns: 12, rows: 6, gap: 36 };
    case "four_up_grid":
      return { columns: 12, rows: 6, gap: 28 };
    case "primary_with_sidecar":
      return { columns: 12, rows: 8, gap: 32 };
    default:
      return { columns: 12, rows: 8, gap: 32 };
  }
};

function defaultPlacementForComposition(
  composition: SceneCompositionProps["composition"],
  element: OverlayElement,
  index: number,
  elements: OverlayElement[],
): OverlayPlacement {
  if (composition === "single_center") {
    return {
      colStart: 3,
      colSpan: 8,
      rowStart: 3 + index,
      rowSpan: 1,
      alignX: "center",
      alignY: "center",
    };
  }

  if (composition === "three_up_grid") {
    return {
      colStart: index * 4 + 1,
      colSpan: 4,
      rowStart: 2,
      rowSpan: 4,
      alignX: "center",
      alignY: "center",
    };
  }

  if (composition === "four_up_grid") {
    return {
      colStart: index * 3 + 1,
      colSpan: 3,
      rowStart: 2,
      rowSpan: 4,
      alignX: "center",
      alignY: "center",
    };
  }

  if (composition === "two_panel_split") {
    if (element.kind === "arrow") {
      return {
        colStart: 6,
        colSpan: 2,
        rowStart: 3,
        rowSpan: 3,
        alignX: "center",
        alignY: "center",
      };
    }

    const nonArrowIndex = elements
      .filter((item) => item.kind !== "arrow")
      .findIndex((item) => item === element);

    return {
      colStart: nonArrowIndex === 0 ? 1 : 8,
      colSpan: 5,
      rowStart: 2,
      rowSpan: 5,
      alignX: "stretch",
      alignY: "center",
    };
  }

  if (composition === "primary_with_sidecar") {
    const sidecarElements = elements.filter((item) => item.zone === "sidecar");
    const primaryElements = elements.filter((item) => item.zone !== "sidecar");

    if (element.zone === "sidecar") {
      const idx = sidecarElements.findIndex((item) => item === element);
      const span = Math.max(2, Math.floor(6 / Math.max(1, sidecarElements.length)));
      return {
        colStart: 9,
        colSpan: 4,
        rowStart: 2 + idx * span,
        rowSpan: span,
        alignX: "stretch",
        alignY: "stretch",
      };
    }

    const idx = primaryElements.findIndex((item) => item === element);
    if (idx === 0) {
      return {
        colStart: 1,
        colSpan: 8,
        rowStart: 2,
        rowSpan: 2,
        alignX: "stretch",
        alignY: "end",
      };
    }

    return {
      colStart: 1,
      colSpan: 8,
      rowStart: 4,
      rowSpan: 3,
      alignX: "stretch",
      alignY: "start",
    };
  }

  return {
    colStart: 1,
    colSpan: 12,
    rowStart: 1 + index,
    rowSpan: 1,
    alignX: "center",
    alignY: "center",
  };
}

function renderStructuredGrid(
  composition: SceneCompositionProps["composition"],
  elements: OverlayElement[],
  frame: number,
): React.ReactNode {
  const config = structuredGridConfig(composition);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${config.rows}, minmax(0, 1fr))`,
        gap: config.gap,
        width: "100%",
        height: "100%",
        alignItems: "start",
      }}
    >
      {elements.map((element, index) => {
        const defaultPlacement = defaultPlacementForComposition(composition, element, index, elements);
        const placement = {
          ...defaultPlacement,
          ...element.placement,
        };
        const stretchX = placement.alignX === "stretch";
        const stretchY = placement.alignY === "stretch";

        if (!elementIsVisible(element, index, frame)) return null;

        return (
          <div
            key={element.id ?? `${element.kind}-${index}`}
            style={{
              gridColumn: `${placement.colStart ?? 1} / span ${placement.colSpan ?? 1}`,
              gridRow: `${placement.rowStart ?? 1} / span ${placement.rowSpan ?? 1}`,
              justifySelf: selfAlignment(placement.alignX),
              alignSelf: selfAlignment(placement.alignY),
              width: stretchX ? "100%" : undefined,
              height: stretchY ? "100%" : undefined,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              ...elementRevealStyle(element, index, frame),
            }}
          >
            {renderElement(element, {
              fillCell: stretchX || stretchY,
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderComposition(
  composition: SceneCompositionProps["composition"],
  elements: OverlayElement[],
  frame: number,
): React.ReactNode {
  if (composition === "single_center") {
    return renderStructuredGrid(composition, elements, frame);
  }

  if (composition === "three_up_grid") return renderStructuredGrid(composition, elements, frame);
  if (composition === "four_up_grid") return renderStructuredGrid(composition, elements, frame);
  if (composition === "two_panel_split") return renderStructuredGrid(composition, elements, frame);
  if (composition === "primary_with_sidecar") return renderStructuredGrid(composition, elements, frame);

  if (composition === "mosaic") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {elements.map((element, index) => (
          elementIsVisible(element, index, frame) && (
          <div
            key={element.id ?? `${element.kind}-${index}`}
            style={{
              position: "absolute",
              left: 120 + (index % 4) * 300,
              top: 120 + Math.floor(index / 4) * 140,
              transform: `rotate(${(index % 2 === 0 ? -1 : 1) * (index + 1) * 2}deg)`,
              ...elementRevealStyle(element, index, frame),
            }}
          >
            {renderElement(element)}
          </div>
          )
        ))}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {elements.map((element, index) => (
        elementIsVisible(element, index, frame) && (
        <div
          key={element.id ?? `${element.kind}-${index}`}
          style={{
            position: "absolute",
            left: 120 + (index % 2) * 680,
            top: 120 + Math.floor(index / 2) * 220,
            ...elementRevealStyle(element, index, frame),
          }}
        >
          {renderElement(element)}
        </div>
        )
      ))}
    </div>
  );
}

export const SceneComposition: React.FC<SceneCompositionProps> = ({
  composition,
  canvasMode = "none",
  audioSrc,
  baseVideoPath,
  overlayElements,
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={baseCanvasStyle(canvasMode)}>
      {baseVideoPath && (
        <AbsoluteFill>
          <OffthreadVideo
            src={staticFile(baseVideoPath)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          padding: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT_FAMILY,
        }}
      >
        <Sequence from={0}>{renderComposition(composition, overlayElements, frame)}</Sequence>
      </AbsoluteFill>
      {audioSrc && <Audio src={staticFile(audioSrc)} />}
    </AbsoluteFill>
  );
};

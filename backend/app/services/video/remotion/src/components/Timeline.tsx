import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SlideWrapper, elementOpacity, ElementTimings } from "./SlideWrapper";
import {
  HEADING_SIZE,
  HEADING_WEIGHT,
  BODY_SIZE,
  COLOR_TITLE,
  COLOR_MUTED,
  COLOR_ACCENT,
  FADE_FRAMES,
  FPS,
} from "../theme";

/**
 * Optional opening-question overlay. When present, the Timeline slide
 * shows this question text prominently in the content area during an
 * opening window, then fades out before the timeline events start
 * appearing. Each word fades in at its own timestamp (synced to the
 * narration via Whisper word timestamps) so the viewer reads along
 * with the narrator.
 */
interface OpeningQuestion {
  /** Words in order with the seconds-offset when each should fade in. */
  words: { text: string; at: number }[];
  /** Seconds offset when the whole question block starts fading out. */
  fadeOutAt: number;
  /** Optional indices of words to render in the accent color for emphasis. */
  highlightIndices?: number[];
}

/**
 * Minimalist Lucide-style SVG icons, rendered in the accent green
 * stroke. Each timeline event can reference one of these keys via its
 * optional ``icon`` field — the component renders the icon above the
 * event's text label for panels where the timeline text alone would
 * leave too much empty space.
 *
 * Keep these as hand-authored SVG so we don't pull in a full icon
 * library. Add new icons here as needed — they're just React fragments
 * of SVG paths sized in a 24x24 viewBox.
 */
const ICON_REGISTRY: Record<string, React.ReactNode> = {
  "clipboard-list": (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "message-circle": (
    <>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  "check-square": (
    <>
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
};

interface TimelineEvent {
  label: string;
  description: string;
  highlight?: boolean;
  icon?: keyof typeof ICON_REGISTRY | string;
}

interface TimelineProps {
  title: string;
  subtitle?: string;
  events: TimelineEvent[];
  direction?: "horizontal" | "vertical";
  audioSrc?: string;
  durationInSeconds?: number;
  elementTimings?: ElementTimings;
  openingQuestion?: OpeningQuestion;
}

export const Timeline: React.FC<TimelineProps> = ({
  title,
  subtitle,
  events,
  direction = "horizontal",
  audioSrc,
  elementTimings,
  openingQuestion,
}) => {
  const frame = useCurrentFrame();
  const isVertical = direction === "vertical";

  // Opening-question overall opacity: 1 up to fadeOutAt, then decays
  // to 0 over FADE_FRAMES. Per-word fade-ins multiply this so the whole
  // block exits cleanly together.
  const questionBlockOpacity = openingQuestion
    ? interpolate(
        frame,
        [
          openingQuestion.fadeOutAt * FPS,
          openingQuestion.fadeOutAt * FPS + FADE_FRAMES,
        ],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 1;

  // When an opening question is present the slide's own title/subtitle
  // would fight the question for visual weight, so we suppress them —
  // the question itself IS the framing for the panel. SlideWrapper
  // collapses its title block when it receives an empty title, which
  // gives the question the full slide height to center inside of.
  const hideHeader = Boolean(openingQuestion);

  return (
    <SlideWrapper
      title={hideHeader ? "" : title}
      subtitle={hideHeader ? undefined : subtitle}
      audioSrc={audioSrc}
    >
      {openingQuestion && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 140px",
            opacity: questionBlockOpacity,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 76,
              lineHeight: 1.25,
              fontWeight: 600,
              fontStyle: "italic",
              color: COLOR_TITLE,
              maxWidth: 1500,
            }}
          >
            {openingQuestion.words.map((w, i) => {
              const startFrame = Math.round(w.at * FPS);
              const wordOpacity = interpolate(
                frame,
                [startFrame, startFrame + FADE_FRAMES],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
              const isHighlight =
                openingQuestion.highlightIndices?.includes(i);
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    marginRight: 18,
                    opacity: wordOpacity,
                    color: isHighlight ? COLOR_ACCENT : COLOR_TITLE,
                    fontWeight: isHighlight ? 800 : 600,
                  }}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        </div>
      )}
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
          const iconNode = event.icon ? ICON_REGISTRY[event.icon] : null;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                opacity,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              {iconNode && (
                <div
                  style={{
                    width: 140,
                    height: 140,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#EAF4EE",
                    borderRadius: 24,
                    marginBottom: 8,
                  }}
                >
                  <svg
                    width="96"
                    height="96"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={COLOR_ACCENT}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {iconNode}
                  </svg>
                </div>
              )}
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

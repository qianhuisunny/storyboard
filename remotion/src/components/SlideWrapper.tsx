import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, interpolate } from "remotion";
import {
  FONT_FAMILY,
  TITLE_SIZE,
  TITLE_WEIGHT,
  TITLE_LINE_HEIGHT,
  SUBTITLE_SIZE,
  SUBTITLE_WEIGHT,
  SUBTITLE_LINE_HEIGHT,
  COLOR_TITLE,
  COLOR_MUTED,
  COLOR_PAGE_BG,
  SLIDE_PADDING,
  TITLE_SUBTITLE_GAP,
  TITLE_BLOCK_MARGIN_BOTTOM,
  FADE_FRAMES,
  FPS,
} from "../theme";

/**
 * Per-element timings for Phase B word-sync. Each key is an element ID
 * the component uses (e.g. "level_0", "column_1", "bullet_2"), each
 * value is the number of seconds into the clip when that element
 * should start fading in. Components look up their own IDs; missing
 * IDs fall back to time 0 (appear immediately).
 */
export type ElementTimings = Record<string, number>;

export interface SlideWrapperProps {
  title?: string;
  subtitle?: string;
  audioSrc?: string;
  children: React.ReactNode;
}

export const SlideWrapper: React.FC<SlideWrapperProps> = ({
  title,
  subtitle,
  audioSrc,
  children,
}) => {
  const frame = useCurrentFrame();

  // Title + subtitle both fade in over the first 0.6s. The whole
  // title block appears together — we don't stagger title vs subtitle
  // because that would look fussy for a 2-3 word subtitle.
  const titleOpacity = interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateRight: "clamp",
  });

  // When the caller passes no title (or an empty string) the whole
  // title block — including its bottom margin — collapses, so the
  // content area gets the full slide height. This is what opening-
  // question Timelines rely on to vertically center their question.
  const hasTitle = Boolean(title && title.trim().length > 0);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLOR_PAGE_BG,
        fontFamily: FONT_FAMILY,
        padding: SLIDE_PADDING,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {hasTitle && (
        <div
          style={{
            marginBottom: TITLE_BLOCK_MARGIN_BOTTOM,
            opacity: titleOpacity,
          }}
        >
          <h1
            style={{
              fontSize: TITLE_SIZE,
              fontWeight: TITLE_WEIGHT,
              color: COLOR_TITLE,
              lineHeight: TITLE_LINE_HEIGHT,
              margin: 0,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              style={{
                fontSize: SUBTITLE_SIZE,
                fontWeight: SUBTITLE_WEIGHT,
                color: COLOR_MUTED,
                lineHeight: SUBTITLE_LINE_HEIGHT,
                marginTop: TITLE_SUBTITLE_GAP,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
      {audioSrc && <Audio src={staticFile(audioSrc)} />}
    </AbsoluteFill>
  );
};

/**
 * Pure helper (NOT a React hook) that derives a Remotion opacity
 * value for a single visual element. Deliberately not prefixed with
 * ``use`` so React's rules-of-hooks lint doesn't complain when it's
 * called inside .map() loops — which is the whole point since every
 * slide component loops over elements.
 *
 * Lookup order:
 *   1. If ``elementTimings`` has a key matching ``elementId``, use it
 *      as the start-seconds for the fade-in.
 *   2. Otherwise, fall back to ``fallbackIndex * fallbackStaggerSec``,
 *      which gives a reasonable even distribution across early frames.
 *   3. The fade always lasts FADE_FRAMES (0.6s by default).
 */
export function elementOpacity(
  frame: number,
  elementId: string,
  elementTimings: ElementTimings | undefined,
  fallbackIndex: number,
  fallbackStaggerSec: number = 0.4,
): number {
  let startSec: number;
  if (elementTimings && elementId in elementTimings) {
    startSec = elementTimings[elementId];
  } else {
    startSec = fallbackIndex * fallbackStaggerSec;
  }
  const startFrame = Math.round(startSec * FPS);
  return interpolate(
    frame,
    [startFrame, startFrame + FADE_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

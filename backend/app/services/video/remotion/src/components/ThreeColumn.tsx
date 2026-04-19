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
  COLOR_MUTED,
  COLOR_ACCENT,
  COLOR_CARD_BG,
} from "../theme";

/**
 * SVG icon registry for ThreeColumn row icons. Icons render inline
 * next to each bullet item, at the SAME row index across all three
 * cards — so rowIcons=["sponsor-lift", "network-flow", "outcome-target"]
 * puts sponsor-lift on row 0 of every card, network-flow on row 1, etc.
 *
 * Style rules:
 *   - 0-120 viewBox authoring canvas, same as SplitComparison registry
 *   - Stroke color: COLOR_ACCENT (sage green), inherited via currentColor
 *   - Rendered inline at 28x28 (small, no pale-sage wrapper box — the
 *     context is decorative row anchors, not hero illustrations)
 *   - Hand-authored, minimal line count — these ride next to text, not
 *     replace it
 */
const THREE_ROW_ICON_REGISTRY: Record<string, React.ReactNode> = {
  "sponsor-lift": (
    <>
      {/* Three stacked chevrons ascending = lift / promote / elevate. */}
      <polyline points="28,92 60,64 92,92" strokeWidth="9" fill="none" />
      <polyline points="28,66 60,38 92,66" strokeWidth="9" fill="none" />
      <polyline points="28,40 60,12 92,40" strokeWidth="9" fill="none" />
    </>
  ),
  "network-flow": (
    <>
      {/* Three nodes in a triangle, edges connecting them = knowledge
          infrastructure / shared network. */}
      <line x1="30" y1="34" x2="90" y2="34" strokeWidth="7" />
      <line x1="30" y1="34" x2="60" y2="96" strokeWidth="7" />
      <line x1="90" y1="34" x2="60" y2="96" strokeWidth="7" />
      <circle cx="30" cy="34" r="12" fill="currentColor" />
      <circle cx="90" cy="34" r="12" fill="currentColor" />
      <circle cx="60" cy="96" r="12" fill="currentColor" />
    </>
  ),
  "outcome-target": (
    <>
      {/* Concentric target with an arrow striking center = outcome hit,
          not effort. */}
      <circle cx="66" cy="60" r="42" strokeWidth="7" fill="none" />
      <circle cx="66" cy="60" r="24" strokeWidth="7" fill="none" />
      <circle cx="66" cy="60" r="9" fill="currentColor" />
      <line x1="12" y1="14" x2="58" y2="58" strokeWidth="8" />
      <polyline points="10,32 6,10 28,14" strokeWidth="6" fill="none" />
    </>
  ),
};

/**
 * Optional inline illustration that can ride along with a reveal. Each
 * illustration is a complete <svg> (not a fragment) because different
 * reveals need different viewBox aspect ratios — some are horizontal
 * mini-charts, some are symbolic icons.
 */
const REVEAL_ILLUSTRATION_REGISTRY: Record<string, React.ReactNode> = {
  "diverging-lines": (
    <svg
      width="140"
      height="70"
      viewBox="0 0 120 60"
      fill="none"
      stroke={COLOR_ACCENT}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: COLOR_ACCENT, flexShrink: 0 }}
    >
      {/* Flat reference line = "same gap" (dashed, muted) */}
      <line
        x1="10"
        y1="42"
        x2="110"
        y2="42"
        strokeDasharray="5,4"
        stroke={COLOR_META}
      />
      {/* Rising line = "consistent year-over-year improvement" */}
      <polyline points="10,48 32,40 56,30 80,18 110,8" strokeWidth="5" />
      <circle cx="110" cy="8" r="4" fill="currentColor" />
      <circle cx="110" cy="42" r="4" fill={COLOR_META} />
    </svg>
  ),
  "widening-gap": (
    <svg
      width="140"
      height="70"
      viewBox="0 0 120 60"
      fill="none"
      stroke={COLOR_ACCENT}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: COLOR_ACCENT, flexShrink: 0 }}
    >
      {/* Shared origin on the left, two lines fanning apart to the
          right = "gap widens". Upper line (intentional) rises faster
          than lower line (accidental). */}
      <polyline points="10,30 40,24 70,16 110,6" strokeWidth="5" />
      <polyline
        points="10,30 40,34 70,38 110,44"
        strokeWidth="4"
        strokeDasharray="5,4"
        stroke={COLOR_META}
      />
      <circle cx="10" cy="30" r="4" fill="currentColor" />
      <circle cx="110" cy="6" r="4" fill="currentColor" />
      <circle cx="110" cy="44" r="4" fill={COLOR_META} />
    </svg>
  ),
};

interface Column {
  header: string;
  items: string[];
}

interface Reveal {
  label: string;
  metric?: string;
  illustration?: string; // key into REVEAL_ILLUSTRATION_REGISTRY
}

interface ThreeColumnProps {
  title: string;
  subtitle?: string;
  columns: [Column, Column, Column];
  /**
   * One icon key per row index. rowIcons[j] renders next to items[j]
   * in every card. Strong reinforcement when the three columns
   * represent parallel framings of the same underlying concepts
   * (e.g. Panel 13: Before/After/Not versions of Sponsorship,
   * Networks, Tracking). Leave undefined for unrelated cards.
   */
  rowIcons?: string[];
  /**
   * Late-fading payoff element — the outcome stat, banner, or
   * climax line the narration builds toward. This is what the
   * ``footnote`` field was being misused for on Panel 13.
   * ``footnote`` stays for source attribution only.
   */
  reveal?: Reveal;
  footnote?: string;
  audioSrc?: string;
  durationInSeconds?: number;
  elementTimings?: ElementTimings;
}

export const ThreeColumn: React.FC<ThreeColumnProps> = ({
  title,
  subtitle,
  columns,
  rowIcons,
  reveal,
  footnote,
  audioSrc,
  elementTimings,
}) => {
  const frame = useCurrentFrame();

  const renderRowMarker = (rowIndex: number) => {
    const iconKey = rowIcons?.[rowIndex];
    if (iconKey && THREE_ROW_ICON_REGISTRY[iconKey]) {
      return (
        <svg
          width="30"
          height="30"
          viewBox="0 0 120 120"
          fill="none"
          stroke={COLOR_ACCENT}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: COLOR_ACCENT, flexShrink: 0 }}
        >
          {THREE_ROW_ICON_REGISTRY[iconKey]}
        </svg>
      );
    }
    // Fallback bullet marker — small filled dot, replaces the default
    // <ul> disc so cards without rowIcons still read as bulleted lists.
    return (
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: COLOR_BODY,
          flexShrink: 0,
          marginLeft: 6,
          marginRight: 6,
        }}
      />
    );
  };

  const revealOpacity = reveal
    ? elementOpacity(frame, "reveal", elementTimings, columns.length, 0.6)
    : 0;
  const revealIllustration = reveal?.illustration
    ? REVEAL_ILLUSTRATION_REGISTRY[reveal.illustration]
    : null;

  return (
    <SlideWrapper title={title} subtitle={subtitle} audioSrc={audioSrc}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
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
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  {col.items.map((item, j) => (
                    <li
                      key={j}
                      style={{
                        fontSize: BODY_SIZE,
                        color: COLOR_BODY,
                        lineHeight: BODY_LINE_HEIGHT,
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                      }}
                    >
                      {renderRowMarker(j)}
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {reveal && (
          <div
            style={{
              opacity: revealOpacity,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
              padding: "26px 44px",
              backgroundColor: "#EAF4EE",
              borderRadius: 16,
              alignSelf: "center",
              marginTop: 8,
            }}
          >
            {revealIllustration}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: HEADING_SIZE,
                  fontWeight: HEADING_WEIGHT,
                  color: COLOR_ACCENT,
                }}
              >
                {reveal.label}
              </div>
              {reveal.metric && (
                <div
                  style={{
                    fontSize: META_SIZE,
                    color: COLOR_MUTED,
                  }}
                >
                  {reveal.metric}
                </div>
              )}
            </div>
          </div>
        )}
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

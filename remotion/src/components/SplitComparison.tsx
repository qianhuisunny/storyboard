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
  COLOR_ACCENT,
  COLOR_CARD_BG,
  sentimentColor,
} from "../theme";

/**
 * SVG icon registry for SplitComparison. Each entry is a React fragment
 * of SVG elements sized in a 0-120 viewBox. Icons render at ~160x160 on
 * the final 1920x1080 slide, centered above each side's label, inside
 * a pale-sage rounded box. Style rules (enforced by the wrapper in
 * renderSide):
 *
 *   - Stroke color: COLOR_ACCENT (sage green)
 *   - Fills: ``currentColor`` (inherits the stroke color)
 *   - Stroke weight: 3 for connective lines, 5 for emphasis
 *   - Dots: r=7 (small nodes) or r=9 (emphasis nodes)
 *
 * The icons are designed as PAIRS for contrast slides — the LLM is
 * told (in SLIDE_GENERATOR_PROMPT) to pick one per side of a
 * SplitComparison when a visual metaphor would help. Keep this list
 * curated; don't pull in a full icon library. Add new icons as the
 * need arises for real panels, then hand-author them in the same
 * visual style.
 *
 * Current pairs:
 *   isolated vs. connected → distributed-nodes / networked-nodes
 *   one vs. many            → person-single / person-group
 *   one path vs. branching  → arrow-linear / arrow-branching
 *   closed vs. open         → lock-closed / lock-open
 */
const SPLIT_ICON_REGISTRY: Record<string, React.ReactNode> = {
  "distributed-nodes": (
    <>
      {/* Scattered dots — no connections. Uses currentColor so the
          stroke color propagates through. */}
      <circle cx="20" cy="25" r="7" fill="currentColor" />
      <circle cx="95" cy="18" r="7" fill="currentColor" />
      <circle cx="55" cy="50" r="7" fill="currentColor" />
      <circle cx="15" cy="80" r="7" fill="currentColor" />
      <circle cx="85" cy="75" r="7" fill="currentColor" />
      <circle cx="40" cy="100" r="7" fill="currentColor" />
      <circle cx="100" cy="100" r="7" fill="currentColor" />
    </>
  ),
  "networked-nodes": (
    <>
      {/* Same seven dots in a similar layout, now connected by edges. */}
      <line x1="20" y1="25" x2="55" y2="50" strokeWidth="3" />
      <line x1="95" y1="18" x2="55" y2="50" strokeWidth="3" />
      <line x1="55" y1="50" x2="15" y2="80" strokeWidth="3" />
      <line x1="55" y1="50" x2="85" y2="75" strokeWidth="3" />
      <line x1="15" y1="80" x2="40" y2="100" strokeWidth="3" />
      <line x1="85" y1="75" x2="100" y2="100" strokeWidth="3" />
      <line x1="40" y1="100" x2="100" y2="100" strokeWidth="3" />
      <line x1="20" y1="25" x2="95" y2="18" strokeWidth="3" />
      <circle cx="20" cy="25" r="7" fill="currentColor" />
      <circle cx="95" cy="18" r="7" fill="currentColor" />
      <circle cx="55" cy="50" r="7" fill="currentColor" />
      <circle cx="15" cy="80" r="7" fill="currentColor" />
      <circle cx="85" cy="75" r="7" fill="currentColor" />
      <circle cx="40" cy="100" r="7" fill="currentColor" />
      <circle cx="100" cy="100" r="7" fill="currentColor" />
    </>
  ),
  "person-single": (
    <>
      {/* Head circle + rounded-shoulders torso. One person alone. */}
      <circle cx="60" cy="34" r="16" fill="currentColor" />
      <path
        d="M24 108 C24 78 38 62 60 62 C82 62 96 78 96 108 Z"
        fill="currentColor"
      />
    </>
  ),
  "person-group": (
    <>
      {/* Three smaller silhouettes side-by-side = a team / network. */}
      <circle cx="25" cy="42" r="11" fill="currentColor" />
      <path
        d="M6 105 C6 82 14 70 25 70 C36 70 44 82 44 105 Z"
        fill="currentColor"
      />
      <circle cx="60" cy="36" r="13" fill="currentColor" />
      <path
        d="M38 108 C38 82 47 66 60 66 C73 66 82 82 82 108 Z"
        fill="currentColor"
      />
      <circle cx="95" cy="42" r="11" fill="currentColor" />
      <path
        d="M76 105 C76 82 84 70 95 70 C106 70 114 82 114 105 Z"
        fill="currentColor"
      />
    </>
  ),
  "arrow-linear": (
    <>
      {/* One straight arrow left-to-right = single predetermined path. */}
      <line x1="12" y1="60" x2="88" y2="60" strokeWidth="5" />
      <polyline
        points="76,42 104,60 76,78"
        strokeWidth="5"
        fill="none"
      />
    </>
  ),
  "arrow-branching": (
    <>
      {/* One source splitting into three arrows = multiple paths. */}
      <circle cx="18" cy="60" r="6" fill="currentColor" />
      <line x1="18" y1="60" x2="50" y2="60" strokeWidth="4" />
      <line x1="50" y1="60" x2="100" y2="22" strokeWidth="4" />
      <line x1="50" y1="60" x2="104" y2="60" strokeWidth="4" />
      <line x1="50" y1="60" x2="100" y2="98" strokeWidth="4" />
      <polyline
        points="92,18 108,18 108,34"
        strokeWidth="4"
        fill="none"
      />
      <polyline
        points="98,52 112,60 98,68"
        strokeWidth="4"
        fill="none"
      />
      <polyline
        points="92,102 108,102 108,86"
        strokeWidth="4"
        fill="none"
      />
    </>
  ),
  "lock-closed": (
    <>
      {/* Padlock, shackle fully seated on the body = closed/locked. */}
      <path
        d="M38 58 V42 A22 22 0 0 1 82 42 V58"
        strokeWidth="5"
        fill="none"
      />
      <rect
        x="24"
        y="58"
        width="72"
        height="52"
        rx="6"
        fill="currentColor"
      />
      <circle cx="60" cy="80" r="5" fill="none" stroke="#EAF4EE" />
      <line
        x1="60"
        y1="85"
        x2="60"
        y2="98"
        strokeWidth="3"
        stroke="#EAF4EE"
      />
    </>
  ),
  "lock-open": (
    <>
      {/* Same body, shackle lifted + tilted away = unlocked/open. */}
      <path
        d="M38 58 V42 A22 22 0 0 1 74 24"
        strokeWidth="5"
        fill="none"
      />
      <rect
        x="24"
        y="58"
        width="72"
        height="52"
        rx="6"
        fill="currentColor"
      />
      <circle cx="60" cy="80" r="5" fill="none" stroke="#EAF4EE" />
      <line
        x1="60"
        y1="85"
        x2="60"
        y2="98"
        strokeWidth="3"
        stroke="#EAF4EE"
      />
    </>
  ),
};

/**
 * Reveal illustration registry — small inline SVGs that ride inside
 * the reveal beam below the two cards. Each entry is a complete
 * <svg> because different reveals use different viewBoxes (some
 * horizontal mini-charts, some symbolic metaphors).
 */
const REVEAL_ILLUSTRATION_REGISTRY: Record<string, React.ReactNode> = {
  "load-bearing-arch": (
    <svg
      width="110"
      height="60"
      viewBox="0 0 120 60"
      fill="none"
      stroke={COLOR_ACCENT}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: COLOR_ACCENT, flexShrink: 0 }}
    >
      {/* Two leaning beams that meet at the top, each propping the
          other up — the literal "load-bearing for each other" image. */}
      <line x1="18" y1="52" x2="58" y2="14" strokeWidth="6" />
      <line x1="102" y1="52" x2="62" y2="14" strokeWidth="6" />
      <circle cx="60" cy="13" r="5" fill="currentColor" />
      {/* Ground line — muted dashed reference. */}
      <line
        x1="10"
        y1="54"
        x2="110"
        y2="54"
        strokeWidth="3"
        strokeDasharray="4,3"
        stroke={COLOR_META}
      />
    </svg>
  ),
};

interface Side {
  label: string;
  description: string;
  metric?: string;
  sentiment?: "positive" | "negative" | "neutral";
  icon?: keyof typeof SPLIT_ICON_REGISTRY | string;
}

interface Reveal {
  label: string;
  metric?: string;
  illustration?: string; // key into REVEAL_ILLUSTRATION_REGISTRY
}

interface SplitComparisonProps {
  title: string;
  subtitle?: string;
  left: Side;
  right: Side;
  /**
   * Late-fading payoff element rendered as a full-width beam below
   * the two cards. Use for banners / climax lines like "Load-bearing
   * for each other" that the narration builds toward. ``footnote``
   * stays for source attribution only.
   */
  reveal?: Reveal;
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
  reveal,
  footnote,
  audioSrc,
  elementTimings,
}) => {
  const frame = useCurrentFrame();
  const leftOpacity = elementOpacity(frame, "left", elementTimings, 0, 0.0);
  const rightOpacity = elementOpacity(frame, "right", elementTimings, 1, 0.8);
  const revealOpacity = reveal
    ? elementOpacity(frame, "reveal", elementTimings, 2, 0.6)
    : 0;
  const revealIllustration = reveal?.illustration
    ? REVEAL_ILLUSTRATION_REGISTRY[reveal.illustration]
    : null;

  const renderSide = (side: Side, opacity: number) => {
    const iconNode = side.icon ? SPLIT_ICON_REGISTRY[side.icon] : null;
    return (
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
        {iconNode && (
          <div
            style={{
              width: 200,
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#EAF4EE",
              borderRadius: 28,
              marginBottom: 12,
            }}
          >
            <svg
              width="160"
              height="160"
              viewBox="0 0 120 120"
              fill="none"
              stroke={COLOR_ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: COLOR_ACCENT }}
            >
              {iconNode}
            </svg>
          </div>
        )}
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
  };

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
              // The "vs" separator tracks the more-visible of the two
              // cards. Without this tie, the separator hung alone in the
              // middle of an otherwise empty slide for the first 28s of
              // Panel 10 — exactly the "empty screen" the rule in
              // slides.py::_enforce_max_empty_gap is meant to prevent.
              opacity: Math.max(leftOpacity, rightOpacity),
            }}
          >
            vs
          </div>
          {renderSide(right, rightOpacity)}
        </div>
        {reveal && (
          <div
            style={{
              opacity: revealOpacity,
              width: "100%",
              padding: "26px 44px",
              backgroundColor: "#EAF4EE",
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
              marginTop: 4,
              boxSizing: "border-box",
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
            }}
          >
            Source: {footnote}
          </div>
        )}
      </div>
    </SlideWrapper>
  );
};

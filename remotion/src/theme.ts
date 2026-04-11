/**
 * Canonical typography + color scale for every slide template.
 *
 * Before this file existed, each component defined its own magic
 * numbers (labels 22 here, 24 there, metric 48 fighting the title for
 * visual weight). We fix that by centralizing the scale and having
 * every component import from one place.
 *
 * Hierarchy (largest → smallest, each ~0.7x the previous):
 *
 *   TITLE   56 — the slide headline (there's only one per slide)
 *   SUBTITLE 28 — optional second-tier text under the title
 *               (source attribution, takeaway, context line)
 *   HEADING 32 — section headers like "Entry Level" in PyramidChart,
 *                column headers in ThreeColumn, side labels in
 *                SplitComparison. Always visually subordinate to
 *                the title.
 *   METRIC  40 — featured numeric value (e.g. "1.7x", "49%").
 *                Intentionally smaller than TITLE so the title still
 *                reads as the primary anchor.
 *   BODY    22 — body copy, list items, descriptions.
 *   META    16 — footnotes, source attributions, small captions.
 *
 * All sizes are in pixels at 1920x1080 (our canonical render size).
 */

export const FONT_FAMILY = "Inter, system-ui, -apple-system, sans-serif";

// Type scale
export const TITLE_SIZE = 56;
export const TITLE_WEIGHT = 700;
export const TITLE_LINE_HEIGHT = 1.15;

export const SUBTITLE_SIZE = 28;
export const SUBTITLE_WEIGHT = 500;
export const SUBTITLE_LINE_HEIGHT = 1.3;

export const HEADING_SIZE = 32;
export const HEADING_WEIGHT = 700;

export const METRIC_SIZE = 40;
export const METRIC_WEIGHT = 700;

export const BODY_SIZE = 22;
export const BODY_WEIGHT = 400;
export const BODY_LINE_HEIGHT = 1.45;

export const META_SIZE = 16;
export const META_WEIGHT = 400;

// Color palette
export const COLOR_TITLE = "#1a1a1a";
export const COLOR_BODY = "#333333";
export const COLOR_MUTED = "#666666";
export const COLOR_META = "#999999";
export const COLOR_ACCENT = "#2D6A4F"; // primary green
export const COLOR_ACCENT_DARK = "#1B4332";
export const COLOR_NEGATIVE = "#A63228";
export const COLOR_CARD_BG = "#F8F9FA";
export const COLOR_CARD_BORDER = "#E5E7EB";
export const COLOR_PAGE_BG = "#FFFFFF";

// Spacing
export const SLIDE_PADDING = 64;
export const TITLE_SUBTITLE_GAP = 12;
export const TITLE_BLOCK_MARGIN_BOTTOM = 40;

// Animation
export const FPS = 25;
export const FADE_FRAMES = 15; // ~0.6s at 25fps — gentle, consistent reveal

/**
 * Semantic color helper: map a sentiment tag to a color.
 * Used by SplitComparison and DataCard for metric coloring.
 */
export const sentimentColor = (
  sentiment?: "positive" | "negative" | "neutral",
): string => {
  if (sentiment === "positive") return COLOR_ACCENT;
  if (sentiment === "negative") return COLOR_NEGATIVE;
  return COLOR_MUTED;
};

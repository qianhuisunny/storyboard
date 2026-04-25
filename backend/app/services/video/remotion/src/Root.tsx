// remotion/src/Root.tsx
import React from "react";
import { Composition } from "remotion";
import { PyramidChart } from "./components/PyramidChart";
import { SplitComparison } from "./components/SplitComparison";
import { Timeline } from "./components/Timeline";
import { ThreeColumn } from "./components/ThreeColumn";
import { DataCard } from "./components/DataCard";
import { KeyframeOverlay } from "./components/KeyframeOverlay";

// 25 fps matches both HeyGen's native output and the stitcher's
// canonical normalize target (see ../components/theme.ts FPS constant
// and backend/app/services/video/stitcher.py CANONICAL_FPS). Keeping
// everything at 25 fps means element_timings computed as
// round(startSec * 25) land on the exact frames Remotion renders, and
// mixed-source stitches pass through the stitcher's normalize step
// with minimal frame-rate conversion work.
const FPS = 25;

// Minimal default props. These exist ONLY so Remotion Studio has
// something to render in its preview panel; every production render
// passes a full props blob via the ``--props`` CLI flag.
//
// IMPORTANT: Remotion shallow-merges ``--props`` onto these defaults,
// so ANY content field left here will LEAK into rendered clips whose
// passed props happen to omit that key. That's exactly how Panel 2
// and Panel 12 ended up showing "1 success / 3-4 years" and
// "3.2x higher rate" despite their props never mentioning those
// numbers — the slide generator LLM didn't emit a ``stats`` field,
// so the example stats from the pre-fix defaultDataCard bled through.
// Same bug bit Panel 8: omitted ``footnote`` → phantom
// "Harvard Business Review" at the bottom of the slide.
//
// Rule of thumb: keep ONLY the structural minimum each component
// needs to mount without crashing. No example copy, no fake numbers,
// no source attributions.
const defaultPyramid = {
  title: "Pyramid Preview",
  levels: [],
  durationInSeconds: 18,
};

const defaultSplit = {
  title: "Split Preview",
  left: { label: "Left", description: "" },
  right: { label: "Right", description: "" },
  durationInSeconds: 20,
};

const defaultTimeline = {
  title: "Timeline Preview",
  events: [],
  durationInSeconds: 20,
};

const defaultThreeColumn = {
  title: "Three-Column Preview",
  columns: [
    { header: "", items: [] },
    { header: "", items: [] },
    { header: "", items: [] },
  ] as const,
  durationInSeconds: 20,
};

const defaultDataCard = {
  title: "DataCard Preview",
  durationInSeconds: 18,
};

// --- Per-type preview compositions (one keyframe each, isolated) ---
const previewStat = {
  seedanceVideoPath: "",
  durationSeconds: 5,
  keyframes: [
    { t: 0.5, dur: 4, type: "stat", text: "1.7x", icon: "📈", style: { color: "#1E64C8", fontSize: 120 } },
  ] as import("./types").Keyframe[],
};

const previewCallout = {
  seedanceVideoPath: "",
  durationSeconds: 6,
  keyframes: [
    { t: 0.5, dur: 5, type: "callout", text: "I'm not a coder", position: "left" },
    { t: 1.0, dur: 4.5, type: "callout", text: "I'm not a developer", position: "right" },
    { t: 2.0, dur: 3.5, type: "callout", text: "I can't use Claude Code", position: "bottom_center" },
  ] as import("./types").Keyframe[],
};

const previewQuote = {
  seedanceVideoPath: "",
  durationSeconds: 5,
  keyframes: [
    { t: 0.5, dur: 4, type: "quote", text: "The gap widens when sponsorship is intentional", accent_word: "intentional", style: { color: "#333333", fontSize: 56 } },
  ] as import("./types").Keyframe[],
};

const previewLabel = {
  seedanceVideoPath: "",
  durationSeconds: 5,
  keyframes: [
    { t: 0.5, dur: 4, type: "label", text: "Source: McKinsey 2024", position: "bottom_center", style: { color: "#666666" } },
  ] as import("./types").Keyframe[],
};

const previewDivider = {
  seedanceVideoPath: "",
  durationSeconds: 5,
  keyframes: [
    { t: 0.5, dur: 4, type: "divider", text: "Part 1 | Prerequisites Before You Start Building", icon: "📋", style: { color: "#333333" } },
  ] as import("./types").Keyframe[],
};

// --- Combined preview (full scene) ---
const defaultKeyframeOverlay = {
  seedanceVideoPath: "",
  durationSeconds: 10,
  keyframes: [
    { t: 0.5, dur: 4, type: "stat", text: "1.7x", style: { color: "#1E64C8", fontSize: 120 } },
    { t: 1.5, dur: 3, type: "label", text: "promotion rate with sponsors", position: "bottom_center", style: { color: "#666666" } },
    { t: 5.5, dur: 4, type: "callout", text: "Same pattern everywhere", position: "left" },
    { t: 6.5, dur: 3.0, type: "callout", text: "Across every industry", position: "right" },
  ] as import("./types").Keyframe[],
};

const durationFrames = (seconds: number) => Math.ceil(seconds * FPS);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PyramidChart"
        component={PyramidChart as any}
        durationInFrames={durationFrames(defaultPyramid.durationInSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultPyramid}
        calculateMetadata={({ props }: { props: typeof defaultPyramid }) => ({
          durationInFrames: durationFrames(props.durationInSeconds ?? 18),
        })}
      />
      <Composition
        id="SplitComparison"
        component={SplitComparison as any}
        durationInFrames={durationFrames(defaultSplit.durationInSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultSplit}
        calculateMetadata={({ props }: { props: typeof defaultSplit }) => ({
          durationInFrames: durationFrames(props.durationInSeconds ?? 20),
        })}
      />
      <Composition
        id="Timeline"
        component={Timeline as any}
        durationInFrames={durationFrames(defaultTimeline.durationInSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultTimeline}
        calculateMetadata={({ props }: { props: typeof defaultTimeline }) => ({
          durationInFrames: durationFrames(props.durationInSeconds ?? 23),
        })}
      />
      <Composition
        id="ThreeColumn"
        component={ThreeColumn as any}
        durationInFrames={durationFrames(defaultThreeColumn.durationInSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultThreeColumn}
        calculateMetadata={({ props }: { props: typeof defaultThreeColumn }) => ({
          durationInFrames: durationFrames(props.durationInSeconds ?? 20),
        })}
      />
      <Composition
        id="DataCard"
        component={DataCard as any}
        durationInFrames={durationFrames(defaultDataCard.durationInSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultDataCard}
        calculateMetadata={({ props }: { props: typeof defaultDataCard }) => ({
          durationInFrames: durationFrames(props.durationInSeconds ?? 19),
        })}
      />
      <Composition
        id="KeyframeOverlay"
        component={KeyframeOverlay as any}
        durationInFrames={durationFrames(defaultKeyframeOverlay.durationSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultKeyframeOverlay}
        calculateMetadata={({
          props,
        }: {
          props: typeof defaultKeyframeOverlay;
        }) => ({
          durationInFrames: durationFrames(props.durationSeconds ?? 10),
        })}
      />
      <Composition
        id="Overlay-Stat"
        component={KeyframeOverlay as any}
        durationInFrames={durationFrames(previewStat.durationSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={previewStat}
        calculateMetadata={({ props }: { props: typeof previewStat }) => ({
          durationInFrames: durationFrames(props.durationSeconds ?? 5),
        })}
      />
      <Composition
        id="Overlay-Callout"
        component={KeyframeOverlay as any}
        durationInFrames={durationFrames(previewCallout.durationSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={previewCallout}
        calculateMetadata={({ props }: { props: typeof previewCallout }) => ({
          durationInFrames: durationFrames(props.durationSeconds ?? 6),
        })}
      />
      <Composition
        id="Overlay-Quote"
        component={KeyframeOverlay as any}
        durationInFrames={durationFrames(previewQuote.durationSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={previewQuote}
        calculateMetadata={({ props }: { props: typeof previewQuote }) => ({
          durationInFrames: durationFrames(props.durationSeconds ?? 5),
        })}
      />
      <Composition
        id="Overlay-Label"
        component={KeyframeOverlay as any}
        durationInFrames={durationFrames(previewLabel.durationSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={previewLabel}
        calculateMetadata={({ props }: { props: typeof previewLabel }) => ({
          durationInFrames: durationFrames(props.durationSeconds ?? 5),
        })}
      />
      <Composition
        id="Overlay-Divider"
        component={KeyframeOverlay as any}
        durationInFrames={durationFrames(previewDivider.durationSeconds)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={previewDivider}
        calculateMetadata={({ props }: { props: typeof previewDivider }) => ({
          durationInFrames: durationFrames(props.durationSeconds ?? 5),
        })}
      />
    </>
  );
};

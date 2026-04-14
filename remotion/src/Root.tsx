// remotion/src/Root.tsx
import React from "react";
import { Composition } from "remotion";
import { PyramidChart } from "./components/PyramidChart";
import { SplitComparison } from "./components/SplitComparison";
import { Timeline } from "./components/Timeline";
import { ThreeColumn } from "./components/ThreeColumn";
import { DataCard } from "./components/DataCard";

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
    </>
  );
};

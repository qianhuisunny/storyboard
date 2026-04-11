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

// Default props for Remotion Studio preview
const defaultPyramid = {
  title: "Women in Tech Leadership",
  levels: [
    { label: "Entry Level", percentage: 45 },
    { label: "Mid-Level", percentage: 32 },
    { label: "Senior Level", percentage: 28 },
    { label: "C-Suite", percentage: 22 },
  ],
  annotation: "Increasing Isolation",
  annotationDirection: "upward" as const,
  durationInSeconds: 17.5,
};

const defaultSplit = {
  title: "Same Behavior, Different Reception",
  left: { label: "Male Leader", description: "Presenting quarterly results", metric: "8.5/10", sentiment: "positive" as const },
  right: { label: "Female Leader", description: "Same presentation style", metric: "5.5/10", sentiment: "negative" as const },
  footnote: "Harvard Business Review",
  durationInSeconds: 20,
};

const defaultTimeline = {
  title: "Career Decision Complexity",
  events: [
    { label: "Promotion Timing", description: "Strategic window management", highlight: true },
    { label: "Family Planning", description: "Career impact assessment" },
    { label: "Project Leadership", description: "Visibility vs. risk" },
    { label: "Credibility Building", description: "Post-transition recovery", highlight: true },
  ],
  direction: "horizontal" as const,
  durationInSeconds: 23,
};

const defaultThreeColumn = {
  title: "Implementation by Role",
  columns: [
    { header: "Female Leaders", items: ["Build peer networks", "Seek male sponsors"] },
    { header: "Male Leaders", items: ["Active sponsorship", "Support networks"] },
    { header: "HR Leaders", items: ["Facilitate networks", "Train sponsors"] },
  ] as const,
  durationInSeconds: 20,
};

const defaultDataCard = {
  title: "Impact Comparison",
  stats: [
    { label: "Individual Approach", value: "1 success / 3-4 years", trend: "flat" as const },
    { label: "Dual-Track Approach", value: "3.2x higher rate", trend: "up" as const },
  ],
  durationInSeconds: 19,
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

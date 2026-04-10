import React from "react";
import { Composition } from "remotion";
import { PyramidChart } from "./components/PyramidChart";
import { SplitComparison } from "./components/SplitComparison";
import { Timeline } from "./components/Timeline";
import { ThreeColumn } from "./components/ThreeColumn";
import { DataCard } from "./components/DataCard";

const FPS = 30;

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
  durationInSeconds: 17.5,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PyramidChart"
        component={PyramidChart}
        durationInFrames={FPS * 18}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultPyramid}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 18) * FPS),
        })}
      />
      <Composition
        id="SplitComparison"
        component={SplitComparison}
        durationInFrames={FPS * 20}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Same Behavior, Different Reception",
          left: { label: "Male Leader", description: "Presenting quarterly results", metric: "8.5/10", sentiment: "positive" as const },
          right: { label: "Female Leader", description: "Same presentation style", metric: "5.5/10", sentiment: "negative" as const },
          footnote: "Harvard Business Review",
          durationInSeconds: 20,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 20) * FPS),
        })}
      />
      <Composition
        id="Timeline"
        component={Timeline}
        durationInFrames={FPS * 23}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Career Decision Complexity",
          events: [
            { label: "Promotion Timing", description: "Strategic window management", highlight: true },
            { label: "Family Planning", description: "Career impact assessment" },
            { label: "Project Leadership", description: "Visibility vs. risk" },
            { label: "Credibility Building", description: "Post-transition recovery", highlight: true },
          ],
          durationInSeconds: 23,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 23) * FPS),
        })}
      />
      <Composition
        id="ThreeColumn"
        component={ThreeColumn}
        durationInFrames={FPS * 20}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Implementation by Role",
          columns: [
            { header: "Female Leaders", items: ["Build peer networks", "Seek male sponsors"] },
            { header: "Male Leaders", items: ["Active sponsorship", "Support networks"] },
            { header: "HR Leaders", items: ["Facilitate networks", "Train sponsors"] },
          ] as [{ header: string; items: string[] }, { header: string; items: string[] }, { header: string; items: string[] }],
          durationInSeconds: 20,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 20) * FPS),
        })}
      />
      <Composition
        id="DataCard"
        component={DataCard}
        durationInFrames={FPS * 19}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Impact Comparison",
          stats: [
            { label: "Individual Approach", value: "1 success / 3-4 years", trend: "flat" as const },
            { label: "Dual-Track Approach", value: "3.2x higher rate", trend: "up" as const },
          ],
          durationInSeconds: 19,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.durationInSeconds || 19) * FPS),
        })}
      />
    </>
  );
};

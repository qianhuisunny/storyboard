import React from "react";
import { Composition } from "remotion";
import { SceneComposition } from "./components/SceneComposition";
import { SceneCompositionProps } from "./types";

const FPS = 25;

const defaultScene: SceneCompositionProps = {
  screenType: "solid_bg",
  composition: "single_center",
  canvasMode: "none",
  durationSeconds: 8,
  overlayElements: [
    {
      kind: "headline",
      text: "How you communicate",
      style: { fontSize: 112 },
    },
  ],
};

const durationFrames = (seconds: number) => Math.ceil(seconds * FPS);

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SceneComposition"
      component={SceneComposition as any}
      durationInFrames={durationFrames(defaultScene.durationSeconds)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultScene}
      calculateMetadata={({ props }) => ({
        durationInFrames: durationFrames(
          ((props as Partial<SceneCompositionProps>).durationSeconds ?? 8),
        ),
      })}
    />
  );
};

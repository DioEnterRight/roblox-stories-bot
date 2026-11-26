import React from "react";
import { Composition } from "remotion";
import "./niches";
import { Reel, calculateReelMetadata } from "./core/Reel";

/**
 * One generic composition renders every project (use pipeline/render.mjs):
 * the project folder public/projects/<slug>/ must contain reel.json (made by pipeline/plan.mjs).
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={30}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ slug: "" }}
      calculateMetadata={calculateReelMetadata}
    />
  );
};

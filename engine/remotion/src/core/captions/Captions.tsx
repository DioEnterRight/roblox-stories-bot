import React from "react";
import { AbsoluteFill } from "remotion";
import type { CaptionState, NicheModule, ReelSpec, Scene, StyleSpec } from "../types";

/**
 * The caption layer. The core computes WHICH words are on screen and in what state;
 * the niche's renderer decides HOW they look (chips, editorial, subtitle…).
 */
export const Captions: React.FC<{
  reel: ReelSpec;
  niche: NicheModule;
  style: StyleSpec;
  state: CaptionState;
  scene?: Scene;
  frame: number;
}> = ({ reel, niche, style, state, scene, frame }) => {
  if (!state.visible) return null;
  if (scene?.captions?.hidden) return null;
  const mode = scene?.captions?.mode ?? reel.captions?.mode ?? style.captions.mode;
  const Renderer = niche.captionRenderers[mode];
  if (!Renderer) {
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300 }}>
        <div style={{ color: "red", fontSize: 40 }}>Unknown caption renderer: {mode}</div>
      </AbsoluteFill>
    );
  }
  return <Renderer state={state} reel={reel} scene={scene} style={style} frame={frame} />;
};

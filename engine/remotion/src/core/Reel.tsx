import React, { useMemo } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import type { NicheModule, ReelSpec, StyleSpec } from "./types";
import { FPS } from "./types";
import { getNiche } from "./registry";
import { buildGroups, getCaptionState } from "./captions/captionState";
import { Captions } from "./captions/Captions";
import { AudioLayer } from "./AudioLayer";
import { primaryScene } from "./sceneTiming";

export type ReelProps = { slug: string; reel?: ReelSpec };

/** Loads public/projects/<slug>/reel.json and sets the composition length from it. */
export const calculateReelMetadata: CalculateMetadataFunction<ReelProps> = async ({ props }) => {
  if (!props.slug) return { durationInFrames: 30, props };
  const res = await fetch(staticFile(`projects/${props.slug}/reel.json`));
  if (!res.ok) throw new Error(`reel.json not found for project "${props.slug}" (${res.status})`);
  const reel = (await res.json()) as ReelSpec;
  return {
    durationInFrames: Math.max(1, Math.ceil(reel.durationSec * (reel.fps || FPS))),
    fps: reel.fps || FPS,
    width: reel.width || 1080,
    height: reel.height || 1920,
    props: { ...props, reel },
  };
};

export const mergeStyle = (base: StyleSpec, override?: Record<string, unknown>): StyleSpec => {
  if (!override) return base;
  const out: StyleSpec = { ...base, ...(override as Partial<StyleSpec>) } as StyleSpec;
  if (override.palette) out.palette = { ...base.palette, ...(override.palette as Record<string, string>) };
  if (override.captions) out.captions = { ...base.captions, ...(override.captions as Partial<StyleSpec["captions"]>) };
  if (override.layout) out.layout = { ...(base.layout ?? {}), ...(override.layout as Record<string, number>) };
  return out;
};

export const Reel: React.FC<ReelProps> = ({ slug, reel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!reel) {
    return (
      <AbsoluteFill style={{ background: "#111", color: "#fff", justifyContent: "center", alignItems: "center", fontSize: 40, fontFamily: "sans-serif" }}>
        {`No reel loaded for "${slug}". Pass --props with a slug whose public/projects/<slug>/reel.json exists.`}
      </AbsoluteFill>
    );
  }
  return <ReelInner reel={reel} frame={frame} fps={fps} />;
};

const ReelInner: React.FC<{ reel: ReelSpec; frame: number; fps: number }> = ({ reel, frame, fps }) => {
  const niche: NicheModule = getNiche(reel.niche);
  const style = useMemo(() => mergeStyle(niche.style, reel.style), [niche, reel.style]);
  const spec = useMemo(() => ({ ...style.captions, ...reel.captions }), [style.captions, reel.captions]);
  const groups = useMemo(() => buildGroups(reel.lines, spec), [reel.lines, spec]);
  const t = frame / fps;
  const captionState = useMemo(() => getCaptionState(reel.lines, spec, groups, t), [reel.lines, spec, groups, t]);
  const scene = primaryScene(reel, t);
  const Stage = niche.Stage;
  const Overlay = niche.Overlay;
  return (
    <AbsoluteFill style={{ background: style.palette.bg ?? "#000" }}>
      <Stage reel={reel} style={style} captionState={captionState} />
      <Captions reel={reel} niche={niche} style={style} state={captionState} scene={scene} frame={frame} />
      {Overlay ? <Overlay reel={reel} style={style} captionState={captionState} /> : null}
      <AudioLayer reel={reel} />
    </AbsoluteFill>
  );
};

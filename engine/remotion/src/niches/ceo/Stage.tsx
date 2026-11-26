/**
 * Stage: ONE persistent <Canvas3D> (set / cast / camera / post are pure functions of t) + the 2D overlay layer.
 * The canvas mounts only after the fonts are loaded so in-world canvas textures get the right glyphs.
 */
import { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { Canvas3D } from "../../core/three/Canvas3D";
import { primaryScene } from "../../core/sceneTiming";
import type { NicheModule, Scene, StyleSpec } from "../../core/types";
import { withDefaults } from "./archetypes";
import { cameraFor, makeProjector, type CamDefaults, type CamState } from "./camera";
import { Overlays } from "./Overlays";
import { cutGuard, framingGuard, resolveCamera, resolveCast } from "./presets";
import { eventsOf, firstAt } from "./three/events";
import type { PostParams } from "./three/Post";
import { World } from "./three/World";
import { fontsReady } from "./ui/fonts";
import { preloadKenney } from "./three/props/decor";
import { preloadKay } from "./three/props/kaykit";

preloadKenney();
preloadKay();

let fontsOk = false;
fontsReady.then(() => {
  fontsOk = true;
});

const useFontsGate = () => {
  const [ready, setReady] = useState(fontsOk);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => (fontsOk ? null : delayRender("ceo: fonts for canvas textures")));
  useEffect(() => {
    if (!ready) fontsReady.then(() => setReady(true));
  }, [ready]);
  useEffect(() => {
    if (ready && handle !== null) continueRender(handle);
  }, [ready, handle, continueRender]);
  return ready;
};

export const CAM_DEFAULTS: CamDefaults = { pos: [0, 2.2, 7], look: [0, 1.2, -1.5], fov: 46, staticDrift: 0.05, handheld: 0.04, microDrift: 0.05 };

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

const MOOD_EXPOSURE: Record<string, number> = { golden: 1.0, evening: 1.02, morning: 0.98, rain: 1.06, night: 1.12 };

export const postFor = (style: StyleSpec, scene: Scene | undefined, camParams: Record<string, unknown>, cam: CamState, frame: number): PostParams => {
  const base = (style.post ?? {}) as Record<string, number>;
  const over = ((scene?.props?.post as Record<string, number>) ?? {}) as Record<string, number>;
  const g = (k: string, d: number) => num(over[k], num(base[k], d));
  const mood = typeof scene?.props?.mood === "string" ? (scene.props.mood as string) : "golden";
  const dofP = camParams.dof as { bokeh?: number; range?: number; focus?: number } | undefined;
  const dist = Math.hypot(cam.pos[0] - cam.look[0], cam.pos[1] - cam.look[1], cam.pos[2] - cam.look[2]);
  return {
    frame,
    exposure: g("exposure", 1) * (MOOD_EXPOSURE[mood] ?? 1),
    vignette: g("vignette", 0.55),
    vignetteRadius: g("vignetteRadius", 0.3),
    ca: g("ca", 3.5),
    grain: g("grain", 0.012),
    sat: g("sat", 1.06),
    contrast: g("contrast", 1.05),
    split: g("split", 0.03),
    bloom: g("bloom", 0.85),
    bloomThreshold: g("bloomThreshold", 0.92),
    bloomRadius: g("bloomRadius", 0.72),
    dof: dofP && (dofP.bokeh ?? 0) > 0 ? { focus: dofP.focus ?? dist, range: dofP.range ?? Math.max(0.6, dist * 0.35), bokeh: dofP.bokeh ?? 3 } : null,
  };
};

const camSceneOf = (scene: Scene) => {
  const cast = resolveCast(scene);
  const spec = resolveCamera(scene, cast);
  const events = eventsOf(scene);
  const prm = { ...(spec.params ?? {}) };
  const camAt = firstAt(events, "cam", "camera");
  if (camAt !== undefined && prm.moveStart === undefined) prm.moveStart = camAt - scene.start;
  return { cast, events, spec, camScene: { ...scene, camera: { rig: spec.rig, params: prm } } as Scene };
};

export const Stage: NicheModule["Stage"] = ({ reel, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const ready = useFontsGate();
  const raw = primaryScene(reel, t);
  const scene = useMemo(() => withDefaults(raw), [raw]);
  const resolved = useMemo(() => (scene ? camSceneOf(scene) : null), [scene]);
  const cast = resolved?.cast ?? [];
  const events = resolved?.events ?? [];
  const cam = cameraFor(resolved?.camScene, t, CAM_DEFAULTS);
  // guards: framing at the shot's first and last frame, jump cut against the previous shot (warn once each)
  useMemo(() => {
    if (!scene || !resolved) return;
    const a = cameraFor(resolved.camScene, scene.start, CAM_DEFAULTS);
    const b = cameraFor(resolved.camScene, Math.max(scene.start, scene.end - 1 / 30), CAM_DEFAULTS);
    framingGuard(scene.id, "start", cast, makeProjector(a, 1080, 1920));
    framingGuard(scene.id, "end", cast, makeProjector(b, 1080, 1920));
    if (scene.start < 0.01) return;
    const prevRaw = primaryScene(reel, scene.start - 1e-3);
    if (!prevRaw || prevRaw.id === scene.id) return;
    const prev = camSceneOf(prevRaw);
    cutGuard(
      { id: prevRaw.id, set: prevRaw.set ?? "", cam: cameraFor(prev.camScene, prevRaw.end - 1e-3, CAM_DEFAULTS) },
      { id: scene.id, set: scene.set ?? "", cam: a },
    );
  }, [scene, resolved, reel, cast]);
  const post = postFor(style, scene, resolved?.spec.params ?? {}, cam, frame);
  if (!ready) return <AbsoluteFill style={{ background: style.palette.bg }} />;
  return (
    <AbsoluteFill style={{ background: style.palette.bg }}>
      <Canvas3D width={width} height={height} camera={{ fov: 46, near: 0.1, far: 160, position: [0, 2.2, 7] }}>
        <World scene={scene} cast={cast} t={t} cam={cam} events={events} post={post} />
      </Canvas3D>
      <Overlays scene={scene} t={t} cam={cam} events={events} cast={cast} />
    </AbsoluteFill>
  );
};

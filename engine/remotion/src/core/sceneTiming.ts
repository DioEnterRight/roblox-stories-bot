import type { ReelSpec, Scene, StyleSpec, Transition } from "./types";
import { clamp } from "./timeline";

export const transitionDuration = (tr: Transition | undefined, fallback: Transition): number => {
  const t = tr ?? fallback;
  if (!t || t.type === "cut" || t.type === "none") return 0;
  return t.durationSec ?? fallback.durationSec ?? 0.35;
};

/** Which scene is active at t, plus timing info for its transitions. Scenes may overlap by their transitions. */
export const activeScenes = (reel: ReelSpec, style: StyleSpec, t: number) => {
  const out: Array<{ scene: Scene; localT: number; inProgress: number; outProgress: number }> = [];
  for (const scene of reel.scenes) {
    const inDur = transitionDuration(scene.transitionIn, style.transitions.defaultIn);
    const outDur = transitionDuration(scene.transitionOut, style.transitions.defaultOut);
    // A scene is mounted from (start - 0) to (end + outDur) so an out-transition can play over the next scene.
    if (t < scene.start || t >= scene.end + outDur) continue;
    const localT = t - scene.start;
    const inProgress = inDur > 0 ? clamp(localT / inDur) : 1;
    out.push({ scene, localT, inProgress, outProgress: t < scene.end - outDur ? 0 : outDur > 0 ? clamp((t - (scene.end - outDur)) / outDur) : 0 });
  }
  return out;
};

/** The primary scene at t (the one whose [start,end) contains t). */
export const primaryScene = (reel: ReelSpec, t: number): Scene | undefined => reel.scenes.find((s) => t >= s.start && t < s.end) ?? reel.scenes[reel.scenes.length - 1];

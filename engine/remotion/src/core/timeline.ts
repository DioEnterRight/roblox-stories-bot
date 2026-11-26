import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./types";

export const secToFrame = (s: number, fps = FPS) => Math.round(s * fps);
export const frameToSec = (f: number, fps = FPS) => f / fps;
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 progress of t between a and b, clamped. */
export const progress = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
export const within = (t: number, a: number, b: number) => t >= a && t < b;

export const ease = {
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  outQuart: Easing.out(Easing.quad),
  outExpo: Easing.out(Easing.exp),
  back: Easing.out(Easing.back(1.7)),
  elastic: Easing.out(Easing.elastic(1)),
};

/** Interpolate with clamped extrapolation (the 99% case). */
export const ip = (
  v: number,
  inRange: [number, number],
  outRange: [number, number],
  easing: (t: number) => number = ease.out,
) => interpolate(v, inRange, outRange, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/**
 * Named spring presets — "the way the viral reels move".
 *  pop     : fast overshoot, UI cards landing
 *  settle  : soft, no overshoot, text sliding in
 *  slam    : stamp / sticker hit, heavy and quick
 *  bounce  : character hop landing
 *  drift   : slow idle easing for cameras
 */
export const SPRINGS = {
  pop: { damping: 14, stiffness: 180, mass: 0.9 },
  settle: { damping: 26, stiffness: 150, mass: 1 },
  slam: { damping: 18, stiffness: 420, mass: 0.7 },
  bounce: { damping: 9, stiffness: 220, mass: 1 },
  drift: { damping: 40, stiffness: 40, mass: 1.4 },
  snappy: { damping: 20, stiffness: 300, mass: 0.8 },
} as const;

export type SpringName = keyof typeof SPRINGS;

/** Spring value 0→1 that starts at absolute time `startSec`, evaluated at `t` seconds. */
export const springAt = (t: number, startSec: number, name: SpringName = "pop", fps = FPS, durationSec?: number) => {
  const frame = Math.max(0, Math.round((t - startSec) * fps));
  if (t < startSec) return 0;
  return spring({ frame, fps, config: SPRINGS[name], durationInFrames: durationSec ? Math.round(durationSec * fps) : undefined });
};

/** Deterministic pseudo-random in [0,1) from a seed — never use Math.random() in a render. */
export const hash01 = (seed: number | string) => {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
};

/** Smooth noise-ish wobble from time (for idle sway, handheld camera). */
export const wobble = (t: number, speed = 1, seed = 0) =>
  Math.sin(t * 1.7 * speed + seed) * 0.6 + Math.sin(t * 2.9 * speed + seed * 1.3) * 0.3 + Math.sin(t * 4.3 * speed + seed * 2.1) * 0.1;

/** Count-up helper: value rises to target over `dur` seconds from `start`, with ease-out. */
export const countUp = (t: number, start: number, dur: number, target: number) => Math.round(target * ip(t, [start, start + dur], [0, 1], ease.outExpo));

export const fmtCompact = (v: number): string => {
  if (v < 1000) return String(Math.round(v));
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
};

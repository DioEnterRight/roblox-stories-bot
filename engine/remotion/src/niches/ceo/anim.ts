/**
 * Dio CEO World — pure animation helpers. Everything is a function of time `t` (seconds) and a seed.
 * No state, no randomness: `hash01` from core/timeline is the only "random" source.
 */
import { hash01 } from "../../core/timeline";

export type V3 = [number, number, number];

export const v3 = (a: unknown, d: V3): V3 =>
  Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === "number" && Number.isFinite(n)) ? [a[0] as number, a[1] as number, a[2] as number] : d;
export const num = (a: unknown, d: number): number => (typeof a === "number" && Number.isFinite(a) ? a : d);
export const str = (a: unknown, d: string): string => (typeof a === "string" ? a : d);
export const bool = (a: unknown, d: boolean): boolean => (typeof a === "boolean" ? a : d);
export const arr = <T>(a: unknown, d: T[]): T[] => (Array.isArray(a) ? (a as T[]) : d);

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
/** Shot progress: 60 % smoothstep + 40 % linear so a camera move never fully stops. */
export const shotProgress = (u: number) => {
  const k = clamp01(u);
  return smooth(k) * 0.6 + k * 0.4;
};
export const easeInOutSine = (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Back-out pop 0 → 1 with ~10 % overshoot over `d` seconds from `t0` (the references' 6–8 frame pop-ins). */
export const popIn = (t: number, t0: number, d = 0.25, over = 1.7) => {
  if (t < t0) return 0;
  const k = clamp01((t - t0) / d);
  const c3 = over + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + over * Math.pow(k - 1, 2);
};
/** Stamp slam: scale 1.6 → 1 with a rotation kick over `d` seconds (3–4 frames in the references). */
export const slamIn = (t: number, t0: number, d = 0.13) => {
  if (t < t0) return { scale: 0, rot: 0, visible: false };
  const k = clamp01((t - t0) / d);
  const e = 1 - Math.pow(1 - k, 3);
  return { scale: lerp(1.6, 1, e), rot: lerp(10, 0, e), visible: true };
};
/** Deterministic jitter in [-amp, amp] from a seed. */
export const jitter = (seed: string | number, amp: number) => (hash01(seed) - 0.5) * 2 * amp;
/** Idle bob: 1 Hz sine. amp in world units (0.02 ≈ 5 px at a typical 7 m framing). */
export const bob = (t: number, hz = 1, amp = 0.02, phase = 0) => Math.sin(t * Math.PI * 2 * hz + phase) * amp;
/** One hop arc (sine) of height h and duration d starting at t0. */
export const hopArc = (t: number, t0: number, d = 0.5, h = 0.35) => {
  const k = (t - t0) / d;
  if (k < 0 || k > 1) return 0;
  return Math.sin(k * Math.PI) * h;
};
/** Repeating hops: period p seconds, hop duration d inside each period. Returns {y, phase, airborne}. */
export const hopCycle = (t: number, period = 0.9, d = 0.45, h = 0.35, phase = 0) => {
  const local = ((t + phase) % period + period) % period;
  const y = local < d ? Math.sin((local / d) * Math.PI) * h : 0;
  return { y, k: local < d ? local / d : 0, airborne: local < d };
};
/** Landing squash (scaleY) around the end of a hop: 1 → 0.9 → 1. */
export const squashAt = (k: number, airborne: boolean) => (airborne ? 1 + Math.sin(k * Math.PI) * 0.06 : 1);
export const typed = (text: string, t: number, start: number, dur: number) => {
  if (dur <= 0) return t >= start ? text : "";
  const n = Math.floor(clamp01((t - start) / dur) * text.length + 1e-6);
  return text.slice(0, n);
};
export const blinkOn = (t: number, hz = 2) => Math.floor(t * hz * 2) % 2 === 0;
/** A 3-frame eye blink every ~3 s (seeded offset). Returns the eye scaleY. */
export const blinkScale = (t: number, seed: number, every = 3.1) => {
  const local = ((t + hash01(seed) * every) % every + every) % every;
  return local < 0.1 ? 0.1 : 1;
};
export const stripPunct = (w: string) => w.replace(/[.,;:!?…"”“]+$/g, "").replace(/^["“]+/g, "");
/** Puff (spawn / eat) 0 → 1 → 0 over `d` seconds; returns progress 0..1 or -1 if inactive. */
export const puffK = (t: number, t0: number, d = 0.4) => {
  const k = (t - t0) / d;
  return k < 0 || k > 1 ? -1 : k;
};
/** Odometer count: steps/sec ticks, lands exactly on `to` at start+dur. */
export const countTick = (t: number, start: number, dur: number, from: number, to: number) => {
  if (t <= start) return from;
  if (t >= start + dur) return to;
  const k = easeOutCubic((t - start) / dur);
  return Math.round(from + (to - from) * k);
};

/**
 * Paper boil (references: title strips, chips and cards shift ≈ 1 px@720 on alternate frames; terminal + 3D stay still).
 * Every 2 frames a new seeded offset dx, dy ∈ {−1.5, 0, +1.5} px and a rotation of ±0.15°.
 */
export const boil = (frame: number, seed: string | number) => {
  const k = Math.floor(frame / 2);
  const pick = (h: number) => (h < 1 / 3 ? -1.5 : h < 2 / 3 ? 0 : 1.5);
  return { dx: pick(hash01(`${seed}bx${k}`)), dy: pick(hash01(`${seed}by${k}`)), rot: (hash01(`${seed}br${k}`) - 0.5) * 0.3 };
};
export const boilTransform = (frame: number, seed: string | number) => {
  const b = boil(frame, seed);
  return `translate(${b.dx}px, ${b.dy}px) rotate(${b.rot.toFixed(3)}deg)`;
};

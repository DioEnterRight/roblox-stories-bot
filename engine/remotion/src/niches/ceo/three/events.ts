/**
 * Scene events: anchors from plan.json (resolved to absolute seconds by pipeline/plan.mjs) read by cast members, props and
 * overlays. An anchor { fire, at, payload } targets an object with payload.who / payload.id ("*" or absent = everyone).
 */
import type { Anchor, Scene } from "../../../core/types";

export type SceneEvent = { fire: string; at: number; who?: string; payload: Record<string, unknown> };

export const eventsOf = (scene: Scene | undefined): SceneEvent[] =>
  (scene?.anchors ?? []).map((a: Anchor) => ({
    fire: a.fire,
    at: a.at,
    who: typeof a.payload?.who === "string" ? (a.payload.who as string) : typeof a.payload?.id === "string" ? (a.payload.id as string) : undefined,
    payload: a.payload ?? {},
  }));

const matches = (e: SceneEvent, id: string) => !e.who || e.who === "*" || e.who === id || e.who.split(",").map((s) => s.trim()).includes(id);

/** All events with this name that target `id`, sorted by time. */
export const eventsFor = (events: SceneEvent[], fire: string, id: string) => events.filter((e) => e.fire === fire && matches(e, id)).sort((a, b) => a.at - b.at);

/** Time of the first matching event (or undefined). Supports a per-target stagger: payload.stagger (s) × payload.order[id]. */
export const firstAt = (events: SceneEvent[], fire: string, id: string): number | undefined => {
  const e = eventsFor(events, fire, id)[0];
  if (!e) return undefined;
  return e.at + staggerOf(e, id);
};

export const staggerOf = (e: SceneEvent, id: string) => {
  const st = typeof e.payload.stagger === "number" ? (e.payload.stagger as number) : 0;
  if (!st) return 0;
  const order = Array.isArray(e.payload.order) ? (e.payload.order as string[]) : null;
  const idx = order ? order.indexOf(id) : Number(id.replace(/\D/g, "")) - 1;
  return st * Math.max(0, idx);
};

/** The latest event of this name (targeting id) that has fired by time t. */
export const latest = (events: SceneEvent[], fire: string, id: string, t: number) => {
  let best: SceneEvent | undefined;
  for (const e of eventsFor(events, fire, id)) if (e.at + staggerOf(e, id) <= t) best = e;
  return best;
};

/** Times of all matching events (with stagger applied). */
export const timesOf = (events: SceneEvent[], fire: string, id: string) => eventsFor(events, fire, id).map((e) => e.at + staggerOf(e, id));

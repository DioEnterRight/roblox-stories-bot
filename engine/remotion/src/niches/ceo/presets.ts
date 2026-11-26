/**
 * Camera + cast resolution, and the render-time guards the pipeline reads back from the browser log.
 *
 * Camera rigs come fully specified from the compiler (pipeline/compiler.py): `from`, `lookAt`, `fov` and an optional
 * move (`push` = fraction of the camera→target distance travelled, `orbit` = degrees around the target, `rise` = metres).
 * Rig "member" frames a cast member (params.who, dist, height, side, lookY, fov) — the close-ups.
 *
 * Guards print ONE line per problem with the prefix "[ceo-guard]"; render.mjs forwards browser warnings and the
 * pipeline turns them into repair notes for the director.
 */
import type { CameraSpec, CastMember, Scene } from "../../core/types";

type V3 = [number, number, number];

const v3 = (a: unknown): V3 | undefined => (Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === "number") ? (a as V3) : undefined);
const num = (a: unknown, d: number) => (typeof a === "number" && Number.isFinite(a) ? a : d);

/** The scene's cast (explicit entries only; `castOnly` keeps a subset). */
export const resolveCast = (scene: Scene | undefined): CastMember[] => {
  if (!scene) return [];
  const out = (scene.cast ?? []).map((c) => ({ ...c, character: c.character ?? "box", props: { ...(c.props ?? {}) } }));
  const only = Array.isArray(scene.props?.castOnly) ? (scene.props.castOnly as string[]) : null;
  return only ? out.filter((m) => only.includes(m.id)) : out;
};

/** Expands member framing and push / orbit / rise moves into concrete rig params. */
export const resolveCamera = (scene: Scene | undefined, cast: CastMember[]): CameraSpec => {
  const spec: CameraSpec = scene?.camera ?? { rig: "static", params: { from: [0, 2.2, 7], lookAt: [0, 1.2, -1.5], fov: 46 } };
  const prm: Record<string, unknown> = { ...(spec.params ?? {}) };
  let rig = spec.rig;
  if (rig === "member") {
    const who = String(prm.who ?? "ceo");
    const m = cast.find((c) => c.id === who);
    const at: V3 = m?.at ?? [0, 0, 0];
    const s = m?.scale ?? 1;
    const head: V3 = [at[0], at[1] + num(prm.lookY, 0.62) * s, at[2]];
    const dist = num(prm.dist, 3.0) * s;
    const side = num(prm.side, 0.5) * s;
    const h = num(prm.height, 0.4) * s;
    prm.from = prm.from ?? [head[0] + side, head[1] + h, head[2] + dist];
    prm.lookAt = prm.lookAt ?? head;
    prm.fov = prm.fov ?? 38;
    if (prm.dof === undefined) prm.dof = { bokeh: 4.5, range: 1.2 * s };
    rig = "push-in";
  }
  const from = v3(prm.from);
  const look = v3(prm.lookAt);
  if (from && look && prm.to === undefined && (prm.push !== undefined || prm.orbit !== undefined || prm.rise !== undefined)) {
    const push = num(prm.push, 0);
    const orbit = (num(prm.orbit, 0) * Math.PI) / 180;
    const rise = num(prm.rise, 0);
    const dx = from[0] - look[0];
    const dz = from[2] - look[2];
    const r = Math.hypot(dx, dz);
    const a0 = Math.atan2(dx, dz);
    const r1 = r * (1 - push);
    const a1 = a0 + orbit;
    const y1 = look[1] + (from[1] - look[1]) * (1 - push) + rise;
    prm.to = [look[0] + Math.sin(a1) * r1, y1, look[2] + Math.cos(a1) * r1];
    if (rig === "static") rig = "push-in";
  } else if (from && look && prm.to === undefined && rig === "push-in") {
    prm.to = from;
  }
  return { rig, params: prm };
};

const warned = new Set<string>();
export const guardWarn = (key: string, msg: string) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[ceo-guard] ${msg}`);
};

/**
 * Framing guard (checked at the shot's start and end): every visible cast member's body centre must sit inside
 * |NDC x| ≤ 0.82, its head top below y 150 (not cut by the top edge) and its body centre above the caption band (y ≤ 1240).
 */
export const framingGuard = (sceneId: string, when: string, cast: CastMember[], project: (p: V3) => { x: number; y: number; visible: boolean }) => {
  for (const m of cast) {
    const at = m.at ?? [0, 0, 0];
    const s = m.scale ?? 1;
    const c = project([at[0], at[1] + 0.55 * s, at[2]]);
    const top = project([at[0], at[1] + 0.95 * s, at[2]]);
    if (!c.visible) {
      guardWarn(`${sceneId}:${m.id}:behind`, `${sceneId} ${when}: ${m.id} is behind the camera`);
      continue;
    }
    const ndcX = c.x / 540 - 1;
    if (Math.abs(ndcX) > 0.82) guardWarn(`${sceneId}:${m.id}:x`, `${sceneId} ${when}: ${m.id} is cut by the frame edge (x ${Math.round(c.x)})`);
    if (top.y < 150) guardWarn(`${sceneId}:${m.id}:top`, `${sceneId} ${when}: ${m.id}'s head is cut by the top edge (y ${Math.round(top.y)})`);
    if (c.y > 1240) guardWarn(`${sceneId}:${m.id}:low`, `${sceneId} ${when}: ${m.id} sits behind the captions (y ${Math.round(c.y)})`);
  }
};

export type GuardBox = { label: string; x0: number; x1: number; y0: number; y1: number };

/** Cards must stay inside the frame, above the caption band, and must not cover a face. */
export const cardGuard = (sceneId: string, cards: GuardBox[], faces: GuardBox[]) => {
  for (const c of cards) {
    if (c.y1 > 1240) guardWarn(`${sceneId}:${c.label}:row`, `${sceneId}: card ${c.label} reaches into the captions (bottom y ${Math.round(c.y1)})`);
    if (c.x0 < 0 || c.x1 > 1080 || c.y0 < 60) guardWarn(`${sceneId}:${c.label}:edge`, `${sceneId}: card ${c.label} is cut by the frame edge`);
    for (const f of faces) {
      const ox = Math.min(c.x1, f.x1) - Math.max(c.x0, f.x0);
      const oy = Math.min(c.y1, f.y1) - Math.max(c.y0, f.y0);
      if (ox > 40 && oy > 40) guardWarn(`${sceneId}:${c.label}:${f.label}`, `${sceneId}: card ${c.label} covers ${f.label}'s face`);
    }
  }
};

/**
 * Jump-cut rule: two consecutive shots in the same set must change the subject size by ≥ 1.35× or the camera
 * azimuth by ≥ 20°, unless they look at different subjects (targets > 1.2 m apart).
 */
export const cutGuard = (a: { id: string; set: string; cam: { pos: V3; look: V3; fov: number } }, b: { id: string; set: string; cam: { pos: V3; look: V3; fov: number } }) => {
  if (a.set !== b.set) return;
  if (Math.hypot(a.cam.look[0] - b.cam.look[0], a.cam.look[1] - b.cam.look[1], a.cam.look[2] - b.cam.look[2]) > 1.2) return;
  const az = (c: { pos: V3; look: V3 }) => (Math.atan2(c.pos[0] - c.look[0], c.pos[2] - c.look[2]) * 180) / Math.PI;
  let dAz = Math.abs(az(a.cam) - az(b.cam)) % 360;
  if (dAz > 180) dAz = 360 - dAz;
  const size = (c: { pos: V3; look: V3; fov: number }) => 1 / (Math.hypot(c.pos[0] - c.look[0], c.pos[1] - c.look[1], c.pos[2] - c.look[2]) * Math.tan((c.fov * Math.PI) / 360));
  const r = size(a.cam) / size(b.cam);
  const ratio = Math.max(r, 1 / r);
  if (ratio < 1.35 && dAz < 20) guardWarn(`cut:${a.id}:${b.id}`, `jump cut ${a.id} → ${b.id}: same framing (size ×${ratio.toFixed(2)}, angle ${dAz.toFixed(0)}°)`);
};

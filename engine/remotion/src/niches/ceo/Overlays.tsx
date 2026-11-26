/**
 * 2D layer between the 3D canvas and the captions: cards (counter / stat / role / flaw / timer), stamps, sparkles,
 * confetti and the screen insert (laptop / phone app). Cards are pinned to canvas px (`pos`) or to a cast member
 * (`anchor: "ceo"`, projected through the same camera so they stick to the world).
 */
import React from "react";
import type { CastMember, Scene } from "../../core/types";
import { clamp01, easeOutCubic } from "./anim";
import { makeProjector, type CamState } from "./camera";
import { TOP } from "./three/Character";
import { firstAt, timesOf, type SceneEvent } from "./three/events";
import { cardGuard, type GuardBox } from "./presets";
import { cardMotion, Confetti, CounterCard, RolePill, Sparkle, Stamp, StatCard, TimerCard } from "./ui/Cards";
import { Insert, type InsertSpec } from "./ui/Insert";

export type CardSpec = {
  id: string;
  kind: "counter" | "stat" | "role" | "flaw" | "timer";
  text?: string;
  label?: string;
  value?: string;
  color?: string;
  tab?: string;
  pos?: [number, number];
  align?: "left" | "center" | "right";
  anchor?: string;
  offset?: [number, number];
  count?: { from?: number; to?: number; dur?: number; prefix?: string; suffix?: string };
  stopValue?: number;
  size?: number;
  big?: boolean;
  icon?: boolean;
};

export type StampSpec = { id: string; text: string; color?: string; pos?: [number, number]; anchor?: string; size?: number; rot?: number };

const CARD_SIZE: Record<CardSpec["kind"], [number, number]> = { counter: [380, 128], stat: [460, 150], role: [480, 104], flaw: [480, 104], timer: [380, 128] };

export const Overlays: React.FC<{ scene: Scene | undefined; t: number; cam: CamState; events: SceneEvent[]; cast: CastMember[] }> = ({ scene, t, cam, events, cast }) => {
  if (!scene) return null;
  const p = scene.props ?? {};
  const project = makeProjector(cam, 1080, 1920);
  const memberPx = (id: string | undefined, offset: [number, number] = [0, 0]): [number, number] | null => {
    if (!id) return null;
    const m = cast.find((c) => c.id === id);
    if (!m) return null;
    const at = m.at ?? [0, 0, 0];
    const q = project([at[0], at[1] + TOP * (m.scale ?? 1) + 0.3, at[2]]);
    return [q.x + offset[0], q.y + offset[1]];
  };

  const cardSpecs = Array.isArray(p.cards) ? (p.cards as CardSpec[]) : [];
  const cards = cardSpecs.map((c) => {
    const at = firstAt(events, "card", c.id) ?? (scene.start < 0.01 ? 0 : scene.start + 0.04);
    if (t < at) return null;
    const mo = cardMotion(t, at, c.id);
    if (!mo) return null;
    const pos = memberPx(c.anchor, c.offset) ?? c.pos ?? [540, 420];
    const align = c.align ?? "center";
    const tx = align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
    let node: React.ReactNode = null;
    const counted = () => {
      if (!c.count) return c.value ?? "";
      const ca = firstAt(events, "count", c.id) ?? at;
      const k = clamp01((t - ca) / (c.count.dur ?? 1));
      const val = Math.round((c.count.from ?? 0) + ((c.count.to ?? 0) - (c.count.from ?? 0)) * easeOutCubic(k));
      return `${c.count.prefix ?? ""}${val.toLocaleString("en-IN")}${c.count.suffix ?? ""}`;
    };
    if (c.kind === "counter") node = <CounterCard value={counted() || "×1"} color={c.color} />;
    else if (c.kind === "stat") node = <StatCard label={c.label ?? ""} value={counted()} color={c.color} icon={c.icon} big={c.big} />;
    else if (c.kind === "role" || c.kind === "flaw") node = <RolePill text={c.text ?? ""} tab={c.tab ?? (c.kind === "flaw" ? "red" : undefined)} textColor={c.kind === "flaw" ? "red" : undefined} size={c.size ?? 46} />;
    else if (c.kind === "timer") {
      const start = firstAt(events, "timer", c.id) ?? at;
      const stop = firstAt(events, "stop", c.id);
      const sv = c.stopValue ?? 4;
      const secs = stop !== undefined ? sv * clamp01((t - start) / Math.max(0.1, stop - start)) : (t - start) * 2;
      node = <TimerCard label={c.label ?? "TIME"} seconds={secs} stopped={stop !== undefined && t >= stop} />;
    }
    return (
      <div key={c.id} style={{ position: "absolute", left: pos[0], top: pos[1], transform: `translate(${tx}, -50%)` }}>
        <div style={{ transform: mo.transform, transformOrigin: "50% 50%" }}>{node}</div>
      </div>
    );
  });

  const faces: GuardBox[] = cast.map((m) => {
    const at = m.at ?? [0, 0, 0];
    const s = m.scale ?? 1;
    const l = project([at[0] - 0.5 * s, at[1] + 0.8 * s, at[2] + 0.4 * s]);
    const r = project([at[0] + 0.5 * s, at[1] + 0.35 * s, at[2] + 0.4 * s]);
    return { label: m.id, x0: Math.min(l.x, r.x), x1: Math.max(l.x, r.x), y0: Math.min(l.y, r.y), y1: Math.max(l.y, r.y) };
  });

  // guard (warn-once): cards inside the frame, above the captions, not over a face
  {
    const boxes: GuardBox[] = cardSpecs.map((c) => {
      const pos = memberPx(c.anchor, c.offset) ?? c.pos ?? [540, 420];
      const [w, h] = CARD_SIZE[c.kind] ?? [420, 128];
      const align = c.align ?? "center";
      const x0 = align === "left" ? pos[0] : align === "right" ? pos[0] - w : pos[0] - w / 2;
      return { label: c.id, x0, x1: x0 + w, y0: pos[1] - h / 2, y1: pos[1] + h / 2 };
    });
    cardGuard(scene.id, boxes, faces);
  }

  // a stamp never sits on the main face: it moves above the face, or below it when there is no room (captions start ~y 1250)
  const stampSpot = (p: [number, number], face?: GuardBox): [number, number] => {
    if (!face) return p;
    const half = 95, pad = 40;
    const top = face.y0 - 1.2 * (face.y1 - face.y0);   // hair + a hop, which often lands on the stamp's word
    if (p[1] + half < top - pad || p[1] - half > face.y1 + pad) return p;
    const above = top - pad - half;
    if (above >= 200) return [p[0], above];
    return [p[0], Math.min(1180, face.y1 + pad + half)];
  };

  const stamps = (Array.isArray(p.stamps) ? (p.stamps as StampSpec[]) : []).map((s) => {
    const at = firstAt(events, "stamp", s.id);
    if (at === undefined || t < at) return null;
    const pos = stampSpot(memberPx(s.anchor) ?? s.pos ?? [540, 760], faces[0]);
    return (
      <div key={s.id} style={{ position: "absolute", left: pos[0], top: pos[1], transform: "translate(-50%, -50%)" }}>
        <Stamp text={s.text} color={s.color} t={t} at={at} size={s.size ?? 104} rot={s.rot ?? -8} />
      </div>
    );
  });

  const confetti = events
    .filter((e) => e.fire === "confetti")
    .map((e, ei) => {
      const base = memberPx(typeof e.payload.anchor === "string" ? (e.payload.anchor as string) : undefined) ?? (Array.isArray(e.payload.pos) ? (e.payload.pos as [number, number]) : [540, 700]);
      return <Confetti key={`cf${ei}`} x={base[0]} y={base[1]} t={t} at={e.at} n={typeof e.payload.n === "number" ? (e.payload.n as number) : 46} />;
    });

  const sparkles = events
    .filter((e) => e.fire === "sparkle")
    .flatMap((e, ei) => {
      const base = memberPx(typeof e.payload.anchor === "string" ? (e.payload.anchor as string) : e.who) ?? (Array.isArray(e.payload.pos) ? (e.payload.pos as [number, number]) : [540, 700]);
      return [0, 1, 2, 3].map((k) => <Sparkle key={`${ei}-${k}`} x={base[0] + [-90, 80, -30, 110][k]} y={base[1] + [-40, -90, 60, 30][k]} t={t} at={e.at + k * 0.07} size={[56, 40, 34, 48][k]} />);
    });

  const insert = p.insert as InsertSpec | undefined;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {insert ? <Insert spec={insert} t={t} showAt={firstAt(events, "insert", "insert") ?? scene.start} lineAts={timesOf(events, "line", "insert")} /> : null}
      {cards}
      {stamps}
      {sparkles}
      {confetti}
    </div>
  );
};

/**
 * BoxGuy — the cast of the channel: a box body with bar eyes, cube hands and four short legs, dressed per persona.
 * Unit = body width W = 1. Body 1.00 × 0.68 × 0.80 (rounded 0.03), four legs 0.12 × 0.24, two floating cube hands 0.16,
 * two black eye bars 0.10 × 0.19 at x ±0.19, no mouth. Costume = lower band (42 % of the body) + tie / bow tie + a hat slab.
 * Motion (all pure functions of t): idle bob 1 Hz ±0.012, roll ±1.5°, blink 3 frames every 2–4 s, hops with anticipation
 * squash, drop-in entrance, walk-out exit, scroll / type / point / cheer / cross / nod actions, puffs on spawn & costume.
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import type { CastMember } from "../../../core/types";
import { hash01 } from "../../../core/timeline";
import { clamp01, easeInOutSine, easeOutCubic, lerp } from "../anim";
import { BOX, CONE, CYL, SPHERE, SPHERE_LO, frustum, roundedBox, torus } from "./geo";
import { blackMat, glowMat, toyMat } from "./materials";
import { speckle } from "./tex";
import { eventsFor, firstAt, latest, staggerOf, timesOf, type SceneEvent } from "./events";
import { Phone, Paddle, Coffee, Magnifier, Pencil, ShoppingBag, Calculator } from "./handProps";

export const BW = 1.0;
export const BH = 0.68;
export const BD = 0.8;
export const LH = 0.24;
export const TOP = LH + BH;

export type HatKind =
  | "none" | "cap" | "bowler" | "tophat" | "wig" | "headphones" | "nightcap" | "beanie" | "flatcap" | "slab" | "hair"
  | "hardhat" | "party" | "crown" | "headband" | "dome";

export type Outfit = {
  color?: string;
  band?: string;
  bandH?: number;
  tie?: string;
  bowtie?: string;
  hat?: HatKind;
  hatColor?: string;
  hatColor2?: string;
  glasses?: "round" | "gold" | "shades";
  necklace?: "pearls" | "gold";
  badge?: boolean;
  scarf?: string;
  teeth?: boolean;
  brows?: boolean;
};

/** Persona presets (`props.persona`). The CEO is the channel's recurring hero; the others are his world.
 *  `props.outfit` overrides any field per video (the look system changes shirt / tie / glasses, never the identity). */
export const PERSONAS: Record<string, Outfit> = {
  plain: {},
  ceo: { color: "#F2C9A2", hat: "hair", hatColor: "#1E1B1C", band: "#2B3A67", tie: "#C9302C" },
  mom: { color: "#E8B894", hat: "hair", hatColor: "#2A1E1A", band: "#C2477A", necklace: "pearls" },
  dad: { color: "#D9A882", hat: "flatcap", hatColor: "#6B5A48", band: "#5E7A5A", glasses: "round", brows: true },
  investor: { color: "#E9C29A", hat: "tophat", hatColor: "#1A1A1E", band: "#2A2A30", bowtie: "#C9302C", glasses: "gold" },
  intern: { color: "#F1CFAE", hat: "cap", hatColor: "#E0503A", band: "#F2C94C", badge: true },
  friend: { color: "#C9946E", hat: "beanie", hatColor: "#3C6FE0", band: "#E8E2D2" },
  landlord: { color: "#E0B48E", hat: "bowler", hatColor: "#1C1A1C", band: "#57606B", glasses: "round", brows: true },
  barista: { color: "#D8A47E", hat: "cap", hatColor: "#2D6A4F", band: "#2D6A4F", badge: true },
  hr: { color: "#EDC6A6", hat: "hair", hatColor: "#4A2E22", band: "#7B5EA7", glasses: "round" },
  rival: { color: "#E3BC96", hat: "hair", hatColor: "#B8862E", band: "#1E1E24", tie: "#E0B43C", glasses: "shades" },
};

export const BODY_DEFAULT = "#F2C9A2";

type Props = {
  member: CastMember;
  t: number;
  sceneStart: number;
  sceneEnd: number;
  events: SceneEvent[];
  index: number;
};

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const v3 = (v: unknown): [number, number, number] | undefined => (Array.isArray(v) && v.length === 3 ? (v as [number, number, number]) : undefined);

/** A hop arc: anticipation squash (0.12 s before t0), flight 0.34 s, landing squash 0.14 s. */
const hopState = (t: number, t0: number, h: number) => {
  const pre = 0.12;
  const fly = 0.34;
  const land = 0.16;
  if (t < t0 - pre || t > t0 + fly + land) return { y: 0, sy: 1, splay: 0 };
  if (t < t0) {
    const k = (t - (t0 - pre)) / pre;
    return { y: 0, sy: 1 - 0.12 * Math.sin((k * Math.PI) / 2), splay: 0 };
  }
  if (t < t0 + fly) {
    const k = (t - t0) / fly;
    return { y: Math.sin(k * Math.PI) * h, sy: 1 + 0.08 * Math.sin(k * Math.PI), splay: Math.sin(k * Math.PI) };
  }
  const k = (t - t0 - fly) / land;
  return { y: 0, sy: 1 - 0.14 * Math.sin(k * Math.PI) * (1 - k * 0.3), splay: 0 };
};

const Eye: React.FC<{ x: number; y: number; sy: number; mood: string; side: number }> = ({ x, y, sy, mood, side }) => {
  const m = blackMat();
  const z = BD / 2 + 0.006;
  if (mood === "happy") {
    // ^ ^ eyes: two short bars forming a chevron
    return (
      <group position={[x, y + 0.02, z]}>
        <mesh geometry={BOX} material={m} position={[-0.03, 0, 0]} rotation={[0, 0, 0.75]} scale={[0.1, 0.035, 0.012]} />
        <mesh geometry={BOX} material={m} position={[0.03, 0, 0]} rotation={[0, 0, -0.75]} scale={[0.1, 0.035, 0.012]} />
      </group>
    );
  }
  if (mood === "x") {
    return (
      <group position={[x, y, z]}>
        <mesh geometry={BOX} material={m} rotation={[0, 0, 0.785]} scale={[0.15, 0.035, 0.012]} />
        <mesh geometry={BOX} material={m} rotation={[0, 0, -0.785]} scale={[0.15, 0.035, 0.012]} />
      </group>
    );
  }
  let h = 0.19 * sy;
  if (mood === "sleepy") h = 0.045;
  if (mood === "surprised") h = 0.22 * sy;
  const w = mood === "surprised" ? 0.12 : 0.1;
  void side;
  return <mesh geometry={BOX} material={m} position={[x, y, z]} scale={[w, Math.max(0.012, h), 0.012]} />;
};

const Brows: React.FC<{ mood: string; y: number }> = ({ mood, y }) => {
  const m = blackMat();
  const z = BD / 2 + 0.008;
  if (!["angry", "sceptic", "sad", "worried"].includes(mood)) return null;
  const rotL = mood === "angry" ? -0.38 : mood === "sad" || mood === "worried" ? 0.32 : 0.0;
  const rotR = mood === "angry" ? 0.38 : mood === "sad" || mood === "worried" ? -0.32 : -0.42;
  const yL = mood === "sceptic" ? y + 0.15 : y + 0.13;
  const yR = mood === "sceptic" ? y + 0.12 : y + 0.13;
  return (
    <>
      <mesh geometry={BOX} material={m} position={[-0.19, yL, z]} rotation={[0, 0, rotL]} scale={[0.17, 0.04, 0.012]} />
      <mesh geometry={BOX} material={m} position={[0.19, yR, z]} rotation={[0, 0, rotR]} scale={[0.17, 0.04, 0.012]} />
    </>
  );
};

const Hat: React.FC<{ o: Outfit; seed: number }> = ({ o, seed }) => {
  const kind = o.hat ?? "none";
  const c = o.hatColor ?? "#1C1A1C";
  const c2 = o.hatColor2 ?? "#F2EEE6";
  const dark = new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;
  const hatMat = dark ? toyMat("#FFFFFF", { map: speckle(c, "#8F8A8E", 0.07, seed), rough: 0.9 }) : toyMat(c, { felt: seed, rough: 0.85 });
  const m2 = toyMat(c2, { felt: seed + 1 });
  const y = TOP;
  switch (kind) {
    case "slab":
      return <mesh geometry={roundedBox(BW + 0.05, 0.11, BD + 0.05, 0.02)} material={hatMat} position={[0, y + 0.05, 0]} castShadow />;
    case "hair":
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={roundedBox(BW + 0.04, 0.13, BD + 0.04, 0.03)} material={hatMat} position={[0, 0.055, 0]} castShadow />
          <mesh geometry={roundedBox(BW + 0.04, 0.09, 0.08, 0.02)} material={hatMat} position={[0, -0.03, BD / 2 - 0.02]} castShadow />
        </group>
      );
    case "cap":
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={SPHERE} material={hatMat} position={[0, 0.0, -0.02]} scale={[0.96, 0.4, 0.8]} castShadow />
          <mesh geometry={roundedBox(0.62, 0.035, 0.34, 0.012)} material={hatMat} position={[0, 0.02, BD / 2 + 0.1]} castShadow />
          <mesh geometry={SPHERE_LO} material={hatMat} position={[0, 0.2, -0.02]} scale={0.07} />
        </group>
      );
    case "bowler":
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={CYL} material={hatMat} position={[0, 0.015, 0]} scale={[1.08, 0.03, 0.98]} castShadow />
          <mesh geometry={CYL} material={hatMat} position={[0, 0.11, 0]} scale={[0.66, 0.18, 0.62]} castShadow />
          <mesh geometry={SPHERE} material={hatMat} position={[0, 0.2, 0]} scale={[0.66, 0.24, 0.62]} castShadow />
          <mesh geometry={CYL} material={toyMat("#8E2A2A", { felt: 4 })} position={[0, 0.05, 0]} scale={[0.675, 0.05, 0.635]} />
        </group>
      );
    case "tophat":
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={CYL} material={hatMat} position={[0, 0.015, 0]} scale={[0.95, 0.03, 0.85]} castShadow />
          <mesh geometry={CYL} material={hatMat} position={[0, 0.27, 0]} scale={[0.58, 0.5, 0.55]} castShadow />
        </group>
      );
    case "wig": {
      const puffs: React.ReactNode[] = [];
      const white = toyMat(c, { felt: seed, rough: 0.95 });
      let i = 0;
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 6; col++) {
          const x = -0.44 + col * 0.176;
          const z = -0.27 + row * 0.27;
          const r = 0.13 + hash01(`${seed}w${i}`) * 0.03;
          puffs.push(<mesh key={i++} geometry={SPHERE_LO} material={white} position={[x, 0.04 + hash01(`${seed}y${i}`) * 0.03, z]} scale={r * 2} castShadow />);
        }
      for (const s of [-1, 1])
        for (let k = 0; k < 3; k++)
          puffs.push(<mesh key={i++} geometry={SPHERE_LO} material={white} position={[s * 0.53, -0.06 - k * 0.1, 0.1 - k * 0.12]} scale={0.2} castShadow />);
      return (
        <group position={[0, y, 0]}>
          {puffs}
        </group>
      );
    }
    case "headphones":
      return (
        <group position={[0, y - 0.1, 0.02]}>
          <mesh geometry={torus(0.56, 0.035, Math.PI, 8, 28)} material={hatMat} position={[0, 0.12, 0]} castShadow />
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.56, 0.06, 0]}>
              <mesh geometry={CYL} material={hatMat} rotation={[0, 0, Math.PI / 2]} scale={[0.26, 0.1, 0.26]} castShadow />
              <mesh geometry={CYL} material={toyMat("#E8E4DC", { felt: 3 })} position={[s * -0.055, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.2, 0.02, 0.2]} />
            </group>
          ))}
          <mesh geometry={CYL} material={toyMat("#F27CA8", { felt: 5 })} position={[-0.5, -0.12, 0.28]} rotation={[0.9, 0, 0.3]} scale={[0.03, 0.42, 0.03]} />
          <mesh geometry={SPHERE_LO} material={toyMat("#2A2A2A", { felt: 5 })} position={[-0.42, -0.26, 0.45]} scale={0.08} />
        </group>
      );
    case "nightcap":
      // floppy cap: fluffy white band, three bent frustums, pompom hanging at the side
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={roundedBox(BW + 0.06, 0.13, BD + 0.06, 0.06)} material={m2} position={[0, 0.04, 0]} castShadow />
          <mesh geometry={frustum(0.32, 0.42, 0.24)} material={hatMat} position={[0, 0.2, 0]} scale={[1, 1, 0.85]} castShadow />
          <group position={[0.05, 0.31, 0]} rotation={[0, 0, -0.75]} scale={0.82}>
            <mesh geometry={frustum(0.22, 0.36, 0.3)} material={hatMat} position={[0, 0.13, 0]} scale={[1, 1, 0.85]} castShadow />
            <group position={[0, 0.27, 0]} rotation={[0, 0, -0.85]}>
              <mesh geometry={frustum(0.06, 0.22, 0.32)} material={hatMat} position={[0, 0.14, 0]} scale={[1, 1, 0.85]} castShadow />
              <mesh geometry={SPHERE_LO} material={m2} position={[0, 0.33, 0]} scale={0.2} castShadow />
            </group>
          </group>
        </group>
      );
    case "beanie":
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={SPHERE} material={hatMat} position={[0, 0.0, 0]} scale={[1.0, 0.5, 0.84]} castShadow />
          <mesh geometry={roundedBox(BW + 0.06, 0.1, BD + 0.06, 0.03)} material={hatMat} position={[0, 0.0, 0]} castShadow />
        </group>
      );
    case "flatcap":
      // newsboy cap: soft rounded crown smaller than the head + a short peak
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={SPHERE} material={hatMat} position={[0, 0.02, -0.04]} scale={[1.0, 0.26, 0.78]} castShadow />
          <mesh geometry={roundedBox(0.66, 0.035, 0.26, 0.015)} material={hatMat} position={[0, 0.03, BD / 2 + 0.04]} rotation={[0.18, 0, 0]} castShadow />
          <mesh geometry={SPHERE_LO} material={hatMat} position={[0, 0.15, -0.04]} scale={0.06} />
        </group>
      );
    case "hardhat":
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={SPHERE} material={hatMat} position={[0, 0.0, 0]} scale={[0.9, 0.5, 0.76]} castShadow />
          <mesh geometry={CYL} material={hatMat} position={[0, 0.01, 0.04]} scale={[1.1, 0.03, 0.98]} castShadow />
        </group>
      );
    case "party":
      return (
        <group position={[0.1, y, 0]}>
          <mesh geometry={CONE} material={hatMat} position={[0, 0.27, 0]} scale={[0.42, 0.55, 0.42]} castShadow />
          <mesh geometry={torus(0.19, 0.03)} material={m2} position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={SPHERE_LO} material={m2} position={[0, 0.56, 0]} scale={0.1} />
        </group>
      );
    case "crown":
      return (
        <group position={[0, y + 0.07, 0]}>
          <mesh geometry={CYL} material={toyMat("#E8B23A", { rough: 0.4, metal: 0.3 })} scale={[0.6, 0.12, 0.6]} />
          {Array.from({ length: 6 }).map((_, k) => (
            <mesh key={k} geometry={CONE} material={toyMat("#E8B23A", { rough: 0.4, metal: 0.3 })} position={[Math.sin((k / 6) * Math.PI * 2) * 0.28, 0.12, Math.cos((k / 6) * Math.PI * 2) * 0.28]} scale={[0.1, 0.16, 0.1]} />
          ))}
        </group>
      );
    case "headband":
      return (
        <group position={[0, y - 0.07, 0]}>
          <mesh geometry={roundedBox(BW + 0.035, 0.1, BD + 0.035, 0.02)} material={toyMat(c, { felt: seed })} castShadow />
          <mesh geometry={BOX} material={toyMat(c, { felt: seed })} position={[0.53, -0.05, 0.12]} rotation={[0, 0, -0.6]} scale={[0.07, 0.18, 0.05]} />
        </group>
      );
    case "dome":
      return (
        <group position={[0, y, 0]}>
          <mesh geometry={SPHERE} material={hatMat} position={[0, 0.05, 0]} scale={[0.92, 0.55, 0.8]} castShadow />
          <mesh geometry={CYL} material={hatMat} position={[0, 0.03, 0]} scale={[1.25, 0.025, 1.1]} castShadow />
          <mesh geometry={CYL} material={m2} position={[0, 0.08, 0]} scale={[0.93, 0.07, 0.81]} />
        </group>
      );
    default:
      return null;
  }
};

const Glasses: React.FC<{ kind?: Outfit["glasses"]; y: number }> = ({ kind, y }) => {
  if (!kind) return null;
  const col = kind === "gold" ? "#E2B43C" : "#141313";
  const m = toyMat(col, { rough: 0.35, metal: kind === "gold" ? 0.4 : 0, felt: false });
  const z = BD / 2 + 0.03;
  if (kind === "shades")
    return (
      <group position={[0, y, z]}>
        <mesh geometry={BOX} material={m} scale={[0.66, 0.16, 0.03]} />
      </group>
    );
  return (
    <group position={[0, y, z]}>
      {[-0.19, 0.19].map((x) => (
        <mesh key={x} geometry={torus(0.115, 0.022, Math.PI * 2, 8, 24)} material={m} position={[x, 0, 0]} />
      ))}
      <mesh geometry={BOX} material={m} scale={[0.15, 0.025, 0.02]} />
    </group>
  );
};

const Band: React.FC<{ o: Outfit; seed: number }> = ({ o, seed }) => {
  if (!o.band && !o.tie && !o.bowtie && !o.necklace && !o.badge && !o.scarf) return null;
  const bh = BH * (o.bandH ?? 0.42);
  const bandMat = o.band ? toyMat(o.band, { felt: seed + 2 }) : null;
  const zf = BD / 2 + 0.02;
  return (
    <group>
      {bandMat ? <mesh geometry={roundedBox(BW + 0.025, bh, BD + 0.025, 0.02)} material={bandMat} position={[0, LH + bh / 2 - 0.005, 0]} castShadow receiveShadow /> : null}
      {o.tie ? (
        <group position={[0, LH + bh - 0.01, zf]}>
          <mesh geometry={BOX} material={toyMat(o.tie, { felt: 7 })} position={[0, -0.03, 0]} scale={[0.1, 0.07, 0.025]} />
          <mesh geometry={BOX} material={toyMat(o.tie, { felt: 7 })} position={[0, -0.16, 0]} scale={[0.085, 0.2, 0.02]} />
          <mesh geometry={BOX} material={toyMat(o.tie, { felt: 7 })} position={[0, -0.27, 0]} rotation={[0, 0, Math.PI / 4]} scale={[0.06, 0.06, 0.02]} />
        </group>
      ) : null}
      {o.bowtie ? (
        <group position={[0, LH + bh + 0.0, zf + 0.01]}>
          <mesh geometry={BOX} material={toyMat(o.bowtie, { felt: 8 })} position={[-0.075, 0, 0]} rotation={[0, 0, 0.35]} scale={[0.13, 0.09, 0.03]} />
          <mesh geometry={BOX} material={toyMat(o.bowtie, { felt: 8 })} position={[0.075, 0, 0]} rotation={[0, 0, -0.35]} scale={[0.13, 0.09, 0.03]} />
          <mesh geometry={BOX} material={toyMat(o.bowtie, { felt: 8 })} scale={[0.05, 0.065, 0.04]} />
        </group>
      ) : null}
      {o.necklace ? (
        <group position={[0, LH + bh + 0.02, zf]}>
          {Array.from({ length: 9 }).map((_, k) => {
            const u = (k - 4) / 4;
            return <mesh key={k} geometry={SPHERE_LO} material={toyMat(o.necklace === "gold" ? "#E2B43C" : "#F4F0E8", { rough: 0.3, felt: false })} position={[u * 0.32, -Math.abs(u) * -0.02 - (1 - u * u) * 0.06, 0]} scale={0.055} />;
          })}
        </group>
      ) : null}
      {o.scarf ? <mesh geometry={roundedBox(BW + 0.06, 0.1, BD + 0.06, 0.04)} material={toyMat(o.scarf, { felt: 9 })} position={[0, LH + bh + 0.04, 0]} /> : null}
      {o.badge ? (
        <group position={[0.25, LH + bh * 0.5, zf]}>
          <mesh geometry={CYL} material={toyMat("#F3EDE0", { felt: 2 })} rotation={[Math.PI / 2, 0, 0]} scale={[0.15, 0.02, 0.15]} />
          <mesh geometry={CYL} material={toyMat("#E0704F", { felt: false })} position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} scale={[0.07, 0.01, 0.07]} />
        </group>
      ) : null}
    </group>
  );
};

/** Grey/white puff cloud (spawn, costume change, exit). k = 0..1 progress. */
export const Puff: React.FC<{ k: number; seed: number; scale?: number }> = ({ k, seed, scale = 1 }) => {
  if (k < 0 || k > 1) return null;
  const m = toyMat("#ECE7E2", { rough: 1, transparent: true, opacity: Math.max(0, 0.85 - k * k * 0.85), felt: false });
  return (
    <group scale={scale}>
      {Array.from({ length: 11 }).map((_, i) => {
        const a = (i / 11) * Math.PI * 2 + hash01(`${seed}p${i}`);
        const r = 0.3 + easeOutCubic(k) * 0.55;
        const s = Math.sin(k * Math.PI) * (0.16 + hash01(`${seed}s${i}`) * 0.14);
        return <mesh key={i} geometry={SPHERE_LO} material={m} position={[Math.cos(a) * r, 0.45 + Math.sin(a * 1.7) * 0.25 + k * 0.2, Math.sin(a) * r * 0.6]} scale={Math.max(0.001, s)} />;
      })}
    </group>
  );
};

export type Pose = {
  x: number;
  y: number;
  z: number;
  rotY: number;
  yaw: number;
  pitch: number;
  roll: number;
  sy: number;
  splay: number;
  visible: boolean;
  walking: boolean;
  walkPhase: number;
  action: string;
  lt: number;
  expression: string;
};

/** The whole body pose of a cast member at time tt — a pure function (used for the frame AND the motion-blur ghosts). */
export const boxPose = (member: CastMember, tt: number, sceneStart: number, events: SceneEvent[], index: number, brows: boolean): Pose => {
  const p = member.props ?? {};
  const id = member.id;
  const base: [number, number, number] = member.at ?? [0, 0, 0];
  const crate = num(p.crate, 0);
  let x = base[0];
  let y = base[1] + crate;
  let z = base[2];
  let rotY = member.rotY ?? 0;
  let visible = true;
  let sy = 1;
  let splay = 0;
  let walkPhase = 0;
  let walking = false;
  const phase = hash01(`${id}ph`) * Math.PI * 2;

  const enterAt = firstAt(events, "enter", id);
  const enterEv = eventsFor(events, "enter", id)[0];
  const enterFrom = str(enterEv?.payload.from, str(p.enterFrom, "drop"));
  if (enterAt !== undefined) {
    const dt = tt - enterAt;
    if (dt < 0) visible = false;
    else if (enterFrom === "drop") {
      const fall = 0.28;
      if (dt < fall) {
        const k = dt / fall;
        y += (1 - k * k) * 3.2;
        sy = 1.08;
      } else {
        const k = (dt - fall) / 0.22;
        if (k < 1) sy = 1 - 0.2 * Math.sin(k * Math.PI) * (1 - k * 0.4);
      }
    } else if (enterFrom === "left" || enterFrom === "right") {
      const dur = 0.75;
      const s = enterFrom === "left" ? -1 : 1;
      if (dt < dur) {
        const k = dt / dur;
        const hk = (k * 3) % 1;
        x += s * (1 - easeOutCubic(k)) * 3.2;
        y += Math.sin(hk * Math.PI) * 0.28;
        rotY += s * -0.5 * (1 - k);
        splay = Math.sin(hk * Math.PI);
      }
    } else if (enterFrom === "puff") {
      if (dt < 0.12) visible = false;
    }
  }
  const exitAt = firstAt(events, "exit", id);
  const exitEv = eventsFor(events, "exit", id)[0];
  const exitMode = str(exitEv?.payload.to, str(p.exitTo, "right"));
  if (exitAt !== undefined && tt >= exitAt && exitMode === "puff") {
    const hs = hopState(tt, exitAt + 0.02, 0.5);
    y += hs.y;
    sy *= hs.sy;
    if (tt > exitAt + 0.22) visible = false;
  } else if (exitAt !== undefined && tt >= exitAt) {
    const s = exitMode === "left" ? -1 : 1;
    const dt = tt - exitAt;
    const dur = num(exitEv?.payload.dur, 1.0);
    const dist = num(exitEv?.payload.dist, 4.5);
    const k = clamp01(dt / dur);
    rotY = lerp(rotY, s * Math.PI * 0.5, clamp01(dt / 0.18));
    x += s * easeInOutSine(k) * dist;
    walking = k < 1;
    walkPhase = dt * 9;
    y += Math.abs(Math.sin(walkPhase)) * 0.06;
    if (k >= 1) visible = false;
  }
  const walkFrom = v3(p.walkFrom);
  const walkStart = firstAt(events, "walk", id);
  if (walkFrom && walkStart !== undefined) {
    const dur = num(eventsFor(events, "walk", id)[0]?.payload.dur, 1.2);
    const k = clamp01((tt - walkStart) / dur);
    if (tt < walkStart) {
      x = walkFrom[0];
      z = walkFrom[2];
    } else if (k < 1) {
      x = lerp(walkFrom[0], base[0], easeInOutSine(k));
      z = lerp(walkFrom[2], base[2], easeInOutSine(k));
      walking = true;
      walkPhase = (tt - walkStart) * 9;
      y += Math.abs(Math.sin(walkPhase)) * 0.06;
    }
  }
  for (const h of timesOf(events, "hop", id)) {
    const hs = hopState(tt, h, num(p.hopHeight, 0.45));
    if (hs.y > 0 || hs.sy !== 1) {
      y += hs.y;
      sy *= hs.sy;
      splay = Math.max(splay, hs.splay);
    }
  }
  const actEv = latest(events, "act", id, tt);
  const action = str(actEv?.payload.action, member.action ?? "idle");
  const actStart = actEv ? actEv.at + staggerOf(actEv, id) : sceneStart;
  const expression = str(actEv?.payload.expression, member.expression ?? (brows ? "sceptic" : "neutral"));
  const lt = tt - actStart;
  if (action === "cheer") {
    const per = 0.52;
    const local = ((lt + index * 0.13) % per + per) % per;
    const hs = hopState(local + 0.12, 0.12, 0.32);
    y += hs.y;
    sy *= hs.sy;
    splay = Math.max(splay, hs.splay);
  }
  if (action === "bounce") {
    const per = 0.9;
    const local = ((lt + index * 0.21) % per + per) % per;
    const hs = hopState(local + 0.12, 0.12, 0.22);
    y += hs.y;
    sy *= hs.sy;
  }
  // idle bob + roll + breathe (always on; the references bob ±5 px at 1 Hz and sway)
  const bob = Math.sin(tt * Math.PI * 2 * 1.0 + phase) * 0.03;
  const roll = Math.sin(tt * Math.PI * 2 * 0.55 + phase) * 0.06;
  sy *= 1 + Math.sin(tt * Math.PI * 2 * 1.0 + phase) * 0.018;
  let pitch = 0;
  if (action === "nod") pitch = Math.max(0, Math.sin(lt * 9)) * 0.14;
  if (action === "scroll" || action === "type" || action === "write") pitch = 0.08;
  if (action === "sad") pitch = 0.12;
  let yaw = Math.sin(tt * 1.3 + phase * 2) * 0.08;
  if (action === "shake") yaw += Math.sin(lt * 14) * 0.18 * Math.exp(-lt * 1.2);
  if (action === "look") {
    const target = v3(actEv?.payload.target ?? p.lookAt);
    if (target) yaw = Math.atan2(target[0] - x, target[2] - z) - rotY;
  }
  return { x, y: y + bob, z, rotY, yaw, pitch, roll, sy, splay, visible, walking, walkPhase, action, lt, expression };
};

export const BoxGuy: React.FC<Props> = ({ member, t, sceneStart, events, index }) => {
  const p = member.props ?? {};
  const id = member.id;
  const seed = Math.floor(hash01(id) * 1000);
  const persona = str(p.persona, "plain");
  const outfitFull: Outfit = { ...(PERSONAS[persona] ?? {}), ...((p.outfit as Outfit) ?? {}) };
  const costumeAt = firstAt(events, "costume", id);
  const outfit: Outfit = costumeAt !== undefined && t < costumeAt ? { color: outfitFull.color } : outfitFull;
  const color = outfit.color ?? str(p.color, BODY_DEFAULT);
  const bodyMat = useMemo(() => toyMat(color, { felt: 11 + (seed % 5), rough: 0.88 }), [color, seed]);
  const base: [number, number, number] = member.at ?? [0, 0, 0];
  const crate = num(p.crate, 0);
  const pose = boxPose(member, t, sceneStart, events, index, Boolean(outfit.brows));
  const { x, y, z, rotY, yaw, pitch, roll, splay, walking, walkPhase, action, lt } = pose;
  const sy = pose.sy;
  const visible = pose.visible;
  const enterAt = firstAt(events, "enter", id);
  const enterFrom = str(eventsFor(events, "enter", id)[0]?.payload.from, str(p.enterFrom, "drop"));
  const exitAt = firstAt(events, "exit", id);
  const exitMode = str(eventsFor(events, "exit", id)[0]?.payload.to, str(p.exitTo, "right"));
  const expression = pose.expression;

  // blink: 3 frames every 2–4 s
  const blinkEvery = 2.2 + hash01(`${id}bl`) * 1.8;
  const bl = ((t + hash01(`${id}bo`) * blinkEvery) % blinkEvery + blinkEvery) % blinkEvery;
  const eyeSy = bl < 0.1 ? 0.12 : 1;
  const mood = expression;

  if (!visible) {
    if (exitAt !== undefined && exitMode === "puff" && t < exitAt + 0.8)
      return (
        <group position={[base[0], base[1], base[2]]} scale={member.scale ?? 1}>
          <Puff k={(t - exitAt - 0.18) / 0.5} seed={seed + 7} scale={1.3} />
        </group>
      );
    return null;
  }
  const s = member.scale ?? 1;
  const sx = 1 / Math.sqrt(Math.max(0.5, sy));

  // hands
  const handMat = bodyMat;
  const hold = str(p.hold, "");
  let lh: [number, number, number] = [-0.6, LH + BH * 0.38, 0.08];
  let rh: [number, number, number] = [0.6, LH + BH * 0.38, 0.08];
  const hb = Math.sin(t * Math.PI * 2 + hash01(`${id}ph`) * Math.PI * 2 + 1) * 0.03;
  lh[1] += hb;
  rh[1] += hb * 0.8;
  if (action === "scroll" || hold === "phone") {
    rh = [0.3, LH + BH * 0.34, 0.66];
    lh = [-0.26, LH + BH * 0.26 + (action === "scroll" ? Math.max(0, Math.sin(lt * 7)) * 0.07 : 0), 0.64];
  }
  if (action === "type") {
    lh = [-0.3, LH + BH * 0.28 + Math.max(0, Math.sin(lt * 20)) * 0.06, 0.62];
    rh = [0.3, LH + BH * 0.28 + Math.max(0, Math.sin(lt * 20 + 2)) * 0.06, 0.62];
  }
  if (action === "write") {
    rh = [0.3 + Math.sin(lt * 6) * 0.12, LH + BH * 0.5 + Math.sin(lt * 13) * 0.03, 0.62];
  }
  if (action === "point") {
    rh = [0.82, LH + BH * 0.72 + Math.sin(lt * 5) * 0.03, 0.3];
  }
  if (action === "cheer" || action === "raise") {
    const up = action === "raise" ? clamp01(lt / 0.2) : 1;
    lh = [-0.66, LH + BH * (0.38 + 0.75 * up) + Math.sin(t * 12) * 0.03 * up, 0.1];
    rh = [0.66, LH + BH * (0.38 + 0.75 * up) + Math.sin(t * 12 + 1) * 0.03 * up, 0.1];
  }
  if (action === "cross") {
    lh = [-0.18, LH + BH * 0.32, 0.5];
    rh = [0.18, LH + BH * 0.36, 0.52];
  }
  // paddle / sign: right hand at x +0.62 by default; props.paddleX moves the holding hand (negative = left hand), so a
  // five-wide lineup can spread its paddles evenly inside the frame
  const paddleX = num(p.paddleX, str(p.hand, "right") === "left" ? -0.62 : 0.62);
  const leftHold = paddleX < 0;
  if ((hold === "paddle" || hold === "sign") && !leftHold) rh = [paddleX, LH + BH * 0.95, 0.15];
  if ((hold === "paddle" || hold === "sign") && leftHold) lh = [paddleX, LH + BH * 0.95, 0.15];
  if (hold === "coffee") lh = [-0.62, LH + BH * 0.42, 0.25];
  if (hold === "magnifier") rh = [0.42, LH + BH * 0.62, 0.62];
  if (hold === "pencil") rh = [0.42 + (action === "write" ? Math.sin(lt * 6) * 0.1 : 0), LH + BH * 0.5, 0.66];
  if (hold === "bag") lh = [-0.64, LH + BH * 0.25, 0.1];
  if (hold === "calculator") rh = [0.36, LH + BH * 0.5, 0.6];

  const legs = [-0.34, -0.12, 0.12, 0.34];
  const eyeY = LH + BH * 0.66;

  return (
    <>
    {crate > 0 ? (
      <group position={[base[0], base[1], base[2]]}>
        <mesh geometry={roundedBox(1.25 * s, crate, 1.0 * s, 0.03)} material={toyMat(str(p.crateColor, "#A0683F"), { felt: 33 })} position={[0, crate / 2, 0]} castShadow receiveShadow />
        {[-0.3, 0.3].map((dz) => (
          <mesh key={dz} geometry={BOX} material={toyMat("#7A4A2E", { felt: 34 })} position={[0, crate / 2, dz * s + (dz > 0 ? 0.21 : -0.21) * s]} scale={[1.27 * s, crate * 0.18, 0.02]} />
        ))}
      </group>
    ) : null}
    <group position={[x, y, z]} rotation={[0, rotY + yaw, 0]} scale={s}>
      <group rotation={[pitch, 0, roll]}>
        {/* legs */}
        {legs.map((lx, i) => {
          const side = lx < 0 ? -1 : 1;
          const swing = walking ? Math.sin(walkPhase + (i % 2) * Math.PI) * 0.35 : 0;
          return (
            <group key={i} position={[lx, LH, 0.0]} rotation={[swing, 0, side * splay * 0.26]}>
              <mesh geometry={roundedBox(0.12, LH + 0.04, 0.12, 0.015, 1)} material={bodyMat} position={[0, -LH / 2 + 0.02, 0]} castShadow />
            </group>
          );
        })}
        {/* squash pivot at the body's bottom */}
        <group position={[0, LH, 0]} scale={[sx, sy, sx]}>
          <group position={[0, -LH, 0]}>
            <mesh geometry={roundedBox(BW, BH, BD, 0.035, 2)} material={bodyMat} position={[0, LH + BH / 2, 0]} castShadow receiveShadow />
            <Band o={outfit} seed={seed} />
            <Eye x={-0.19} y={eyeY} sy={eyeSy} mood={mood} side={-1} />
            <Eye x={0.19} y={eyeY} sy={eyeSy} mood={mood} side={1} />
            <Brows mood={mood} y={eyeY} />
            <Glasses kind={outfit.glasses} y={eyeY} />
            {outfit.teeth ? (
              <group position={[0, LH + BH * 0.36, BD / 2 + 0.02]}>
                {Array.from({ length: 8 }).map((_, k) => (
                  <mesh key={k} geometry={SPHERE_LO} material={toyMat("#F7F4EC", { rough: 0.3, felt: false })} position={[(k - 3.5) * 0.065, 0, 0]} scale={0.06} />
                ))}
              </group>
            ) : null}
            <Hat o={outfit} seed={seed} />
          </group>
        </group>
        {/* floating cube hands */}
        <mesh geometry={roundedBox(0.16, 0.16, 0.16, 0.02, 1)} material={handMat} position={lh} castShadow />
        <mesh geometry={roundedBox(0.16, 0.16, 0.16, 0.02, 1)} material={handMat} position={rh} castShadow />
        {/* held props */}
        {hold === "phone" || action === "scroll" ? (
          <group position={[rh[0] - 0.14, rh[1] + 0.1, rh[2] + 0.06]} rotation={[-0.75 + (action === "scroll" ? Math.sin(lt * 3.2) * 0.14 : 0), 0.1, action === "scroll" ? Math.sin(lt * 2.1 + 1) * 0.1 : 0]}>
            <Phone t={t} glow={p.phoneGlow !== false} scroll={action === "scroll" ? lt : 0} seed={seed} />
          </group>
        ) : null}
        {hold === "paddle" || hold === "sign" ? (
          <group position={leftHold ? [lh[0], lh[1] + 0.1, lh[2]] : [rh[0], rh[1] + 0.1, rh[2]]} scale={1.55}>
            <Paddle text={str(p.paddle, "7")} color={str(p.paddleColor, "#2FA84F")} t={t} popAt={firstAt(events, "paddle", id) ?? firstAt(events, "act", id)} />
          </group>
        ) : null}
        {hold === "coffee" ? (
          <group position={[lh[0], lh[1] + 0.12, lh[2]]}>
            <Coffee />
          </group>
        ) : null}
        {hold === "magnifier" ? (
          <group position={[rh[0] - 0.05, rh[1] + 0.1, rh[2] + 0.05]}>
            <Magnifier />
          </group>
        ) : null}
        {hold === "pencil" ? (
          <group position={[rh[0] - 0.04, rh[1] + 0.06, rh[2] + 0.06]}>
            <Pencil />
          </group>
        ) : null}
        {hold === "bag" ? (
          <group position={[lh[0], lh[1] - 0.12, lh[2]]}>
            <ShoppingBag color={str(p.bagColor, "#F3D06B")} />
          </group>
        ) : null}
        {hold === "calculator" ? (
          <group position={[rh[0] - 0.1, rh[1] + 0.04, rh[2] + 0.04]} rotation={[-0.5, 0, 0]}>
            <Calculator />
          </group>
        ) : null}
      </group>
      {/* puffs: spawn / costume */}
      {enterAt !== undefined && enterFrom === "puff" ? <Puff k={(t - enterAt) / 0.45} seed={seed} /> : null}
      {costumeAt !== undefined ? <Puff k={(t - costumeAt + 0.08) / 0.45} seed={seed + 3} /> : null}
      {member.props?.glowAura ? <mesh geometry={SPHERE} material={glowMat("#FFB36B", 0.6, { transparent: true, opacity: 0.12 })} position={[0, 0.6, 0]} scale={[1.6, 1.3, 1.4]} /> : null}
    </group>
    </>
  );
};

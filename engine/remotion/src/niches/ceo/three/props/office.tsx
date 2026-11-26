/**
 * Office props built from primitives in the felt-toy style: desk, laptop (glowing screen with typed lines), monitor,
 * mug, office chair, wall clock, framed certificate, whiteboard, neon sign, potted plant. Pure functions of `t`.
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import { BOX, CYL, CYL_LO, SPHERE, box, roundedBox } from "../geo";
import { glowMat, toyMat } from "../materials";
import { canvasTexture, roundRect } from "../canvasTex";
import { FAMILY } from "../../ui/fonts";

type V3 = [number, number, number];

/** Desk: top + 4 legs (+ an optional modesty panel). Origin = floor under the top's centre. */
export const Desk: React.FC<{ w?: number; d?: number; h?: number; color?: string; legs?: string; panel?: boolean }> = ({ w = 2.2, d = 0.95, h = 0.6, color = "#B98A5E", legs = "#2E2A30", panel = true }) => (
  <group>
    <mesh geometry={roundedBox(w, 0.07, d, 0.02)} material={toyMat(color, { felt: 31 })} position={[0, h, 0]} castShadow receiveShadow />
    {[
      [-w / 2 + 0.08, -d / 2 + 0.08],
      [w / 2 - 0.08, -d / 2 + 0.08],
      [-w / 2 + 0.08, d / 2 - 0.08],
      [w / 2 - 0.08, d / 2 - 0.08],
    ].map(([x, z], i) => (
      <mesh key={i} geometry={BOX} material={toyMat(legs, { felt: 32 })} position={[x, h / 2, z]} scale={[0.06, h, 0.06]} castShadow />
    ))}
    {panel ? <mesh geometry={box(w - 0.2, h * 0.55, 0.04)} material={toyMat(color, { felt: 33 })} position={[0, h * 0.62, d / 2 - 0.1]} castShadow /> : null}
  </group>
);

const screenTex = (key: string, lines: string[], title: string, light: boolean, accent: string) =>
  canvasTexture(`scr:${key}`, 512, 320, (ctx, w, h) => {
    ctx.fillStyle = light ? "#F7F5EF" : "#16182A";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 46);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 26px "${FAMILY.ui}"`;
    ctx.fillText(title.slice(0, 28), 18, 32);
    ctx.font = `700 24px "${FAMILY.ui}"`;
    lines.slice(0, 6).forEach((l, i) => {
      ctx.fillStyle = light ? "#2A2830" : "#E8E6F0";
      ctx.fillText(l.slice(0, 30), 22, 88 + i * 40);
      ctx.fillStyle = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)";
      roundRect(ctx, 14, 62 + i * 40, w - 28, 34, 6);
      ctx.fill();
    });
  });

/** Laptop: base + screen hinged open. `facing` = +1 screen faces +z (towards the camera), -1 faces -z (towards the cast). */
export const Laptop: React.FC<{ lines?: string[]; title?: string; light?: boolean; accent?: string; facing?: 1 | -1; glow?: number; logo?: string }> = ({
  lines = ["INBOX (0)", "CALENDAR: FREE", "REVENUE: 0"],
  title = "DASHBOARD",
  light = false,
  accent = "#3C6FE0",
  facing = -1,
  glow = 1.1,
  logo = "DIO",
}) => {
  const tex = screenTex(`${title}|${lines.join("/")}|${light}|${accent}`, lines, title, light, accent);
  const scr = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  scr.color.setScalar(glow);
  const logoTex = canvasTexture(`logo:${logo}`, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#C9CDD6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3A3E48";
    ctx.font = `900 64px "${FAMILY.title}"`;
    ctx.textAlign = "center";
    ctx.fillText(logo, w / 2, h / 2 + 22);
  });
  const lw = 0.62;
  const lh = 0.4;
  return (
    <group rotation={[0, facing === 1 ? Math.PI : 0, 0]}>
      <mesh geometry={roundedBox(lw, 0.03, 0.42, 0.01)} material={toyMat("#9AA0AC", { felt: 41, rough: 0.5 })} position={[0, 0.015, 0]} castShadow />
      <group position={[0, 0.03, 0.2]} rotation={[0.28, 0, 0]}>
        <mesh geometry={roundedBox(lw, lh, 0.025, 0.01)} material={toyMat("#9AA0AC", { felt: 42, rough: 0.5 })} position={[0, lh / 2, 0]} castShadow />
        <mesh geometry={BOX} material={scr} position={[0, lh / 2 + 0.01, -0.014]} scale={[lw - 0.05, lh - 0.06, 0.002]} rotation={[0, Math.PI, 0]} />
        <mesh geometry={BOX} material={toyMat("#FFFFFF", { map: logoTex, felt: false, rough: 0.6 })} position={[0, lh / 2 + 0.02, 0.014]} scale={[0.2, 0.1, 0.002]} />
      </group>
    </group>
  );
};

export const Mug: React.FC<{ color?: string; steam?: number; t?: number }> = ({ color = "#E9E2D2", steam = 0, t = 0 }) => (
  <group>
    <mesh geometry={CYL} material={toyMat(color, { felt: 43 })} position={[0, 0.07, 0]} scale={[0.11, 0.14, 0.11]} castShadow />
    <mesh geometry={CYL_LO} material={toyMat("#3A2418", { felt: false })} position={[0, 0.139, 0]} scale={[0.09, 0.005, 0.09]} />
    {steam > 0
      ? [0, 1, 2].map((i) => {
          const k = ((t * 0.6 + i / 3) % 1 + 1) % 1;
          return <mesh key={i} geometry={SPHERE} material={toyMat("#FFFFFF", { transparent: true, opacity: 0.35 * (1 - k) * steam, felt: false })} position={[Math.sin(t * 2 + i) * 0.02, 0.18 + k * 0.25, 0]} scale={0.04 + k * 0.05} />;
        })
      : null}
  </group>
);

/** Office chair: seat, back, column, star base. */
export const OfficeChair: React.FC<{ color?: string }> = ({ color = "#2B2E3A" }) => (
  <group>
    <mesh geometry={roundedBox(0.62, 0.1, 0.6, 0.04)} material={toyMat(color, { felt: 51 })} position={[0, 0.36, 0]} castShadow />
    <mesh geometry={roundedBox(0.6, 0.62, 0.1, 0.04)} material={toyMat(color, { felt: 52 })} position={[0, 0.72, -0.27]} castShadow />
    <mesh geometry={CYL_LO} material={toyMat("#1C1D22", { felt: false, rough: 0.4 })} position={[0, 0.18, 0]} scale={[0.06, 0.32, 0.06]} />
    {[0, 1, 2, 3, 4].map((i) => (
      <mesh key={i} geometry={BOX} material={toyMat("#1C1D22", { felt: false })} position={[Math.sin((i * 2 * Math.PI) / 5) * 0.16, 0.03, Math.cos((i * 2 * Math.PI) / 5) * 0.16]} rotation={[0, (i * 2 * Math.PI) / 5, 0]} scale={[0.05, 0.04, 0.34]} />
    ))}
  </group>
);

/** Wall clock whose hands turn with t (fast: a sped-up day). */
export const WallClock: React.FC<{ t: number; r?: number; speed?: number }> = ({ t, r = 0.32, speed = 0.4 }) => (
  <group>
    <mesh geometry={CYL} material={toyMat("#F4EFE3", { felt: 61 })} rotation={[Math.PI / 2, 0, 0]} scale={[r * 2, 0.06, r * 2]} castShadow />
    <mesh geometry={CYL} material={toyMat("#2A2A30", { felt: false })} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.005]} scale={[r * 2.15, 0.05, r * 2.15]} />
    <group position={[0, 0, 0.04]} rotation={[0, 0, -t * speed]}>
      <mesh geometry={BOX} material={toyMat("#1A1A1E", { felt: false })} position={[0, r * 0.35, 0]} scale={[0.03, r * 0.7, 0.01]} />
    </group>
    <group position={[0, 0, 0.045]} rotation={[0, 0, -t * speed * 12]}>
      <mesh geometry={BOX} material={toyMat("#C9302C", { felt: false })} position={[0, r * 0.42, 0]} scale={[0.02, r * 0.84, 0.01]} />
    </group>
  </group>
);

/** A framed sign / certificate / poster with hand-lettered text (e.g. "CEO OF THE MONTH"). */
export const FramedSign: React.FC<{ text: string; sub?: string; w?: number; h?: number; bg?: string; ink?: string; frame?: string }> = ({ text, sub, w = 0.9, h = 0.65, bg = "#F6EFD9", ink = "#2A2622", frame = "#7A5232" }) => {
  const tex = canvasTexture(`sign:${text}|${sub ?? ""}|${bg}|${ink}`, 512, Math.round((512 * h) / w), (ctx, cw, ch) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, cw - 36, ch - 36);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    const words = text.split(" ");
    const linesOut: string[] = [];
    let cur = "";
    ctx.font = `900 64px "${FAMILY.title}"`;
    for (const wd of words) {
      const test = cur ? `${cur} ${wd}` : wd;
      if (ctx.measureText(test).width > cw - 80 && cur) {
        linesOut.push(cur);
        cur = wd;
      } else cur = test;
    }
    if (cur) linesOut.push(cur);
    const size = Math.min(64, (ch - (sub ? 120 : 70)) / Math.max(1, linesOut.length) / 1.1);
    ctx.font = `900 ${size}px "${FAMILY.title}"`;
    const top = ch / 2 - ((linesOut.length - 1) * size * 1.1) / 2 - (sub ? 20 : 0);
    linesOut.forEach((l, i) => ctx.fillText(l, cw / 2, top + i * size * 1.1 + size * 0.35));
    if (sub) {
      ctx.font = `700 30px "${FAMILY.ui}"`;
      ctx.fillText(sub, cw / 2, ch - 50);
    }
  });
  return (
    <group>
      <mesh geometry={roundedBox(w + 0.08, h + 0.08, 0.05, 0.015)} material={toyMat(frame, { felt: 71 })} position={[0, 0, -0.02]} castShadow />
      <mesh geometry={BOX} material={toyMat("#FFFFFF", { map: tex, felt: false, rough: 0.8 })} position={[0, 0, 0.01]} scale={[w, h, 0.005]} />
    </group>
  );
};

/** A big wall screen / whiteboard chart: a bar chart drawn on a canvas, bars rise with `k` (0..1). */
export const ChartBoard: React.FC<{ w?: number; h?: number; title?: string; bars?: number[]; k?: number; down?: boolean; glow?: number }> = ({ w = 2.6, h = 1.5, title = "REVENUE", bars = [3, 5, 4, 7, 2, 0], k = 1, down = true, glow = 1.05 }) => {
  const kk = Math.round(k * 20) / 20;
  const tex = canvasTexture(`chart:${title}|${bars.join(",")}|${kk}|${down}`, 768, Math.round((768 * h) / w), (ctx, cw, ch) => {
    ctx.fillStyle = "#F8F6F0";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#24304E";
    ctx.font = `900 48px "${FAMILY.title}"`;
    ctx.fillText(title, 36, 64);
    const n = bars.length;
    const max = Math.max(1, ...bars);
    const bw = (cw - 120) / n;
    bars.forEach((b, i) => {
      const bh = ((ch - 150) * b) / max;
      ctx.fillStyle = i === n - 1 && down ? "#D9402F" : "#3C6FE0";
      ctx.fillRect(70 + i * bw + bw * 0.15, ch - 50 - bh * kk, bw * 0.7, bh * kk);
    });
    ctx.strokeStyle = "#24304E";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(60, 90);
    ctx.lineTo(60, ch - 48);
    ctx.lineTo(cw - 40, ch - 48);
    ctx.stroke();
    if (down && kk >= 1) {
      ctx.strokeStyle = "#D9402F";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(90, 120);
      ctx.lineTo(cw * 0.55, ch * 0.45);
      ctx.lineTo(cw - 70, ch - 70);
      ctx.stroke();
    }
  });
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  mat.color.setScalar(glow);
  return (
    <group>
      <mesh geometry={roundedBox(w + 0.14, h + 0.14, 0.08, 0.03)} material={toyMat("#2A2C36", { felt: 81 })} position={[0, 0, -0.05]} castShadow />
      <mesh geometry={BOX} material={mat} position={[0, 0, 0.002]} scale={[w, h, 0.002]} />
    </group>
  );
};

/** Pot + round foliage blobs. */
export const Plant: React.FC<{ s?: number; pot?: string; leaf?: string; seed?: number }> = ({ s = 1, pot = "#C96F4A", leaf = "#4E9A5A", seed = 1 }) => (
  <group scale={s}>
    <mesh geometry={CYL} material={toyMat(pot, { felt: 91 })} position={[0, 0.16, 0]} scale={[0.32, 0.32, 0.32]} castShadow />
    {[0, 1, 2, 3, 4].map((i) => (
      <mesh
        key={i}
        geometry={SPHERE}
        material={toyMat(leaf, { felt: 92 + ((seed + i) % 3) })}
        position={[Math.sin(i * 1.3 + seed) * 0.13, 0.42 + (i % 3) * 0.12, Math.cos(i * 1.7 + seed) * 0.1]}
        scale={0.24 - (i % 3) * 0.03}
        castShadow
      />
    ))}
  </group>
);

/** Window light shafts: soft additive planes slanting in from a window (golden / morning only). */
export const LightShafts: React.FC<{ from: V3; n?: number; color?: string; strength?: number; t: number }> = ({ from, n = 4, color = "#FFD9A0", strength = 0.18, t }) => (
  <group position={from}>
    {Array.from({ length: n }).map((_, i) => (
      <mesh
        key={i}
        geometry={BOX}
        material={glowMat(color, strength * (0.8 + 0.2 * Math.sin(t * 0.7 + i)), { transparent: true, opacity: 0.22 })}
        position={[i * 0.55 - (n - 1) * 0.27, -1.1, 1.6]}
        rotation={[0.85, 0, 0.12]}
        scale={[0.32, 4.2, 0.01]}
      />
    ))}
  </group>
);

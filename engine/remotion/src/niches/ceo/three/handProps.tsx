/**
 * Small props a cast member holds in its cube hand: phone (glowing, scrolling mobile page), score paddle, coffee, magnifier,
 * pencil, shopping bag, calculator. Units: body width = 1.
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import { FAMILY } from "../ui/fonts";
import { BOX, CYL, CYL_LO, CIRCLE, CONE, roundedBox, torus } from "./geo";
import { glowMat, toyMat } from "./materials";
import { canvasTexture, roundRect } from "./canvasTex";

/** The mobile version of the roasted landing page (tall strip, scrolled by texture offset). */
export const mobilePageTexture = () =>
  canvasTexture("mobile-page", 256, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#FBFAF7";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1F2A44";
    ctx.fillRect(0, 0, w, 54);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 22px "${FAMILY.ui}"`;
    ctx.fillText("YourApp", 16, 35);
    const block = (y: number, hh: number, col: string, x = 16, ww = w - 32, r = 6) => {
      ctx.fillStyle = col;
      roundRect(ctx, x, y, ww, hh, r);
      ctx.fill();
    };
    ctx.fillStyle = "#1A1A1A";
    ctx.font = `800 30px "${FAMILY.ui}"`;
    ["Next-gen", "synergy for", "modern teams"].forEach((l, i) => ctx.fillText(l, 16, 110 + i * 36));
    block(212, 10, "#C9C6BF", 16, 200);
    block(230, 10, "#C9C6BF", 16, 170);
    block(262, 40, "#B9B6AE", 16, 110, 8);
    block(330, 170, "#E9C9F2");
    block(350, 60, "#B48BE0", 40, 120, 30);
    for (let i = 0; i < 6; i++) block(530 + i * 70, 50, i % 2 ? "#EFEDE7" : "#E4E1D9");
    block(960, 30, "#D9D6CF", 16, 120);
  });

export const Phone: React.FC<{ t: number; glow?: boolean; scroll?: number; seed?: number }> = ({ glow = true, scroll = 0, seed = 0 }) => {
  const tex = useMemo(() => {
    const base = mobilePageTexture();
    const c = base.clone();
    c.wrapS = THREE.ClampToEdgeWrapping;
    c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(1, 0.42);
    c.needsUpdate = true;
    return c;
  }, []);
  // scroll down in steps (thumb flicks) — pure function of the scroll time
  const flick = Math.floor(scroll / 0.45);
  const within = Math.min(1, (scroll % 0.45) / 0.18);
  const pos = (flick + within) * 0.07 + (seed % 7) * 0.03;
  tex.offset.set(0, 1 - 0.42 - (pos % 0.58));
  const screen = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }), [tex]);
  return (
    <group>
      <mesh geometry={roundedBox(0.24, 0.44, 0.035, 0.03, 2)} material={toyMat("#1B1B22", { rough: 0.4, felt: false })} castShadow />
      <mesh geometry={BOX} material={glow ? screen : toyMat("#2A2E3A", { felt: false })} position={[0, 0, 0.019]} scale={[0.21, 0.4, 0.001]} />
    </group>
  );
};

const paddleTexture = (text: string, color: string) =>
  canvasTexture(`paddle:${text}:${color}`, 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#F4ECDA";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    const fs = text.length > 2 ? 92 : 130;
    ctx.font = `900 ${fs}px "${FAMILY.title}"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 8);
  });

/** Lollipop score paddle. Pops 0→1.08→1 at popAt. */
export const Paddle: React.FC<{ text: string; color: string; t: number; popAt?: number }> = ({ text, color, t, popAt }) => {
  const tex = paddleTexture(text, color);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, alphaTest: 0.5 }), [tex]);
  let s = 1;
  if (popAt !== undefined) {
    const k = (t - popAt) / 0.24;
    s = k < 0 ? 0.001 : k >= 1 ? 1 : 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
  }
  return (
    <group scale={Math.max(0.001, s)}>
      <mesh geometry={CYL_LO} material={toyMat("#B88A5A", { felt: 3 })} position={[0, 0.1, 0]} scale={[0.035, 0.5, 0.035]} castShadow />
      <mesh geometry={CIRCLE} material={mat} position={[0, 0.52, 0.03]} scale={0.5} castShadow />
      <mesh geometry={CIRCLE} material={toyMat("#E9DFC8", { felt: 2 })} position={[0, 0.52, 0.025]} rotation={[0, Math.PI, 0]} scale={0.5} />
    </group>
  );
};

export const Coffee: React.FC = () => (
  <group>
    <mesh geometry={CYL} material={toyMat("#F4F1EA", { felt: 4 })} scale={[0.13, 0.2, 0.13]} castShadow />
    <mesh geometry={CYL} material={toyMat("#6B4A33", { felt: 4 })} position={[0, 0.11, 0]} scale={[0.14, 0.03, 0.14]} />
    <mesh geometry={CYL} material={toyMat("#C98A55", { felt: 4 })} position={[0, -0.01, 0]} scale={[0.135, 0.07, 0.135]} />
  </group>
);

export const Magnifier: React.FC = () => (
  <group rotation={[0, 0, -0.5]}>
    <mesh geometry={torus(0.17, 0.035, Math.PI * 2, 10, 32)} material={toyMat("#E2B43C", { rough: 0.35, metal: 0.3, felt: false })} position={[0, 0.18, 0]} />
    <mesh geometry={CIRCLE} material={toyMat("#9CD3F2", { rough: 0.1, transparent: true, opacity: 0.55, felt: false })} position={[0, 0.18, 0]} scale={0.34} />
    <mesh geometry={CYL_LO} material={toyMat("#7A4A2E", { felt: 3 })} position={[0, -0.08, 0]} scale={[0.05, 0.22, 0.05]} />
  </group>
);

export const Pencil: React.FC = () => (
  <group rotation={[0.3, 0, -0.6]}>
    <mesh geometry={BOX} material={toyMat("#F2C541", { felt: 5 })} scale={[0.06, 0.38, 0.06]} castShadow />
    <mesh geometry={CONE} material={toyMat("#E9CFA4", { felt: 5 })} position={[0, -0.23, 0]} rotation={[Math.PI, 0, 0]} scale={[0.07, 0.09, 0.07]} />
    <mesh geometry={BOX} material={toyMat("#F49AB0", { felt: 5 })} position={[0, 0.22, 0]} scale={[0.065, 0.06, 0.065]} />
  </group>
);

export const ShoppingBag: React.FC<{ color?: string }> = ({ color = "#F3D06B" }) => (
  <group>
    <mesh geometry={roundedBox(0.34, 0.36, 0.16, 0.015)} material={toyMat(color, { felt: 6 })} castShadow />
    <mesh geometry={torus(0.09, 0.015, Math.PI, 6, 16)} material={toyMat("#3A2A22", { felt: false })} position={[0, 0.18, 0]} />
    <mesh geometry={CIRCLE} material={toyMat("#E0704F", { felt: false })} position={[0, 0.02, 0.081]} scale={0.14} />
  </group>
);

export const Calculator: React.FC = () => (
  <group>
    <mesh geometry={roundedBox(0.26, 0.36, 0.05, 0.02)} material={toyMat("#3C4048", { felt: 7 })} castShadow />
    <mesh geometry={BOX} material={glowMat("#BFE8C3", 1.1)} position={[0, 0.11, 0.027]} scale={[0.2, 0.07, 0.002]} />
    {Array.from({ length: 9 }).map((_, i) => (
      <mesh key={i} geometry={BOX} material={toyMat(i === 8 ? "#E0704F" : "#E9E5DC", { felt: false })} position={[-0.07 + (i % 3) * 0.07, 0.02 - Math.floor(i / 3) * 0.065, 0.028]} scale={[0.05, 0.045, 0.01]} />
    ))}
  </group>
);

const coinFace = () =>
  canvasTexture("coin-face", 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.4, h * 0.35, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, "#FFE38A");
    g.addColorStop(1, "#D99A1E");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#B7790F";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#B7790F";
    ctx.font = `900 150px "${FAMILY.title}"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", w / 2, h / 2 + 8);
  });

export const Coin: React.FC = () => {
  const face = useMemo(() => new THREE.MeshStandardMaterial({ map: coinFace(), roughness: 0.35, metalness: 0.35 }), []);
  return (
    <group>
      <mesh geometry={CYL} material={toyMat("#C98F1E", { rough: 0.35, metal: 0.5, felt: false })} rotation={[Math.PI / 2, 0, 0]} scale={[0.3, 0.05, 0.3]} castShadow />
      <mesh geometry={CIRCLE} material={face} position={[0, 0, 0.0255]} scale={0.3} />
      <mesh geometry={CIRCLE} material={face} position={[0, 0, -0.0255]} rotation={[0, Math.PI, 0]} scale={0.3} />
    </group>
  );
};

/**
 * Canvas textures for text and UI inside the 3D world (landing page, neon words, number plates, paddles, price tags).
 * Drawn with the niche fonts — the Stage only mounts the canvas after `fontsReady` resolved, so glyphs are always right.
 * Static textures are cached by key; animated ones use `useCanvasTexture` and redraw only when their content key changes.
 */
import { useMemo } from "react";
import * as THREE from "three";

export type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const cache = new Map<string, THREE.CanvasTexture>();

const make = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return { c, tex };
};

/** A cached static canvas texture. */
export const canvasTexture = (key: string, w: number, h: number, draw: Draw) => {
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, tex } = make(w, h);
  const ctx = c.getContext("2d")!;
  draw(ctx, w, h);
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
};

/** An animated canvas texture owned by one component; redraws when `contentKey` changes. */
export const useCanvasTexture = (w: number, h: number, draw: Draw, contentKey: string) => {
  const st = useMemo(() => ({ ...make(w, h), key: "" }), [w, h]);
  if (st.key !== contentKey) {
    const ctx = st.c.getContext("2d")!;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    ctx.restore();
    st.tex.needsUpdate = true;
    st.key = contentKey;
  }
  return st.tex;
};

export const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

/** Draws a 5-point star centred at (cx, cy). */
export const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

/** Wraps text into lines that fit maxW (canvas font must be set). */
export const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
};

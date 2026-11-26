/**
 * Procedural, deterministic canvas textures (seeded mulberry32 — never Math.random).
 * The reference toys look like matte felt / construction paper: a fine luminance noise (2–4 %) on every surface,
 * mottled blotches on walls, speckled "granite" on dark hats, plank lines on floors. All textures are cached per key.
 */
import * as THREE from "three";

export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const cache = new Map<string, THREE.Texture>();

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const finish = (canvas: HTMLCanvasElement, repeat: [number, number] = [1, 1], srgb = true) => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
};

/** Smooth value-noise blotches: tiny random grid scaled up with bilinear smoothing, several octaves. */
const blotches = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, octaves: Array<[number, number]>, dark: string, light: string) => {
  for (const [cells, alpha] of octaves) {
    const g = makeCanvas(cells, Math.max(2, Math.round((cells * h) / w)));
    const gx = g.getContext("2d")!;
    const img = gx.createImageData(g.width, g.height);
    for (let i = 0; i < g.width * g.height; i++) {
      const v = rnd();
      const [r, gg, b] = hexToRgb(v > 0.5 ? light : dark);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 255);
    }
    gx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(g, 0, 0, w, h);
    ctx.restore();
  }
};

/** Per-pixel fine grain (multiplicative-looking) added in place. */
const grain = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, amp: number) => {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 2 * amp;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
};

/**
 * Near-white felt map to multiply with a material colour: mean ≈ 243, fine grain ±amp, soft blotches.
 * Use as `map` on toys so every flat colour gets the paper/felt texture of the references.
 */
export const feltMap = (seed = 1, amp = 4, size = 256) => {
  const key = `felt:${seed}:${amp}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f6f6f6";
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed * 7919 + 13);
  blotches(ctx, size, size, rnd, [[6, 0.1], [14, 0.08], [40, 0.06]], "#d8d8d8", "#ffffff");
  grain(ctx, size, size, rnd, amp);
  const tex = finish(c);
  cache.set(key, tex);
  return tex;
};

/** A coloured mottled wall (felt / plaster): base colour with darker + lighter blotches and grain. */
export const mottled = (base: string, dark: string, light: string, seed = 1, size = 512, strength = 1) => {
  const key = `mottled:${base}:${dark}:${light}:${seed}:${size}:${strength}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed * 104729 + 7);
  blotches(ctx, size, size, rnd, [[5, 0.2 * strength], [12, 0.22 * strength], [32, 0.22 * strength], [90, 0.12 * strength]], dark, light);
  grain(ctx, size, size, rnd, 3);
  const tex = finish(c);
  cache.set(key, tex);
  return tex;
};

/** Speckled "granite" felt (dark hats, carpets): base + small light/dark specks. */
export const speckle = (base: string, fleck: string, density = 0.06, seed = 1, size = 256) => {
  const key = `speckle:${base}:${fleck}:${density}:${seed}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed * 15485863 + 3);
  blotches(ctx, size, size, rnd, [[8, 0.2], [24, 0.15]], "#000000", "#ffffff");
  const n = Math.round(size * size * density * 0.08);
  ctx.fillStyle = fleck;
  for (let i = 0; i < n; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 0.6 + rnd() * 1.6;
    ctx.globalAlpha = 0.35 + rnd() * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  grain(ctx, size, size, rnd, 4);
  const tex = finish(c);
  cache.set(key, tex);
  return tex;
};

/** Wooden planks running along U: alternating tones, dark seams, grain streaks. `planks` per texture height. */
export const planks = (base: string, dark: string, light: string, seam: string, planksN = 6, seed = 1, size = 512) => {
  const key = `planks:${base}:${dark}:${light}:${seam}:${planksN}:${seed}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  const rnd = mulberry32(seed * 2654435761 + 11);
  const ph = size / planksN;
  for (let i = 0; i < planksN; i++) {
    const y = i * ph;
    // each row holds 2 plank segments with a butt joint at a random x
    const joint = rnd() * size;
    const tones = [rnd(), rnd()];
    [[0, joint], [joint, size]].forEach(([x0, x1], k) => {
      const tt = tones[k];
      ctx.fillStyle = tt < 0.33 ? dark : tt > 0.66 ? light : base;
      ctx.fillRect(x0, y, x1 - x0, ph);
    });
    // grain streaks
    for (let s = 0; s < 10; s++) {
      ctx.strokeStyle = rnd() > 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1 + rnd() * 2;
      const yy = y + 3 + rnd() * (ph - 6);
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(size * 0.3, yy + (rnd() - 0.5) * 6, size * 0.6, yy + (rnd() - 0.5) * 6, size, yy + (rnd() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = seam;
    ctx.fillRect(0, y, size, Math.max(2, ph * 0.04));
    ctx.fillRect(joint - 1.5, y, 3, ph);
  }
  grain(ctx, size, size, rnd, 3);
  const tex = finish(c);
  cache.set(key, tex);
  return tex;
};

/** Square tiles with grout (shop floor variant / sidewalk). */
export const tiles = (base: string, alt: string, grout: string, n = 4, seed = 1, size = 512, checker = false) => {
  const key = `tiles:${base}:${alt}:${grout}:${n}:${seed}:${size}:${checker}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  const rnd = mulberry32(seed * 31337 + 5);
  const s = size / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = checker ? ((i + j) % 2 ? alt : base) : rnd() > 0.5 ? alt : base;
      ctx.fillRect(i * s, j * s, s, s);
    }
  blotches(ctx, size, size, rnd, [[10, 0.12], [30, 0.1]], "#000000", "#ffffff");
  ctx.fillStyle = grout;
  for (let i = 0; i <= n; i++) {
    ctx.fillRect(i * s - 2, 0, 4, size);
    ctx.fillRect(0, i * s - 2, size, 4);
  }
  grain(ctx, size, size, rnd, 4);
  const tex = finish(c);
  cache.set(key, tex);
  return tex;
};

/** Vertical velvet folds (curtains): light/dark bands with soft gradients. */
export const velvet = (base: string, dark: string, light: string, folds = 8, seed = 1, size = 512) => {
  const key = `velvet:${base}:${dark}:${light}:${folds}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  const rnd = mulberry32(seed * 7 + 99);
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  for (let i = 0; i <= folds * 2; i++) {
    const k = i / (folds * 2);
    const jitter = (rnd() - 0.5) * 0.02;
    grad.addColorStop(Math.min(1, Math.max(0, k + jitter)), i % 2 === 0 ? dark : i % 4 === 1 ? light : base);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, size, rnd, 6);
  const tex = finish(c);
  cache.set(key, tex);
  return tex;
};

/** A soft round sprite (dust motes, bulbs halo). */
export const softDot = () => {
  const key = "softdot";
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(64, 64);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = finish(c, [1, 1], false);
  cache.set(key, tex);
  return tex;
};

/** Clone a cached texture with its own repeat (so walls of different sizes keep the same texel density). */
export const withRepeat = (tex: THREE.Texture, rx: number, ry: number) => {
  const key = `${tex.uuid}:rep:${rx.toFixed(3)}:${ry.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
};

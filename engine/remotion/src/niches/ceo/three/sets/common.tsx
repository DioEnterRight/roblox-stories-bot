/**
 * Shared set pieces: floors, walls, the light rig per mood, and the painted outside (sky + skyline) seen through windows.
 * Every set renders for one `mood` (time of day / weather) chosen per video, so the same room never looks the same twice.
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import { hash01 } from "../../../../core/timeline";
import { box, BOX } from "../geo";
import { toyMat } from "../materials";
import { canvasTexture } from "../canvasTex";
import { mottled, planks, tiles, withRepeat } from "../tex";

export type Mood = "golden" | "night" | "morning" | "rain" | "evening";
export const MOODS: Mood[] = ["golden", "night", "morning", "rain", "evening"];
export const asMood = (m: unknown, d: Mood = "golden"): Mood => (typeof m === "string" && (MOODS as string[]).includes(m) ? (m as Mood) : d);

export const Floor: React.FC<{ w: number; d: number; kind: "planks" | "tiles" | "checker" | "sidewalk" | "carpet"; y?: number; tone?: string; z?: number }> = ({ w, d, kind, y = 0, tone, z = 0 }) => {
  let tex: THREE.Texture;
  if (kind === "planks") tex = withRepeat(planks(tone ?? "#7A5A44", "#634634", "#8C6A50", "#3E2A20", 6, 3), w / 4, d / 4);
  else if (kind === "checker") tex = withRepeat(tiles(tone ?? "#E9E2D2", "#3A3440", "#2A262E", 2, 5, 256, true), w / 1.6, d / 1.6);
  else if (kind === "sidewalk") tex = withRepeat(tiles(tone ?? "#8C8A86", "#96948F", "#6C6A66", 2, 7, 256), w / 2.2, d / 2.2);
  else if (kind === "carpet") tex = withRepeat(mottled(tone ?? "#3B4A66", "#2E3A52", "#465878", 77, 256, 0.6), w / 3, d / 3);
  else tex = withRepeat(tiles(tone ?? "#8A8376", "#958E80", "#6E685D", 3, 9, 384), w / 2.5, d / 2.5);
  return <mesh geometry={box(w, 0.1, d)} material={toyMat("#FFFFFF", { map: tex, rough: 0.92 })} position={[0, y - 0.05, z]} receiveShadow />;
};

export const Wall: React.FC<{ w: number; h: number; color: string; dark?: string; light?: string; seed?: number; depth?: number; strength?: number }> = ({ w, h, color, dark, light, seed = 1, depth = 0.2, strength = 1 }) => {
  const c = new THREE.Color(color);
  const d = dark ?? `#${c.clone().multiplyScalar(0.8).getHexString()}`;
  const l = light ?? `#${c.clone().lerp(new THREE.Color("#FFFFFF"), 0.14).getHexString()}`;
  const tex = withRepeat(mottled(color, d, l, seed, 512, strength), w / 5, h / 5);
  return <mesh geometry={box(w, h, depth)} material={toyMat("#FFFFFF", { map: tex, rough: 0.95 })} receiveShadow castShadow />;
};

/** A wall along X with a rectangular window hole (centre x0..x1, y0..y1), built from four slabs + a frame with mullions. */
export const WindowWall: React.FC<{ w: number; h: number; z: number; hole: [number, number, number, number]; color: string; frame?: string; seed?: number; mullions?: number }> = ({
  w,
  h,
  z,
  hole,
  color,
  frame = "#EDE6D6",
  seed = 1,
  mullions = 2,
}) => {
  const [x0, x1, y0, y1] = hole;
  const left = -w / 2;
  const right = w / 2;
  const pieces: [number, number, number, number][] = [
    [(left + x0) / 2, h / 2, x0 - left, h],
    [(x1 + right) / 2, h / 2, right - x1, h],
    [(x0 + x1) / 2, (y1 + h) / 2, x1 - x0, h - y1],
    [(x0 + x1) / 2, y0 / 2, x1 - x0, y0],
  ];
  const fw = 0.1;
  const bars: [number, number, number, number][] = [
    [(x0 + x1) / 2, y1, x1 - x0 + fw, fw],
    [(x0 + x1) / 2, y0, x1 - x0 + fw, fw * 1.6],
    [x0, (y0 + y1) / 2, fw, y1 - y0],
    [x1, (y0 + y1) / 2, fw, y1 - y0],
  ];
  for (let i = 1; i <= mullions; i++) bars.push([x0 + ((x1 - x0) * i) / (mullions + 1), (y0 + y1) / 2, fw * 0.6, y1 - y0]);
  bars.push([(x0 + x1) / 2, y0 + (y1 - y0) * 0.62, x1 - x0, fw * 0.6]);
  return (
    <group position={[0, 0, z]}>
      {pieces.map(([x, y, pw, ph], i) =>
        pw > 0.01 && ph > 0.01 ? (
          <group key={i} position={[x, y, 0]}>
            <Wall w={pw} h={ph} color={color} seed={seed + i} />
          </group>
        ) : null,
      )}
      {bars.map(([x, y, bw, bh], i) => (
        <mesh key={`b${i}`} geometry={box(bw, bh, 0.16)} material={toyMat(frame, { felt: 140 + i })} position={[x, y, 0.05]} castShadow />
      ))}
    </group>
  );
};

type LightSpec = { hemiSky: string; hemiGround: string; hemi: number; key: number; keyColor: string; keyDir: [number, number, number]; fill: number; fillColor: string; rim: number; rimColor: string };

/** Light rig per mood. Key direction is relative to the focus point (behind + above = backlit window light). */
export const LIGHTS: Record<Mood, LightSpec> = {
  golden: { hemiSky: "#FFD9B0", hemiGround: "#5A3A2E", hemi: 1.5, key: 6.4, keyColor: "#FFB070", keyDir: [3.5, 4.5, -7], fill: 2.2, fillColor: "#8FA8E0", rim: 2.6, rimColor: "#FFC48A" },
  evening: { hemiSky: "#E7A98C", hemiGround: "#3A2630", hemi: 1.2, key: 4.4, keyColor: "#FF9A6A", keyDir: [-4, 3.5, -6], fill: 1.8, fillColor: "#7C8BD8", rim: 2.0, rimColor: "#FF8F70" },
  morning: { hemiSky: "#DDEBFF", hemiGround: "#6A5A4C", hemi: 2.0, key: 6.8, keyColor: "#FFF2DE", keyDir: [4, 7.5, 6], fill: 2.6, fillColor: "#A8C4F0", rim: 1.6, rimColor: "#E8F0FF" },
  rain: { hemiSky: "#9DB0C8", hemiGround: "#2E3036", hemi: 1.5, key: 3.0, keyColor: "#C8D6EE", keyDir: [2, 6, 5], fill: 2.0, fillColor: "#6D86B8", rim: 1.4, rimColor: "#AFC4E6" },
  night: { hemiSky: "#7E9AD0", hemiGround: "#1E1A24", hemi: 1.0, key: 3.2, keyColor: "#FFD2B0", keyDir: [4, 7.5, 8], fill: 1.5, fillColor: "#6A96D8", rim: 1.8, rimColor: "#86A8E0" },
};

export const Lights: React.FC<{ mood: Mood; focus: [number, number, number]; shadowSize?: number; scale?: number }> = ({ mood, focus, shadowSize = 7, scale = 1 }) => {
  const L = LIGHTS[mood];
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.set(focus[0], focus[1], focus[2]);
  target.updateMatrixWorld();
  return (
    <>
      <hemisphereLight args={[L.hemiSky, L.hemiGround, L.hemi * scale]} />
      <primitive object={target} />
      <directionalLight
        position={[focus[0] + L.keyDir[0], focus[1] + L.keyDir[1], focus[2] + L.keyDir[2]]}
        target={target}
        intensity={L.key * scale}
        color={L.keyColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={3}
        shadow-camera-left={-shadowSize}
        shadow-camera-right={shadowSize}
        shadow-camera-top={shadowSize}
        shadow-camera-bottom={-shadowSize}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
      />
      <directionalLight position={[focus[0] - 6, focus[1] + 3, focus[2] + 6]} intensity={L.fill * scale} color={L.fillColor} />
      <directionalLight position={[focus[0] - 1, focus[1] + 5, focus[2] - 8]} intensity={L.rim * scale} color={L.rimColor} />
    </>
  );
};

const SKY: Record<Mood, [string, string, string]> = {
  golden: ["#FFC27A", "#FF8A5C", "#6B4A8C"],
  evening: ["#F4A3A0", "#B56BA8", "#2F2A66"],
  morning: ["#EAF5FF", "#B7DBFF", "#7FB6F0"],
  rain: ["#9AA6B4", "#7D8A9A", "#5C6676"],
  night: ["#2A3570", "#141C48", "#080B22"],
};

/** Painted outside: sky gradient, sun / moon, a skyline of seeded blocks with lit windows. One texture per mood + seed. */
export const outsideTexture = (mood: Mood, seed: number) =>
  canvasTexture(`outside:${mood}:${seed}`, 1024, 640, (ctx, w, h) => {
    const [top, mid, low] = SKY[mood];
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, low);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, top);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (mood === "golden" || mood === "evening") {
      const sx = w * (0.3 + hash01(`sun${seed}`) * 0.4);
      const sy = h * 0.62;
      const rg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 260);
      rg.addColorStop(0, mood === "golden" ? "rgba(255,246,210,1)" : "rgba(255,210,200,0.9)");
      rg.addColorStop(0.25, "rgba(255,200,140,0.55)");
      rg.addColorStop(1, "rgba(255,160,100,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
    if (mood === "night") {
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + hash01(`st${seed}${i}`) * 0.6})`;
        ctx.fillRect(hash01(`sx${seed}${i}`) * w, hash01(`sy${seed}${i}`) * h * 0.5, 2, 2);
      }
      ctx.fillStyle = "#F4F0DC";
      ctx.beginPath();
      ctx.arc(w * 0.78, h * 0.18, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    // two rows of buildings: far (hazy) + near
    const rows: [number, number, string, number][] = [
      [0.42, 0.7, mood === "night" ? "#1D2350" : mood === "morning" ? "#9FB6D0" : mood === "rain" ? "#6E7886" : "#7A5470", 0.5],
      [0.58, 1.0, mood === "night" ? "#10142E" : mood === "morning" ? "#6E86A6" : mood === "rain" ? "#4C5462" : "#4A2E4C", 1],
    ];
    rows.forEach(([base, hMax, col, lit], r) => {
      let x = -20;
      let i = 0;
      while (x < w) {
        const bw = 50 + hash01(`bw${seed}${r}${i}`) * 90;
        const bh = h * (0.12 + hash01(`bh${seed}${r}${i}`) * 0.33) * hMax;
        const top = h * base + (r === 0 ? 0 : h * 0.06) - bh + h * 0.3;
        ctx.fillStyle = col;
        ctx.fillRect(x, top, bw, h - top);
        const winOn = mood === "night" ? 0.55 : mood === "golden" || mood === "evening" ? 0.25 : 0.06;
        for (let wy = top + 10; wy < h - 10; wy += 16) {
          for (let wx = x + 8; wx < x + bw - 10; wx += 14) {
            if (hash01(`w${seed}${r}${i}${wx}${wy}`) < winOn * lit) {
              ctx.fillStyle = mood === "night" ? "#FFD98A" : "rgba(255,220,150,0.8)";
              ctx.fillRect(wx, wy, 7, 9);
            }
          }
        }
        x += bw + 4;
        i++;
      }
    });
    if (mood === "rain") {
      ctx.fillStyle = "rgba(200,210,225,0.25)";
      ctx.fillRect(0, 0, w, h);
    }
  });

/** The outside seen through a window: an unlit plane (so the sky never goes dark under the room lights). */
export const Outside: React.FC<{ mood: Mood; seed: number; position: [number, number, number]; size: [number, number]; t: number }> = ({ mood, seed, position, size, t }) => {
  const tex = outsideTexture(mood, seed);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  mat.color.setScalar(mood === "night" ? 0.9 : mood === "rain" ? 0.85 : 1.0);
  return (
    <group>
      <mesh geometry={BOX} material={mat} position={position} scale={[size[0], size[1], 0.02]} />
      {mood === "rain" ? <Rain t={t} position={[position[0], position[1], position[2] + 0.4]} size={size} /> : null}
    </group>
  );
};

/** Rain streaks: a scrolling transparent texture in front of the outside plane. */
const rainTex = () =>
  canvasTexture("rain", 256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(220,230,245,0.55)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 90; i++) {
      const x = hash01(`rx${i}`) * w;
      const y = hash01(`ry${i}`) * h;
      const l = 18 + hash01(`rl${i}`) * 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + l);
      ctx.stroke();
    }
  });

const Rain: React.FC<{ t: number; position: [number, number, number]; size: [number, number] }> = ({ t, position, size }) => {
  const mat = useMemo(() => {
    const tex = rainTex().clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size[0] / 3, size[1] / 3);
    tex.needsUpdate = true;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  }, [size]);
  if (mat.map) mat.map.offset.set(0, (t * 1.6) % 1);
  return <mesh geometry={BOX} material={mat} position={position} scale={[size[0], size[1], 0.01]} />;
};

/**
 * Set dressing: neon words, marquee bulbs, pendant lamps, curtains, dust motes, moon + stars, Kenney GLBs.
 * Everything animates from `t` only.
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import { staticFile } from "remotion";
import { useGLTF } from "@react-three/drei";
import { hash01 } from "../../../../core/timeline";
import { FAMILY } from "../../ui/fonts";
import { BOX, CIRCLE, CYL, CYL_LO, SPHERE, SPHERE_LO, box, roundedBox } from "../geo";
import { glowMat, toyMat } from "../materials";
import { canvasTexture } from "../canvasTex";
import { softDot, velvet } from "../tex";

/** Neon word: tube-like glowing text on a transparent plane (+ a dark backing board optional). */
export const NeonWord: React.FC<{ text: string; color?: string; height?: number; intensity?: number; flicker?: number; t?: number; board?: boolean; font?: "title" | "ui" }> = ({
  text,
  color = "#FF8A4C",
  height = 0.8,
  intensity = 3.2,
  flicker,
  t = 0,
  board = false,
  font = "title",
}) => {
  const tex = canvasTexture(`neon:${text}:${color}:${font}`, 1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = font === "title" ? `900 170px "${FAMILY.title}"` : `800 170px "${FAMILY.ui}"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    const sc = Math.min(1, (w - 60) / tw);
    ctx.save();
    ctx.translate(w / 2, h / 2 + 6);
    ctx.scale(sc, 1);
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = 16;
    ctx.strokeText(text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#FFF4E6";
    ctx.lineWidth = 5;
    ctx.strokeText(text, 0, 0);
    ctx.restore();
  });
  // ignition flicker: 3 flickers over 0.5 s after `flicker`, then steady
  let on = 1;
  if (flicker !== undefined) {
    const dt = t - flicker;
    if (dt < 0) on = 0.06;
    else if (dt < 0.5) on = [1, 0.1, 0.9, 0.15, 1, 0.3, 1][Math.floor(dt / 0.075) % 7];
  }
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }), [tex]);
  mat.color.setScalar(intensity * on);
  const w = height * 4;
  return (
    <group>
      {board ? <mesh geometry={roundedBox(w * 0.92, height * 0.95, 0.06, 0.03)} material={toyMat("#1E1A22", { rough: 0.6, felt: 31 })} position={[0, 0, -0.05]} /> : null}
      <mesh geometry={BOX} material={mat} scale={[w, height, 0.001]} />
    </group>
  );
};

/** A row of warm marquee bulbs (emissive spheres) with an optional chase. */
export const Bulbs: React.FC<{ n: number; spacing: number; t: number; chase?: boolean; color?: string; size?: number }> = ({ n, spacing, t, chase = false, color = "#FFE2A6", size = 0.07 }) => {
  const items: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const lit = chase ? 0.55 + 0.45 * Math.max(0, Math.sin(t * 6 - i * 0.8)) : 0.85 + 0.15 * Math.sin(t * 3 + i * 1.7);
    items.push(<mesh key={i} geometry={SPHERE_LO} material={glowMat(color, 2.4 * lit)} position={[(i - (n - 1) / 2) * spacing, 0, 0]} scale={size} />);
  }
  return <group>{items}</group>;
};

export const PendantLamp: React.FC<{ drop?: number; color?: string; shade?: string }> = ({ drop = 1.2, color = "#FFD9A0", shade = "#2B2A33" }) => (
  <group>
    <mesh geometry={CYL_LO} material={toyMat("#1A1A1A", { felt: false })} position={[0, -drop / 2, 0]} scale={[0.015, drop, 0.015]} />
    <mesh geometry={SPHERE} material={toyMat(shade, { rough: 0.5, felt: 13, side: THREE.DoubleSide })} position={[0, -drop, 0]} scale={[0.5, 0.3, 0.5]} />
    <mesh geometry={SPHERE_LO} material={glowMat(color, 3.2)} position={[0, -drop - 0.1, 0]} scale={0.16} />
  </group>
);

export const Curtain: React.FC<{ w: number; h: number; color?: string; seed?: number }> = ({ w, h, color = "#8E3634", seed = 1 }) => {
  const c = new THREE.Color(color);
  const dark = `#${c.clone().multiplyScalar(0.45).getHexString()}`;
  const light = `#${c.clone().lerp(new THREE.Color("#FFB3A0"), 0.18).getHexString()}`;
  const tex = velvet(color, dark, light, Math.max(3, Math.round(w * 2.2)), seed);
  return <mesh geometry={box(w, h, 0.08)} material={toyMat("#FFFFFF", { map: tex, rough: 0.95 })} receiveShadow castShadow />;
};

/** Floating dust motes (additive soft sprites drifting on closed loops — deterministic in t). */
export const Dust: React.FC<{ t: number; count?: number; box: [number, number, number]; center?: [number, number, number]; color?: string; size?: number; seed?: number }> = ({
  t,
  count = 40,
  box: b,
  center = [0, 0, 0],
  color = "#FFE7C4",
  size = 0.035,
  seed = 1,
}) => {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  const mat = useMemo(
    () => new THREE.PointsMaterial({ map: softDot(), color: new THREE.Color(color).multiplyScalar(1.6), size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true }),
    [color, size],
  );
  const arr = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < count; i++) {
    const hx = hash01(`${seed}dx${i}`);
    const hy = hash01(`${seed}dy${i}`);
    const hz = hash01(`${seed}dz${i}`);
    const sp = 0.05 + hash01(`${seed}ds${i}`) * 0.08;
    const yy = ((hy + t * sp * 0.6) % 1 + 1) % 1;
    arr.setXYZ(
      i,
      center[0] + (hx - 0.5) * b[0] + Math.sin(t * 0.9 + i) * 0.16,
      center[1] + (yy - 0.5) * b[1],
      center[2] + (hz - 0.5) * b[2] + Math.cos(t * 0.7 + i * 1.3) * 0.16,
    );
  }
  arr.needsUpdate = true;
  return <points geometry={geo} material={mat} />;
};

/** Kenney GLB (CC0) placed on the floor; clones per instance, casts/receives shadows. */
export const Kenney: React.FC<{ file: string; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number | [number, number, number] }> = ({ file, position, rotation, scale }) => {
  const url = staticFile(`assets/kenney/${file}`);
  const { scene } = useGLTF(url);
  const inst = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return s;
  }, [scene]);
  return <primitive object={inst} position={position} rotation={rotation} scale={scale} />;
};

export const KENNEY_FILES = [
  "furniture/pottedPlant.glb",
  "furniture/loungeSofa.glb",
  "furniture/lampRoundFloor.glb",
  "furniture/plantSmall1.glb",
  "furniture/books.glb",
  "nature/plant_bushDetailed.glb",
  "nature/plant_bush.glb",
];
export const preloadKenney = () => KENNEY_FILES.forEach((f) => useGLTF.preload(staticFile(`assets/kenney/${f}`)));

/** Glowing moon disc with a soft halo. */
export const Moon: React.FC<{ r?: number }> = ({ r = 0.5 }) => (
  <group>
    <mesh geometry={CIRCLE} material={glowMat("#FFF1C2", 2.2)} scale={r * 2} />
    <mesh geometry={CIRCLE} material={glowMat("#FFE39A", 0.5, { transparent: true, opacity: 0.25 })} position={[0, 0, -0.01]} scale={r * 3.2} />
  </group>
);

export const Stars: React.FC<{ n: number; w: number; h: number; seed?: number; t: number }> = ({ n, w, h, seed = 1, t }) => (
  <group>
    {Array.from({ length: n }).map((_, i) => {
      const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + hash01(`${seed}tw${i}`) * 2) + i);
      return <mesh key={i} geometry={SPHERE_LO} material={glowMat("#FFF6DC", 1.8 * tw)} position={[(hash01(`${seed}sx${i}`) - 0.5) * w, (hash01(`${seed}sy${i}`) - 0.5) * h, 0]} scale={0.03 + hash01(`${seed}ss${i}`) * 0.035} />;
    })}
  </group>
);

export { CYL, SPHERE };

/**
 * Cached materials. Every toy surface is a matte MeshStandardMaterial with the felt map (paper/felt noise of the references).
 * Shared instances: never mutate a material returned from here — make a local one (useMemo) for animated values.
 */
import * as THREE from "three";
import { feltMap } from "./tex";

const cache = new Map<string, THREE.Material>();

export type ToyMatOpts = {
  rough?: number;
  metal?: number;
  felt?: number | false; // felt seed (default 1) or false for no texture
  map?: THREE.Texture | null;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  toneMapped?: boolean;
};

export const toyMat = (color: string, o: ToyMatOpts = {}): THREE.MeshStandardMaterial => {
  const key = `toy:${color}:${o.rough ?? 0.85}:${o.metal ?? 0}:${o.felt ?? 1}:${o.map?.uuid ?? ""}:${o.emissive ?? ""}:${o.emissiveIntensity ?? 0}:${o.transparent ?? false}:${o.opacity ?? 1}:${o.side ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0,
    map: o.map !== undefined ? o.map : o.felt === false ? null : feltMap(typeof o.felt === "number" ? o.felt : 1),
    emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color("#000000"),
    emissiveIntensity: o.emissiveIntensity ?? (o.emissive ? 1 : 0),
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  cache.set(key, m);
  return m;
};

/** Unlit glowing material for neon, bulbs and screens (values > 1 feed the bloom). */
export const glowMat = (color: string, intensity = 2.5, opts: { transparent?: boolean; opacity?: number; map?: THREE.Texture | null } = {}): THREE.MeshBasicMaterial => {
  const key = `glow:${color}:${intensity}:${opts.transparent ?? false}:${opts.opacity ?? 1}:${opts.map?.uuid ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1, map: opts.map ?? null });
  cache.set(key, m);
  return m;
};

export const blackMat = () => toyMat("#0B0A0A", { rough: 0.45, felt: false });

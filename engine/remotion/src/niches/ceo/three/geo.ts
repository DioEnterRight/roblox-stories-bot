/**
 * Cached geometries. Toys are built from a handful of shared geometries scaled per mesh (cheap to mount per scene).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const cache = new Map<string, THREE.BufferGeometry>();

/** Unit cube (scale it). */
export const BOX = new THREE.BoxGeometry(1, 1, 1);
/** Unit plane facing +Z. */
export const PLANE = new THREE.PlaneGeometry(1, 1);
/** Unit cylinder (radius 0.5, height 1). */
export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
export const CYL_LO = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
/** Unit sphere (radius 0.5). */
export const SPHERE = new THREE.SphereGeometry(0.5, 20, 14);
export const SPHERE_LO = new THREE.SphereGeometry(0.5, 10, 8);
/** Unit cone (radius 0.5, height 1). */
export const CONE = new THREE.ConeGeometry(0.5, 1, 20);
export const CIRCLE = new THREE.CircleGeometry(0.5, 32);

/** A rounded box with real dimensions (keeps the felt map at the right density). */
export const roundedBox = (w: number, h: number, d: number, r = 0.03, seg = 2) => {
  const key = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}:${seg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new RoundedBoxGeometry(w, h, d, seg, r);
  cache.set(key, g);
  return g;
};

export const torus = (R: number, r: number, arc = Math.PI * 2, radial = 10, tubular = 32) => {
  const key = `torus:${R}:${r}:${arc.toFixed(3)}:${radial}:${tubular}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new THREE.TorusGeometry(R, r, radial, tubular, arc);
  cache.set(key, g);
  return g;
};

/** A box with real dimensions (UVs per face, so textures keep their density). */
export const box = (w: number, h: number, d: number) => {
  const key = `box:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new THREE.BoxGeometry(w, h, d);
  cache.set(key, g);
  return g;
};

export const plane = (w: number, h: number) => {
  const key = `plane:${w.toFixed(3)}:${h.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new THREE.PlaneGeometry(w, h);
  cache.set(key, g);
  return g;
};

/** Cone frustum (radiusTop, radiusBottom, height) — nightcap segments, lamp shades. */
export const frustum = (rt: number, rb: number, h: number, seg = 18) => {
  const key = `fr:${rt}:${rb}:${h}:${seg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  cache.set(key, g);
  return g;
};

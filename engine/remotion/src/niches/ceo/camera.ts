/**
 * Dio CEO World — camera rigs as pure functions of time, shared by the 3D canvas and the 2D projector.
 * Rigs: static | push-in | pull-out | dolly | dolly-track | crane | orbit | whip-to | handheld | keyframes
 * Every rig accepts params: from, to, lookAt, lookTo, fov, fovTo, roll, rollTo, handheld, moveStart, moveEnd, ease.
 */
import * as THREE from "three";
import type { Scene } from "../../core/types";
import { wobble } from "../../core/timeline";
import { clamp01, easeInOutSine, easeOutCubic, lerp, lerp3, num, shotProgress, smooth, str, v3, type V3 } from "./anim";

export type CamState = { pos: V3; look: V3; fov: number; roll: number };
export type CamDefaults = { pos: V3; look: V3; fov: number; staticDrift: number; handheld: number; microDrift?: number };

type Key = { at: number; pos?: V3; look?: V3; fov?: number; roll?: number };

const easeBy = (name: string, u: number) =>
  name === "linear" ? clamp01(u) : name === "inOut" ? easeInOutSine(u) : name === "smooth" ? smooth(u) : name === "out" ? easeOutCubic(u) : shotProgress(u);

export const cameraFor = (scene: Scene | undefined, t: number, def: CamDefaults): CamState => {
  const spec = scene?.camera ?? { rig: "static" };
  const prm = spec.params ?? {};
  const start = scene?.start ?? 0;
  const end = scene?.end ?? start + 1;
  const lt = t - start;
  const moveStart = num(prm.moveStart, 0);
  const moveEnd = num(prm.moveEnd, end - start);
  const u = moveEnd > moveStart ? (lt - moveStart) / (moveEnd - moveStart) : 1;
  const k = easeBy(str(prm.ease, "shot"), u);
  const from = v3(prm.from, def.pos);
  const to = v3(prm.to, from);
  const look = v3(prm.lookAt, def.look);
  const lookTo = v3(prm.lookTo, look);
  const fov0 = num(prm.fov, def.fov);
  const fov1 = num(prm.fovTo, fov0);
  const roll0 = (num(prm.roll, 0) * Math.PI) / 180;
  const roll1 = (num(prm.rollTo, num(prm.roll, 0)) * Math.PI) / 180;

  let pos: V3 = from;
  let lk: V3 = look;
  let fov = fov0;
  let roll = roll0;
  const rig = spec.rig;

  if (rig === "static") {
    // a static tripod still drifts 1–2 % forward over the shot so no frame is ever identical
    const drift = num(prm.drift, def.staticDrift);
    const dir: V3 = [look[0] - from[0], look[1] - from[1], look[2] - from[2]];
    const kk = clamp01(lt / Math.max(0.01, end - start));
    pos = [from[0] + dir[0] * drift * kk, from[1] + dir[1] * drift * kk, from[2] + dir[2] * drift * kk];
  } else if (rig === "push-in" || rig === "pull-out" || rig === "dolly" || rig === "dolly-track" || rig === "crane") {
    pos = lerp3(from, to, k);
    lk = lerp3(look, lookTo, k);
    fov = lerp(fov0, fov1, k);
    roll = lerp(roll0, roll1, k);
  } else if (rig === "orbit") {
    const r = num(prm.radius, Math.hypot(from[0] - look[0], from[2] - look[2]) || 6);
    const a0 = num(prm.fromAngle, -0.4);
    const a1 = num(prm.toAngle, 0.4);
    const a = lerp(a0, a1, k);
    const h = lerp(num(prm.height, from[1]), num(prm.heightTo, num(prm.height, from[1])), k);
    pos = [Math.sin(a) * r + look[0], h, Math.cos(a) * r + look[2]];
    lk = lerp3(look, lookTo, k);
    fov = lerp(fov0, fov1, k);
  } else if (rig === "whip-to") {
    // hold `from`, then whip to `to` in whipDur seconds at whipAt (relative), with a roll kick
    const whipAt = num(prm.whipAt, Math.max(0, (end - start) * 0.5));
    const whipDur = num(prm.whipDur, 0.3);
    const w = clamp01((lt - whipAt) / whipDur);
    const e = easeInOutSine(w);
    pos = lerp3(from, to, e);
    lk = lerp3(look, lookTo, e);
    fov = lerp(fov0, fov1, e);
    roll = roll0 + Math.sin(w * Math.PI) * ((num(prm.whipRoll, 6) * Math.PI) / 180);
  } else if (rig === "keyframes") {
    const keys = (Array.isArray(prm.keys) ? (prm.keys as Key[]) : []).slice().sort((a, b) => a.at - b.at);
    if (keys.length) {
      let i = 0;
      while (i < keys.length - 1 && lt >= keys[i + 1].at) i++;
      const a = keys[i];
      const b = keys[Math.min(keys.length - 1, i + 1)];
      const kk = b.at > a.at ? easeBy(str(prm.ease, "inOut"), (lt - a.at) / (b.at - a.at)) : 1;
      const pa = v3(a.pos, from);
      const pb = v3(b.pos, pa);
      const la = v3(a.look, look);
      const lb = v3(b.look, la);
      pos = lerp3(pa, pb, kk);
      lk = lerp3(la, lb, kk);
      fov = lerp(num(a.fov, fov0), num(b.fov, num(a.fov, fov0)), kk);
      roll = (lerp(num(a.roll, 0), num(b.roll, num(a.roll, 0)), kk) * Math.PI) / 180;
    }
  } else if (rig === "handheld") {
    pos = lerp3(from, to, k);
    lk = lerp3(look, lookTo, k);
    fov = lerp(fov0, fov1, k);
  }
  // every rig keeps a faint operator drift (the references' cameras are never locked off); handheld is stronger
  const hh = rig === "handheld" ? num(prm.handheld, def.handheld) : num(prm.handheld, def.microDrift ?? 0);
  if (hh > 0) {
    pos = [pos[0] + wobble(t, 0.7, 1) * hh, pos[1] + wobble(t, 0.9, 7) * hh * 0.7, pos[2]];
    roll += wobble(t, 0.5, 13) * hh * 0.25;
  }
  return { pos, look: lk, fov, roll };
};

export const applyCamera = (camera: THREE.Camera, cam: CamState) => {
  camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
  if (cam.roll) camera.rotateZ(cam.roll);
  const pc = camera as THREE.PerspectiveCamera;
  if (pc.isPerspectiveCamera && Math.abs(pc.fov - cam.fov) > 1e-4) {
    pc.fov = cam.fov;
    pc.updateProjectionMatrix();
  }
};

export type Projected = { x: number; y: number; depth: number; visible: boolean; pxPerUnit: number };

const projCam = new THREE.PerspectiveCamera(42, 1080 / 1920, 0.05, 200);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/** A projector from world → canvas pixels for the given camera state (used by the 2D label layer). */
export const makeProjector = (cam: CamState, width: number, height: number) => {
  projCam.aspect = width / height;
  projCam.fov = cam.fov;
  projCam.updateProjectionMatrix();
  applyCamera(projCam, cam);
  projCam.updateMatrixWorld(true);
  return (p: V3): Projected => {
    tmp.set(p[0], p[1], p[2]).project(projCam);
    tmp2.set(p[0], p[1] + 1, p[2]).project(projCam);
    const x = ((tmp.x + 1) / 2) * width;
    const y = ((1 - tmp.y) / 2) * height;
    const y2 = ((1 - tmp2.y) / 2) * height;
    return { x, y, depth: tmp.z, visible: tmp.z < 1 && tmp.z > -1, pxPerUnit: Math.abs(y2 - y) };
  };
};

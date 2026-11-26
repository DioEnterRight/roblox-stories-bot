/**
 * Everything inside the ONE persistent canvas: camera (pure function of t), the active set (with its mood), the cast,
 * phone glows and post. Scene props read here: mood, seed, laptop {lines,title,light}, wallSign, chartTitle, menu,
 * traffic, sign.
 */
import React from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { CastMember, Scene } from "../../../core/types";
import { applyCamera, type CamState } from "../camera";
import { BoxGuy, TOP } from "./Character";
import type { SceneEvent } from "./events";
import { Post, type PostParams } from "./Post";
import { Apartment } from "./sets/Apartment";
import { Boardroom } from "./sets/Boardroom";
import { Cafe } from "./sets/Cafe";
import { asMood } from "./sets/common";
import { Nook } from "./sets/Nook";
import { Street } from "./sets/Street";

const CameraApply: React.FC<{ cam: CamState }> = ({ cam }) => {
  const camera = useThree((s) => s.camera);
  applyCamera(camera, cam);
  const pc = camera as THREE.PerspectiveCamera;
  if (pc.near !== 0.1 || pc.far !== 160) {
    pc.near = 0.1;
    pc.far = 160;
    pc.updateProjectionMatrix();
  }
  return null;
};

export const SETS = ["apartment", "boardroom", "cafe", "street", "nook"] as const;

type Laptop = { lines?: string[]; title?: string; light?: boolean };

const SetView: React.FC<{ scene: Scene | undefined; t: number }> = ({ scene, t }) => {
  const set = scene?.set ?? "apartment";
  const p = scene?.props ?? {};
  const mood = asMood(p.mood);
  const seed = typeof p.seed === "number" ? (p.seed as number) : 1;
  const laptop = (p.laptop as Laptop | undefined) ?? undefined;
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  if (set === "boardroom") return <Boardroom t={t} s={{ mood, seed, laptop, chartTitle: s("chartTitle"), sign: s("sign") }} />;
  if (set === "cafe") return <Cafe t={t} s={{ mood, seed, laptop, menu: s("menu") }} />;
  if (set === "street") return <Street t={t} s={{ mood, seed, traffic: Boolean(p.traffic) }} />;
  if (set === "nook") return <Nook t={t} s={{ mood, seed }} />;
  return <Apartment t={t} s={{ mood, seed, laptop, wallSign: s("wallSign") }} />;
};

const BG: Record<string, string> = { night: "#0C1024", rain: "#20242E", golden: "#2A1C22", evening: "#22182A", morning: "#B8C8DA" };

export const World: React.FC<{ scene: Scene | undefined; cast: CastMember[]; t: number; cam: CamState; events: SceneEvent[]; post: PostParams }> = ({ scene, cast, t, cam, events, post }) => {
  const mood = asMood(scene?.props?.mood);
  return (
    <>
      <CameraApply cam={cam} />
      <color attach="background" args={[BG[mood] ?? "#120E18"]} />
      <SetView scene={scene} t={t} />
      {cast.map((m, i) => (
        <React.Fragment key={m.id}>
          <BoxGuy member={m} t={t} sceneStart={scene?.start ?? 0} sceneEnd={scene?.end ?? 0} events={events} index={i} />
          {m.props?.phoneLight ? (
            <pointLight
              position={[(m.at ?? [0, 0, 0])[0] + 0.15, (m.at ?? [0, 0, 0])[1] + TOP * (m.scale ?? 1) * 0.55, (m.at ?? [0, 0, 0])[2] + 0.85 * (m.scale ?? 1)]}
              intensity={1.6 * (0.85 + 0.15 * Math.sin(t * 9 + i * 1.7))}
              distance={2.2}
              decay={2}
              color="#A8DCFF"
            />
          ) : null}
        </React.Fragment>
      ))}
      <Post p={post} />
    </>
  );
};

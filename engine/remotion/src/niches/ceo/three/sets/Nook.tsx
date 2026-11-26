/**
 * SET "nook" — the bedroom corner at night (or a grey rainy afternoon): sofa, floor lamp, window with the moon or rain.
 * Lighting is window light + the phone's glow (a cast member with props.phoneLight). Spot: sofa (0, 0, -0.35).
 */
import React from "react";
import { box } from "../geo";
import { toyMat } from "../materials";
import { Curtain, Kenney } from "../props/decor";
import { Kay } from "../props/kaykit";
import { Floor, Lights, Outside, Wall, WindowWall, type Mood } from "./common";

export type NookState = { mood: Mood; seed: number };

export const Nook: React.FC<{ t: number; s: NookState }> = ({ t, s }) => {
  const mood: Mood = s.mood === "rain" ? "rain" : "night";
  const wall = mood === "rain" ? "#4A5466" : "#232A4C";
  return (
    <group>
      <Lights mood={mood} focus={[0, 1.0, 0]} shadowSize={5} scale={0.9} />
      <Floor w={12} d={10} kind="planks" tone="#4A3438" />
      <mesh geometry={box(4.2, 0.02, 2.6)} material={toyMat("#2E3E58", { felt: 111 })} position={[0, 0.011, 0.2]} receiveShadow />
      <WindowWall w={12} h={6} z={-2.4} hole={[-0.5, 2.2, 1.5, 3.9]} color={wall} seed={61} mullions={1} />
      <Outside mood={mood} seed={s.seed + 41} position={[0.85, 2.7, -4.6]} size={[8, 6]} t={t} />
      {[-0.95, 2.65].map((x, i) => (
        <group key={x} position={[x, 2.8, -2.15]}>
          <Curtain w={0.7} h={3.3} color={mood === "rain" ? "#6A7A96" : "#3A4E96"} seed={70 + i} />
        </group>
      ))}
      <group position={[-4.5, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Wall w={8} h={6} color={wall} seed={66} />
      </group>
      <directionalLight position={[1.5, 3.5, -4]} intensity={2.4} color={mood === "rain" ? "#B8C8E0" : "#9DB4FF"} />
      <Kenney file="furniture/loungeSofa.glb" position={[0, 0, -1.65]} scale={[3.0, 2.6, 2.6]} />
      <Kenney file="furniture/lampRoundFloor.glb" position={[-2.3, 0, -1.7]} scale={2.4} />
      <Kenney file="furniture/plantSmall1.glb" position={[2.9, 0, -1.8]} scale={4} />
      <Kay file="furniture/pillow_A" position={[1.0, 0.5, -1.4]} scale={0.6} rotY={0.4} />
      <pointLight position={[-2.3, 1.9, -1.6]} intensity={4} distance={4} decay={2} color="#FFC98A" />
    </group>
  );
};

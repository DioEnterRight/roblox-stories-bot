/**
 * SET "cafe" — the CEO's "office" (a cafe with free wifi): counter + menu board (left), round tables with a laptop and
 * cups, big window onto the street, pendant lamps.
 * Spots: table (0.9, 0, -1.8) behind the front table, guest (2.05, 0, -1.3) across it, counter (-2.6, 0, -1.65)
 * in front of the counter, window (2.4, 0, -2.75).
 */
import React from "react";
import { box } from "../geo";
import { toyMat } from "../materials";
import { Dust, PendantLamp } from "../props/decor";
import { Kay } from "../props/kaykit";
import { FramedSign, Laptop, Mug, Plant } from "../props/office";
import { Floor, Lights, Outside, Wall, WindowWall, type Mood } from "./common";

export type CafeState = { mood: Mood; seed: number; menu?: string; laptop?: { lines?: string[]; title?: string } };

const WALL: Record<Mood, string> = { golden: "#7FA38C", evening: "#8C7A96", morning: "#A9C7B4", rain: "#6E8478", night: "#2E3E40" };

export const Cafe: React.FC<{ t: number; s: CafeState }> = ({ t, s }) => {
  const mood = s.mood;
  const wall = WALL[mood];
  const dark = mood === "night" || mood === "rain";
  return (
    <group>
      <fog attach="fog" args={[dark ? "#121A1C" : "#26302C", 12, 34]} />
      <Lights mood={mood} focus={[0.2, 1.0, -1.6]} shadowSize={6} />
      <Floor w={16} d={14} kind="checker" z={1} />
      <WindowWall w={16} h={6} z={-3.4} hole={[-0.9, 3.7, 0.8, 3.3]} color={wall} seed={(s.seed % 40) + 21} mullions={3} />
      <Outside mood={mood} seed={s.seed + 23} position={[1.4, 2.5, -6.6]} size={[14, 9]} t={t} />
      <group position={[-4.8, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Wall w={9} h={6} color={wall} seed={(s.seed % 40) + 27} />
      </group>
      {/* counter + menu */}
      <Kay file="restaurant/kitchencounter_straight_decorated" position={[-2.55, 0, -2.75]} scale={0.62} />
      <Kay file="restaurant/kitchencounter_straight_A_backsplash" position={[-3.8, 0, -2.75]} scale={0.62} />
      <group position={[-3.1, 2.55, -3.27]}>
        <FramedSign text={s.menu ?? "COFFEE  CHAI  FREE WIFI"} sub="ASK FOR THE PASSWORD" w={1.6} h={0.9} bg="#26302A" ink="#F3EEE0" frame="#5A3E2A" />
      </group>
      {/* tables */}
      <Kay file="restaurant/table_round_A_small" position={[0.9, 0, -1.15]} scale={0.6} />
      <Kay file="restaurant/table_round_A_small" position={[3.1, 0, -2.0]} scale={0.6} />
      <Kay file="restaurant/chair_A" position={[3.1, 0, -2.6]} scale={0.6} />
      <Kay file="restaurant/chair_A" position={[3.8, 0, -1.6]} scale={0.6} rotY={-1.6} />
      <group position={[0.9, 0.6, -1.15]}>
        <group position={[-0.42, 0, 0.12]} rotation={[0, 0.5, 0]} scale={0.72}>
          <Laptop lines={s.laptop?.lines ?? ["WIFI: CONNECTED", "OFFICE: THIS CAFE", "RENT: 1 COFFEE"]} title={s.laptop?.title ?? "WORK"} facing={-1} light={!dark} />
        </group>
        <group position={[0.3, 0, 0.12]}>
          <Mug color="#F1E6D2" steam={1} t={t} />
        </group>
      </group>
      <group position={[3.1, 0.6, -2.0]}>
        <Mug color="#C96F4A" />
      </group>
      <Kay file="restaurant/chair_stool" position={[-1.6, 0, -1.9]} scale={0.6} />
      <Kay file="restaurant/jar_A_large" position={[-2.2, 0.74, -2.6]} scale={0.35} />
      {[0.9, 3.1, -2.6].map((x, i) => (
        <group key={x} position={[x, 5.6, i === 1 ? -2.0 : i === 2 ? -2.4 : -1.15]}>
          <PendantLamp drop={1.9} />
          <pointLight position={[0, -2.3, 0]} intensity={dark ? 6.5 : 2.5} distance={4.5} decay={2} color="#FFD29A" />
        </group>
      ))}
      <group position={[4.3, 0, -2.9]}>
        <Plant s={1.3} seed={11} />
      </group>
      <mesh geometry={box(16, 0.14, 0.06)} material={toyMat("#2E2622", { felt: 141 })} position={[0, 0.07, -3.27]} />
      <Dust t={t} count={45} box={[7, 3, 3.5]} center={[0.6, 1.9, -1.8]} size={0.045} seed={s.seed + 5} />
      <mesh geometry={box(16, 0.3, 8)} material={toyMat("#2A2420", { felt: 142 })} position={[0, 6.15, -0.5]} />
    </group>
  );
};

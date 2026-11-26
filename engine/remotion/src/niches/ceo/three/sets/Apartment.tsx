/**
 * SET "apartment" — the CEO's home office. Desk with laptop (left), big window with the city outside (back centre-right),
 * couch + coffee table (right), "CEO OF THE MONTH" frame, shelf and clock on the back wall.
 * Spots (where the box cast stands, see locations.json): desk (-1.6, 0, -1.85) behind the desk facing +z,
 * window (1.4, 0, -2.55) backlit in front of the glass, couch (2.6, 0.28, -2.15) on the cushions, visitor (0.35, 0, -1.2).
 * The front (z > 0.5) is kept clear so every camera in front of the cast has a free line of sight.
 */
import React from "react";
import { box, CYL } from "../geo";
import { glowMat, toyMat } from "../materials";
import { Dust } from "../props/decor";
import { Kay } from "../props/kaykit";
import { Desk, FramedSign, Laptop, LightShafts, Mug, OfficeChair, Plant, WallClock } from "../props/office";
import { Floor, Lights, Outside, Wall, WindowWall, type Mood } from "./common";

export type ApartmentState = { mood: Mood; seed: number; laptop?: { lines?: string[]; title?: string; light?: boolean }; wallSign?: string; wallColor?: string; floorTone?: string };

const WALL: Record<Mood, string> = { golden: "#D9B48C", evening: "#B98C8C", morning: "#DCD2C2", rain: "#9AA0A8", night: "#3A3F5C" };

export const Apartment: React.FC<{ t: number; s: ApartmentState }> = ({ t, s }) => {
  const mood = s.mood;
  const wall = s.wallColor ?? WALL[mood];
  const dark = mood === "night" || mood === "rain";
  return (
    <group>
      <fog attach="fog" args={[dark ? "#141828" : "#2A2026", 12, 34]} />
      <Lights mood={mood} focus={[0, 1.0, -1.4]} shadowSize={6} />
      <Floor w={16} d={14} kind="planks" z={1} tone={s.floorTone} />
      <WindowWall w={16} h={6} z={-3.4} hole={[-0.3, 3.1, 0.9, 3.5]} color={wall} seed={s.seed % 50} />
      <Outside mood={mood} seed={s.seed} position={[1.4, 2.6, -6.6]} size={[14, 9]} t={t} />
      {/* left wall */}
      <group position={[-4.7, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Wall w={9} h={6} color={wall} seed={(s.seed % 50) + 7} />
      </group>
      {/* baseboard */}
      <mesh geometry={box(16, 0.14, 0.06)} material={toyMat("#F1EBDD", { felt: 101 })} position={[0, 0.07, -3.27]} />
      {/* desk zone */}
      <group position={[-1.6, 0, -1.0]}>
        <Desk w={2.2} d={0.95} h={0.45} color={dark ? "#8A6646" : "#B98A5E"} />
      </group>
      <group position={[-2.3, 0.485, -1.0]} rotation={[0, 0.4, 0]} scale={0.8}>
        <Laptop lines={s.laptop?.lines} title={s.laptop?.title} light={s.laptop?.light ?? !dark} facing={-1} glow={dark ? 1.4 : 1.05} />
      </group>
      <group position={[-0.85, 0.485, -0.85]}>
        <Mug color="#E9E2D2" steam={1} t={t} />
      </group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={box(0.42, 0.02, 0.3)} material={toyMat(i === 1 ? "#F4F1E8" : "#E8E2D2", { felt: 110 + i })} position={[-1.2, 0.495 + i * 0.022, -0.8]} rotation={[0, 0.08 * (i - 1), 0]} castShadow />
      ))}
      <Kay file="furniture/lamp_table" position={[-2.5, 0.485, -1.3]} scale={0.42} />
      <group position={[-1.6, 0, -2.5]}>
        <OfficeChair color="#2B2E3A" />
      </group>
      {/* back wall dressing behind the desk */}
      <group position={[-2.75, 2.15, -3.27]}>
        <FramedSign text={s.wallSign ?? "CEO OF THE MONTH"} sub="(EVERY MONTH)" w={1.0} h={0.72} />
      </group>
      <Kay file="furniture/shelf_B_large_decorated" position={[-1.15, 1.55, -3.3]} scale={0.62} />
      <group position={[-1.15, 2.85, -3.26]}>
        <WallClock t={t} r={0.26} />
      </group>
      {/* window zone */}
      <LightShafts from={[1.4, 3.3, -3.3]} t={t} strength={mood === "golden" ? 0.22 : mood === "morning" ? 0.14 : 0} n={mood === "golden" || mood === "morning" ? 4 : 0} color={mood === "golden" ? "#FFC98A" : "#EAF2FF"} />
      <group position={[0.15, 0, -2.95]}>
        <Plant s={1.15} seed={5} />
      </group>
      {/* lounge zone */}
      <Kay file="furniture/couch_pillows" position={[2.75, 0, -2.4]} scale={0.62} tint={mood === "night" ? "#8A8FB8" : undefined} />
      <Kay file="furniture/table_low" position={[2.75, 0, -1.05]} scale={0.5} />
      <Kay file="furniture/lamp_standing" position={[4.1, 0, -2.7]} scale={0.6} />
      <Kay file="furniture/rug_rectangle_stripes_A" position={[2.6, 0.005, -1.2]} scale={[0.95, 0.4, 0.95]} />
      <Kay file="furniture/cactus_medium_A" position={[-3.9, 0, -2.6]} scale={0.7} />
      {/* practical lights */}
      <pointLight position={[-2.45, 1.15, -1.25]} intensity={dark ? 7.5 : 2.0} distance={4.5} decay={2} color="#FFC98A" />
      <pointLight position={[-2.2, 0.85, -1.3]} intensity={dark ? 3.2 : 0.6} distance={2.2} decay={2} color="#A8C8FF" />
      <pointLight position={[4.1, 1.6, -2.4]} intensity={dark ? 5.0 : 0.8} distance={4} decay={2} color="#FFD29A" />
      {mood === "golden" || mood === "evening" ? <pointLight position={[1.4, 1.8, -2.9]} intensity={7} distance={5} decay={2} color="#FFB070" /> : null}
      <Dust t={t} count={dark ? 30 : 70} box={[7, 3.2, 3.5]} center={[0.6, 1.8, -1.6]} size={0.05} seed={s.seed} />
      {/* ceiling lip so high cameras never see a void */}
      <mesh geometry={box(16, 0.3, 8)} material={toyMat("#2A2228", { felt: 120 })} position={[0, 6.15, -0.5]} />
      <mesh geometry={CYL} material={glowMat("#FFE2B0", 0)} position={[0, -9, 0]} scale={0.01} />
    </group>
  );
};

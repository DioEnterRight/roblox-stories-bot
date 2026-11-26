/**
 * SET "boardroom" — a glass-walled meeting room: long table running towards the camera with empty office chairs,
 * a wall chart (the revenue line going down), a neon company sign, a window with the city.
 * Spots: head (0.6, 0, -2.85) at the far end of the table, present (-1.45, 0, -2.55) beside the chart,
 * side_l (-0.8, 0, 0.55) and side_r (2.0, 0, 0.55) at the near corners of the table.
 */
import React from "react";
import { box } from "../geo";
import { toyMat } from "../materials";
import { Dust, NeonWord } from "../props/decor";
import { Kay } from "../props/kaykit";
import { ChartBoard, Desk, Laptop, Mug, OfficeChair, Plant, WallClock } from "../props/office";
import { Floor, Lights, Outside, Wall, WindowWall, type Mood } from "./common";

export type BoardroomState = { mood: Mood; seed: number; chartTitle?: string; chartK?: number; sign?: string; laptop?: { lines?: string[]; title?: string } };

const WALL: Record<Mood, string> = { golden: "#B49C86", evening: "#8E7F92", morning: "#9AA8B6", rain: "#77818E", night: "#2E3450" };

export const Boardroom: React.FC<{ t: number; s: BoardroomState }> = ({ t, s }) => {
  const mood = s.mood;
  const wall = WALL[mood];
  const dark = mood === "night" || mood === "rain";
  return (
    <group>
      <fog attach="fog" args={[dark ? "#121626" : "#22242C", 12, 34]} />
      <Lights mood={mood} focus={[0.4, 1.0, -1.5]} shadowSize={6} scale={0.72} />
      <Floor w={16} d={14} kind="carpet" z={1} tone={dark ? "#2C344A" : "#465674"} />
      <WindowWall w={16} h={6} z={-3.4} hole={[-4.6, -2.3, 1.0, 3.4]} color={wall} seed={(s.seed % 40) + 3} mullions={1} />
      <Outside mood={mood} seed={s.seed + 11} position={[-3.4, 2.4, -6.4]} size={[8, 7]} t={t} />
      <group position={[4.9, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <Wall w={9} h={6} color={wall} seed={(s.seed % 40) + 9} />
      </group>
      <group position={[0.7, 2.25, -3.28]}>
        <ChartBoard w={2.7} h={1.5} title={s.chartTitle ?? "REVENUE"} k={s.chartK ?? 1} glow={dark ? 1.2 : 1.0} />
      </group>
      <group position={[0.7, 3.55, -3.25]}>
        <NeonWord text={s.sign ?? "DIO INC."} height={0.42} intensity={dark ? 3.4 : 2.2} color="#6FD3FF" t={t} />
      </group>
      <group position={[3.2, 2.6, -3.26]}>
        <WallClock t={t} r={0.3} speed={0.9} />
      </group>
      {/* the long table, running towards the camera */}
      <group position={[0.6, 0, -1.0]} rotation={[0, Math.PI / 2, 0]}>
        <Desk w={3.0} d={1.5} h={0.5} color={dark ? "#5A4434" : "#7A5A44"} panel={false} />
      </group>
      {[-1.95, -1.15, -0.35].map((z, i) => (
        <React.Fragment key={z}>
          <group position={[-0.45, 0, z]} rotation={[0, Math.PI / 2, 0]}>
            <OfficeChair color={i % 2 ? "#33384A" : "#2B2E3A"} />
          </group>
          <group position={[1.65, 0, z]} rotation={[0, -Math.PI / 2, 0]}>
            <OfficeChair color={i % 2 ? "#2B2E3A" : "#33384A"} />
          </group>
        </React.Fragment>
      ))}
      <group position={[-0.32, 0.535, -2.05]} rotation={[0, 0.6, 0]} scale={0.8}>
        <Laptop lines={s.laptop?.lines ?? ["Q4 TARGET: 1 CR", "ACTUAL: 0", "INVESTORS: 0"]} title={s.laptop?.title ?? "BOARD DECK"} facing={-1} light />
      </group>
      {[-1.5, -0.6, 0.2].map((z, i) => (
        <mesh key={z} geometry={box(0.36, 0.015, 0.26)} material={toyMat("#F2EEE4", { felt: 130 + i })} position={[0.15 + (i % 2) * 0.9, 0.543, z]} rotation={[0, 0.2 * (i - 1), 0]} />
      ))}
      <group position={[1.05, 0.535, -0.2]}>
        <Mug color="#3C6FE0" />
      </group>
      <group position={[-3.2, 0, -2.9]}>
        <Plant s={1.3} seed={7} leaf="#3F8F5A" pot="#2E3440" />
      </group>
      <group position={[4.2, 0, -2.8]}>
        <Plant s={1.2} seed={9} leaf="#56A05C" pot="#E9E2D2" />
      </group>
      <Kay file="furniture/cabinet_small_decorated" position={[-2.0, 0, -3.0]} scale={0.6} />
      <pointLight position={[0.7, 2.2, -2.4]} intensity={dark ? 6 : 2} distance={4} decay={2} color="#EAF2FF" />
      <pointLight position={[0.6, 3.2, -0.8]} intensity={dark ? 7 : 3} distance={6} decay={2} color="#FFE2B8" />
      <Dust t={t} count={40} box={[7, 3, 4]} center={[0.4, 1.8, -1.2]} size={0.045} seed={s.seed + 3} />
      <mesh geometry={box(16, 0.3, 8)} material={toyMat("#24242C", { felt: 121 })} position={[0, 6.15, -0.5]} />
    </group>
  );
};

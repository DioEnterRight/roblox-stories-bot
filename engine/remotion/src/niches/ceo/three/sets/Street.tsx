/**
 * SET "street" — a city block: KayKit buildings along the back, a raised sidewalk (y 0.12) with streetlights, a bench,
 * a hydrant and bins, and a road in front with optional traffic (cars cross on fixed schedules — only for wide shots,
 * where the camera stands behind the far lane).
 * Spots: sidewalk (0, 0.12, -0.7), bench (2.05, 0.42, -1.55) sitting, door (-2.6, 0.12, -1.85) at a shop door,
 * curb (0.9, 0.12, 0.55) at the kerb.
 */
import React from "react";
import { box, BOX } from "../geo";
import { glowMat, toyMat } from "../materials";
import { Dust } from "../props/decor";
import { Kay, type KayFile } from "../props/kaykit";
import { Floor, Lights, Outside, type Mood } from "./common";

export type StreetState = { mood: Mood; seed: number; traffic?: boolean };

const BUILDINGS: { file: KayFile; w: number }[] = [
  { file: "city/building_E_withoutBase", w: 2.0 },
  { file: "city/building_C_withoutBase", w: 1.2 },
  { file: "city/building_G_withoutBase", w: 2.0 },
  { file: "city/building_B_withoutBase", w: 1.6 },
  { file: "city/building_H_withoutBase", w: 2.0 },
  { file: "city/building_D_withoutBase", w: 1.6 },
  { file: "city/building_F_withoutBase", w: 2.0 },
  { file: "city/building_A_withoutBase", w: 1.2 },
];
const CARS: KayFile[] = ["city/car_taxi", "city/car_sedan", "city/car_hatchback", "city/car_stationwagon", "city/car_police"];
const BS = 3.2;

const carX = (t: number, speed: number, offset: number, span = 44) => (((t * speed + offset) % span) + span) % span - span / 2;

export const Street: React.FC<{ t: number; s: StreetState }> = ({ t, s }) => {
  const mood = s.mood;
  const dark = mood === "night" || mood === "rain";
  // buildings: rotate the list by the seed so every video shows a different block
  const order = BUILDINGS.map((_, i) => BUILDINGS[(i + s.seed) % BUILDINGS.length]);
  const total = order.reduce((n, b) => n + b.w * BS + 0.15, 0);
  let x = -total / 2;
  const placed = order.map((b) => {
    const cx = x + (b.w * BS) / 2;
    x += b.w * BS + 0.15;
    return { ...b, cx };
  });
  return (
    <group>
      <fog attach="fog" args={[dark ? "#10142A" : "#9AA8C0", 18, 60]} />
      <Lights mood={mood} focus={[0, 1.0, -0.8]} shadowSize={8} />
      <Outside mood={mood} seed={s.seed + 31} position={[0, 9, -16]} size={[70, 30]} t={t} />
      {/* back alley ground so gaps between buildings never show a void */}
      <mesh geometry={box(60, 0.1, 14)} material={toyMat("#4A4A50", { felt: 150 })} position={[0, -0.04, -9]} />
      {placed.map((b, i) => (
        <Kay key={i} file={b.file} position={[b.cx, 0.12 - 0.1 * BS, -4.7]} scale={BS} />
      ))}
      {/* sidewalk (raised) + kerb */}
      <group position={[0, 0.12, 0]}>
        <Floor w={44} d={4.6} kind="sidewalk" z={-1.1} />
      </group>
      <mesh geometry={box(44, 0.14, 0.18)} material={toyMat("#B8B4AC", { felt: 151 })} position={[0, 0.06, 1.2]} receiveShadow />
      {/* road */}
      <mesh geometry={box(44, 0.1, 9)} material={toyMat(dark ? "#2A2A30" : "#3C3C44", { felt: 152, rough: 0.95 })} position={[0, -0.05, 5.8]} receiveShadow />
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} geometry={box(1.6, 0.012, 0.14)} material={toyMat("#E8E2C8", { felt: false })} position={[-20 + i * 3.2, 0.006, 3.7]} />
      ))}
      {/* street furniture */}
      {[-4.2, 4.2].map((lx, i) => (
        <group key={lx}>
          <Kay file="city/streetlight" position={[lx, 0.12, 1.0]} scale={3.4} rotY={i ? Math.PI : 0} />
          {dark ? (
            <>
              <mesh geometry={BOX} material={glowMat("#FFE0A0", 3.2)} position={[lx + (i ? 0.7 : -0.7), 3.25, 1.0]} scale={[0.3, 0.08, 0.2]} />
              <pointLight position={[lx + (i ? 0.7 : -0.7), 3.0, 1.0]} intensity={18} distance={9} decay={2} color="#FFD69A" />
            </>
          ) : null}
        </group>
      ))}
      <Kay file="city/bench" position={[2.05, 0.12, -1.75]} scale={3.5} />
      <Kay file="city/firehydrant" position={[-1.3, 0.12, 0.7]} scale={3.2} />
      <Kay file="city/trash_A" position={[3.6, 0.12, 0.8]} scale={4} />
      <Kay file="city/dumpster" position={[-5.6, 0.12, -2.0]} scale={2.6} />
      <Kay file="city/bush" position={[5.4, 0.12, -2.1]} scale={3.2} />
      <Kay file="city/bush" position={[-3.8, 0.12, -2.1]} scale={2.8} />
      {s.traffic
        ? [0, 1, 2].map((i) => {
            const lane = i % 2 === 0 ? 2.7 : 4.6;
            const dir = i % 2 === 0 ? 1 : -1;
            const cx = carX(t, 8.5 * dir, i * 17 + (s.seed % 9) * 3);
            return <Kay key={i} file={CARS[(i + s.seed) % CARS.length]} position={[cx, 0.07 * 2.8, lane]} rotY={dir > 0 ? Math.PI / 2 : -Math.PI / 2} scale={2.8} />;
          })
        : (
          <Kay file={CARS[s.seed % CARS.length]} position={[-6.2, 0.07 * 2.8, 2.6]} rotY={Math.PI / 2} scale={2.8} />
        )}
      {dark ? <Dust t={t} count={50} box={[12, 4, 5]} center={[0, 2, 0]} size={0.05} seed={s.seed + 7} color="#FFE6B8" /> : null}
    </group>
  );
};

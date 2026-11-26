/**
 * KayKit models (CC0, Kay Lousberg — public/assets/kaykit/LICENSE-KayKit-CC0.txt), loaded as glTF and cloned per
 * instance. Sizes at scale 1: furniture ≈ human scale 1.8 m, so the box cast (0.92 m) uses furniture at ≈ 0.6;
 * city buildings ≈ 3.5, cars ≈ 3. Every instance casts and receives shadows; `tint` multiplies the texture colour.
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import { staticFile } from "remotion";
import { useGLTF } from "@react-three/drei";

type V3 = [number, number, number];

export const KAY_FILES = [
  "furniture/couch_pillows", "furniture/armchair_pillows", "furniture/lamp_standing", "furniture/lamp_table", "furniture/book_set",
  "furniture/pictureframe_large_A", "furniture/pictureframe_medium", "furniture/pictureframe_small_B", "furniture/shelf_B_large_decorated",
  "furniture/shelf_B_small_decorated", "furniture/cactus_medium_A", "furniture/cactus_small_B", "furniture/rug_rectangle_stripes_A",
  "furniture/rug_oval_B", "furniture/chair_A", "furniture/table_low", "furniture/cabinet_small_decorated", "furniture/pillow_A",
  "restaurant/table_round_A_small", "restaurant/chair_A", "restaurant/chair_stool", "restaurant/menu",
  "restaurant/kitchencounter_straight_A_backsplash", "restaurant/kitchencounter_straight_decorated", "restaurant/shelf_papertowel_decorated",
  "restaurant/plate", "restaurant/food_burger", "restaurant/jar_A_large",
  "city/building_A_withoutBase", "city/building_B_withoutBase", "city/building_C_withoutBase", "city/building_D_withoutBase",
  "city/building_E_withoutBase", "city/building_F_withoutBase", "city/building_G_withoutBase", "city/building_H_withoutBase",
  "city/car_taxi", "city/car_sedan", "city/car_hatchback", "city/car_stationwagon", "city/car_police", "city/streetlight", "city/bench",
  "city/firehydrant", "city/trash_A", "city/bush", "city/trafficlight_A", "city/dumpster",
] as const;

export type KayFile = (typeof KAY_FILES)[number];

const url = (f: string) => staticFile(`assets/kaykit/${f}.gltf`);

export const preloadKay = () => KAY_FILES.forEach((f) => useGLTF.preload(url(f)));

export const Kay: React.FC<{ file: KayFile; position?: V3; rotY?: number; scale?: number | V3; tint?: string; shadows?: boolean }> = ({
  file,
  position,
  rotY = 0,
  scale = 1,
  tint,
  shadows = true,
}) => {
  const { scene } = useGLTF(url(file));
  const inst = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = shadows;
      m.receiveShadow = true;
      if (tint) {
        const src = m.material as THREE.MeshStandardMaterial;
        const mat = src.clone();
        mat.color = new THREE.Color(tint);
        m.material = mat;
      }
    });
    return s;
  }, [scene, tint, shadows]);
  return <primitive object={inst} position={position} rotation={[0, rotY, 0]} scale={scale} />;
};

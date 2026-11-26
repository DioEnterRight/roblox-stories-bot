/**
 * Top layer (above the captions): a fine, frame-seeded monochrome grain so the DOM layers (title strip, chips, cards)
 * share the film texture of the 3D frame (references: grain σ ≈ 0.4–0.6/255 on everything). Deterministic.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { hash01 } from "../../core/timeline";
import { mulberry32 } from "./three/tex";

let grainUrl: string | null = null;
const getGrain = () => {
  if (grainUrl) return grainUrl;
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(256, 256);
  const rnd = mulberry32(424242);
  for (let i = 0; i < 256 * 256; i++) {
    const v = Math.round(128 + (rnd() + rnd() - 1) * 110);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainUrl = c.toDataURL("image/png");
  return grainUrl;
};

export const CeoOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const ox = Math.floor(hash01(`gx${frame}`) * 256);
  const oy = Math.floor(hash01(`gy${frame}`) * 256);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: `url(${getGrain()})`, backgroundPosition: `${ox}px ${oy}px`, mixBlendMode: "overlay", opacity: 0.01 }} />
  );
};

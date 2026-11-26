/**
 * Channel branding on top of everything: "@outrichguy" in the top-right corner of every frame, and the outro card for
 * the last ~3 s: a big pulsing FOLLOW button, the handle as the main focus, "Dio's Stories" smaller underneath.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { ReelSpec } from "../../../core/types";
import { FONTS } from "./fonts";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const backOut = (x: number) => { const c = 1.7; const t = clamp01(x) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };

export const BrandLayer: React.FC<{ reel: ReelSpec }> = ({ reel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = reel.meta.brand;
  if (!b) return null;
  const t = frame / fps;
  const o = b.outro;
  const k = o ? t - o.start : -1;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {b.corner && (
        <div style={{ position: "absolute", top: 70, right: 36, padding: "8px 26px", borderRadius: 40, background: "rgba(0,0,0,0.5)",
                      color: "#fff", fontFamily: FONTS.caption, fontSize: 40, letterSpacing: 1 }}>{b.corner}</div>
      )}
      {o && k >= 0 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 250 }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0) 62%)", opacity: clamp01(k / 0.25) }} />
          <div style={{ transform: `scale(${backOut(k / 0.35)}) scale(${1 + 0.04 * Math.sin(k * 9) * (k > 0.6 ? 1 : 0)})`, background: "#E8312F",
                        color: "#fff", fontFamily: FONTS.caption, fontSize: 96, padding: "10px 64px", borderRadius: 70, border: "6px solid #111",
                        boxShadow: "0 10px 0 #111" }}>FOLLOW</div>
          <div style={{ marginTop: 34, transform: `translateY(${(1 - backOut((k - 0.15) / 0.35)) * 60}px)`, opacity: clamp01((k - 0.15) / 0.2),
                        color: "#FFE14D", fontFamily: FONTS.caption, fontSize: 132, lineHeight: 1, WebkitTextStroke: "6px #111",
                        paintOrder: "stroke", textShadow: "0 8px 0 #111" }}>{o.headline}</div>
          <div style={{ marginTop: 22, opacity: clamp01((k - 0.45) / 0.25), color: "#fff", fontFamily: FONTS.ui, fontWeight: 800,
                        fontSize: 46, letterSpacing: 2, textShadow: "0 3px 0 #111" }}>{o.sub}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

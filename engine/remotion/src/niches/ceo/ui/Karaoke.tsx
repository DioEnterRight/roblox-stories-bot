/**
 * "karaoke" caption renderer — the outrichguy look: tall condensed ALL-CAPS words (Anton), white with a dark outline,
 * built up word by word as they are spoken; the newest word is the accent colour (yellow by default) and lands with a
 * tiny pop. At most two lines, centred, in the band y ≈ 1300-1460 (nothing important is framed there).
 * Params (style.json captions.params, overridable per reel): centerY, fontSize, maxWidth, lineGap, accent, outline.
 */
import React from "react";
import type { CaptionRendererProps } from "../../../core/types";
import { stripPunct } from "../anim";
import { FONTS } from "./fonts";

type KParams = { centerY?: number; fontSize?: number; maxWidth?: number; lineGap?: number; accent?: string; outline?: string; upper?: boolean };

/** Anton advance widths in em (condensed caps): deterministic layout, independent of font-load timing. */
const adv = (ch: string) => {
  if (ch === " ") return 0.22;
  if (/[MW]/.test(ch)) return 0.66;
  if (/[IJ1]/.test(ch)) return 0.27;
  if (/[0-9]/.test(ch)) return 0.48;
  if (/[.,:;!'’]/.test(ch)) return 0.2;
  if (/[?$%&₹]/.test(ch)) return 0.5;
  return 0.47;
};
const width = (s: string, size: number) => [...s].reduce((n, ch) => n + adv(ch), 0) * size;

export const KaraokeCaptions: React.FC<CaptionRendererProps> = ({ state, style, scene, reel }) => {
  const prm = { ...((style.captions.params ?? {}) as KParams), ...((reel.captions?.params ?? {}) as KParams), ...((scene?.captions?.params ?? {}) as KParams) };
  const centerY = prm.centerY ?? 1385;
  const size0 = prm.fontSize ?? 96;
  const maxW = prm.maxWidth ?? 900;
  const gap = prm.lineGap ?? 1.02;
  const accent = prm.accent ?? "#FFD400";
  const outline = prm.outline ?? "#111111";
  const upper = prm.upper ?? true;
  const shown = state.words.filter((w) => state.t >= w.appearAt);
  if (!shown.length) return null;
  const words = state.words.map((w) => {
    const raw = stripPunct(w.w);
    return { ...w, text: upper ? raw.toUpperCase() : raw };
  });
  // lay out ALL words of the group (so lines never re-flow as words arrive), shrink to fit two lines
  let size = size0;
  let lines: (typeof words)[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    lines = [];
    let cur: typeof words = [];
    let curW = 0;
    const space = adv(" ") * size;
    for (const w of words) {
      const ww = width(w.text, size);
      if (cur.length && curW + space + ww > maxW) {
        lines.push(cur);
        cur = [];
        curW = 0;
      }
      cur.push(w);
      curW += (cur.length > 1 ? space : 0) + ww;
    }
    if (cur.length) lines.push(cur);
    if (lines.length <= 2) break;
    size *= 0.88;
  }
  const newest = shown[shown.length - 1];
  const lh = size * gap;
  const top = centerY - (lines.length * lh) / 2;
  const stroke = Math.max(4, size * 0.075);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {lines.map((ln, li) => (
        <div key={li} style={{ position: "absolute", left: 0, right: 0, top: top + li * lh, height: lh, display: "flex", justifyContent: "center", alignItems: "center", gap: adv(" ") * size }}>
          {ln.map((w) => {
            const visible = state.t >= w.appearAt;
            const isNew = w.index === newest.index;
            const age = state.t - w.appearAt;
            const pop = isNew && age < 0.14 ? 1 + 0.14 * (1 - age / 0.14) : 1;
            return (
              <span
                key={w.index}
                style={{
                  visibility: visible ? "visible" : "hidden",
                  fontFamily: FONTS.caption,
                  fontSize: size,
                  lineHeight: 1,
                  color: isNew ? accent : "#FFFFFF",
                  WebkitTextStroke: `${stroke.toFixed(1)}px ${outline}`,
                  paintOrder: "stroke fill",
                  textShadow: `0 ${(size * 0.05).toFixed(1)}px ${(size * 0.08).toFixed(1)}px rgba(0,0,0,0.55)`,
                  transform: `scale(${pop.toFixed(3)})`,
                  display: "inline-block",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.01em",
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

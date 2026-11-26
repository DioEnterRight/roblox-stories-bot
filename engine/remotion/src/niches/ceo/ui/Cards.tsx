/**
 * Cream paper cards of the niche (style-bible §Cards): counter "✳ ×N", stat card (label + coloured value), role pill
 * (optional coloured left tab), flaw pill (red tab, red caps), stopwatch timer, score tag. All: paper texture, 3 px dark
 * outline, radius 14–16, soft drop shadow, seeded tilt ±2°, pop 0 → 1.08 → 1 in ≈ 7 frames, gentle idle drift ≤ 3 px.
 */
import React from "react";
import { staticFile } from "remotion";
import { hash01 } from "../../../core/timeline";
import { boilTransform, popIn } from "../anim";
import { FONTS } from "./fonts";

const paperTex = staticFile("assets/textures/paper_cream_01.png");

export const CARD = {
  paper: "#F4ECDA",
  outline: "#1F1A17",
  orange: "#E2683F",
  gold: "#E0A01E",
  green: "#2E9E4F",
  red: "#D9402F",
  blue: "#2F6FD8",
  ink: "#151210",
};

export const colorOf = (c?: string) => (c && c in CARD ? (CARD as Record<string, string>)[c] : c ?? CARD.orange);

/** Pop + idle transform for a card that appears at `at` (absolute s). Returns null before it appears. */
export const cardMotion = (t: number, at: number, seed: string, tilt = 2) => {
  if (t < at) return null;
  // 0 → 1.08 → 1 in 0.24 s; a card due at t ≤ 0 is simply there on frame 0
  const k = at <= 0 ? 1 : popIn(t, at, 0.24, 1.5);
  const rot = (hash01(seed + "rot") - 0.5) * 2 * tilt;
  const dx = Math.sin(t * 1.3 + hash01(seed) * 6) * 2.2;
  const dy = Math.sin(t * 1.1 + hash01(seed + "y") * 6) * 2.6;
  return { transform: `${boilTransform(Math.round(t * 30), seed)} translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${Math.max(0.001, k).toFixed(4)})`, k };
};

export const PaperBox: React.FC<{ w?: number; h: number; radius?: number; children?: React.ReactNode; style?: React.CSSProperties; bg?: string; outline?: string; seed?: string }> = ({
  w,
  h,
  radius = 16,
  children,
  style,
  bg = CARD.paper,
  outline = CARD.outline,
  seed = "p",
}) => (
  <div
    style={{
      position: "relative",
      width: w,
      height: h,
      borderRadius: radius,
      background: bg,
      border: `5.5px solid ${outline}`,
      boxShadow: "0 6px 14px rgba(0,0,0,0.38), 0 2px 3px rgba(0,0,0,0.25)",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url(${paperTex})`,
        backgroundSize: "520px 520px",
        backgroundPosition: `${Math.floor(hash01(seed) * 500)}px ${Math.floor(hash01(seed + "y") * 500)}px`,
        mixBlendMode: "multiply",
        opacity: 0.55,
        pointerEvents: "none",
      }}
    />
    <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: "100%" }}>{children}</div>
  </div>
);

/** "✳ ×N" counter plate. */
export const CounterCard: React.FC<{ value: string; color?: string }> = ({ value, color }) => {
  const c = colorOf(color ?? "orange");
  return (
    <PaperBox h={128} radius={18} seed="counter" style={{ padding: "0 26px 0 18px" }}>
      <div style={{ width: 96, height: 96, borderRadius: 48, border: `5.5px solid ${CARD.outline}`, display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F0E1", flex: "0 0 auto" }}>
        <Starburst size={74} color={c} />
      </div>
      <div style={{ fontFamily: FONTS.title, fontWeight: 900, fontSize: 96, color: c, marginLeft: 16, lineHeight: 1, letterSpacing: "-0.02em", paddingTop: 6, whiteSpace: "nowrap" }}>{value}</div>
    </PaperBox>
  );
};

/** Stat card: small black caps label + big coloured value (SCORE 87, AD SPEND $0, CUSTOMERS 7). */
export const StatCard: React.FC<{ label: string; value: string; color?: string; icon?: boolean; big?: boolean }> = ({ label, value, color, icon, big }) => {
  const c = colorOf(color ?? "orange");
  return (
    <PaperBox h={big ? 170 : 132} radius={18} seed={`stat${label}`} style={{ padding: big ? "0 40px 0 26px" : "0 30px 0 26px" }}>
      {icon ? (
        <div style={{ width: big ? 120 : 92, height: big ? 120 : 92, borderRadius: 999, border: `5px solid ${CARD.outline}`, display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F0E1", marginRight: 22, flex: "0 0 auto" }}>
          <Starburst size={big ? 86 : 66} color={CARD.orange} />
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: big ? "column" : "row", alignItems: big ? "flex-end" : "center", gap: big ? 0 : 26, flex: 1, justifyContent: big ? "center" : "flex-start" }}>
        <div style={{ fontFamily: FONTS.title, fontWeight: 900, fontSize: big ? 46 : 36, color: big ? "#5A524C" : CARD.ink, letterSpacing: "-0.01em", whiteSpace: "nowrap", lineHeight: 1 }}>{label}</div>
        <div style={{ fontFamily: FONTS.title, fontWeight: 900, fontSize: big ? 112 : 84, color: c, lineHeight: 1, letterSpacing: "-0.02em", whiteSpace: "nowrap", paddingTop: 4 }}>{value}</div>
      </div>
    </PaperBox>
  );
};

/** Role pill: black caps on cream; optional coloured left tab — or the DeYrh plain card. */
export const RolePill: React.FC<{ text: string; tab?: string; textColor?: string; size?: number }> = ({ text, tab, textColor, size = 48 }) => (
  <PaperBox h={Math.round(size * 2.25)} radius={16} seed={`role${text}`} style={{ padding: 0 }}>
    {tab ? <div style={{ width: 26, alignSelf: "stretch", background: colorOf(tab), borderRight: `3px solid ${CARD.outline}`, flex: "0 0 auto" }} /> : null}
    <div style={{ fontFamily: FONTS.title, fontWeight: 900, fontSize: size, color: textColor ? colorOf(textColor) : CARD.ink, padding: tab ? "0 34px 0 28px" : "0 40px", whiteSpace: "nowrap", letterSpacing: "-0.01em", lineHeight: 1, paddingTop: 4 }}>{text}</div>
  </PaperBox>
);

/** Stopwatch timer card: "LEFT AT" + m:ss counting while running, red when stopped. */
export const TimerCard: React.FC<{ label: string; seconds: number; stopped: boolean }> = ({ label, seconds, stopped }) => {
  const s = Math.max(0, Math.floor(seconds));
  const txt = `0:${String(s).padStart(2, "0")}`;
  return (
    <PaperBox h={132} radius={18} seed="timer" style={{ padding: "0 30px 0 22px" }}>
      <svg width={92} height={100} viewBox="0 0 92 100" style={{ flex: "0 0 auto", marginRight: 20 }}>
        <rect x={38} y={2} width={16} height={12} rx={3} fill={CARD.outline} />
        <circle cx={46} cy={56} r={38} fill="#F7F0E1" stroke={CARD.outline} strokeWidth={6} />
        <line x1={46} y1={56} x2={46 + Math.sin((s / 60) * Math.PI * 2 * 6) * 26} y2={56 - Math.cos((s / 60) * Math.PI * 2 * 6) * 26} stroke={stopped ? CARD.red : CARD.outline} strokeWidth={6} strokeLinecap="round" />
        <circle cx={46} cy={56} r={5} fill={CARD.outline} />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ fontFamily: FONTS.title, fontWeight: 900, fontSize: 36, color: CARD.ink, whiteSpace: "nowrap", lineHeight: 1 }}>{label}</div>
        <div style={{ fontFamily: FONTS.title, fontWeight: 900, fontSize: 84, color: stopped ? CARD.red : CARD.gold, lineHeight: 1, whiteSpace: "nowrap", paddingTop: 4 }}>{txt}</div>
      </div>
    </PaperBox>
  );
};

/** Score tag: coloured square with a big white number (+ small "/10"), dark outline. */
export const ScoreTag: React.FC<{ value: string; of?: string; color?: string; label?: string }> = ({ value, of = "/10", color, label }) => {
  const c = colorOf(color ?? "red");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {label ? (
        <div style={{ marginBottom: 8 }}>
          <PaperBox h={58} radius={12} seed={`lbl${label}`} style={{ padding: "0 18px" }}>
            <div style={{ fontFamily: FONTS.title, fontWeight: 900, fontSize: 28, color: CARD.ink, whiteSpace: "nowrap", lineHeight: 1, paddingTop: 3 }}>{label}</div>
          </PaperBox>
        </div>
      ) : null}
      <div style={{ width: 150, height: 132, background: c, border: `4px solid ${CARD.outline}`, borderRadius: 14, boxShadow: "0 6px 14px rgba(0,0,0,0.4)", display: "flex", alignItems: "baseline", justifyContent: "center", paddingTop: 10, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${paperTex})`, backgroundSize: "400px 400px", mixBlendMode: "multiply", opacity: 0.35 }} />
        <div style={{ position: "relative", fontFamily: FONTS.title, fontWeight: 900, fontSize: 92, color: "#FFFFFF", lineHeight: 1 }}>{value}</div>
        <div style={{ position: "relative", fontFamily: FONTS.title, fontWeight: 900, fontSize: 30, color: "#FFFFFF", lineHeight: 1, marginLeft: 2, opacity: 0.9 }}>{of}</div>
      </div>
    </div>
  );
};

/** Rubber stamp (ROASTED / NO SALE / FREE): distressed caps in a double border, slams 1.6 → 1 with 10° → 0°. */
export const Stamp: React.FC<{ text: string; color?: string; t: number; at: number; size?: number; rot?: number }> = ({ text, color, t, at, size = 96, rot = -8 }) => {
  if (t < at) return null;
  const k = Math.min(1, (t - at) / 0.16);
  const e = 1 - Math.pow(1 - k, 3);
  const scale = 1.7 - 0.7 * e;
  const r = rot + 12 * (1 - e);
  const c = colorOf(color ?? "red");
  const id = `grunge-${text.replace(/\W/g, "")}`;
  return (
    <div style={{ transform: `rotate(${r}deg) scale(${scale})`, opacity: Math.min(1, k * 3), filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.35))" }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.5" result="m" />
          <feComposite in="SourceGraphic" in2="m" operator="in" />
        </filter>
      </svg>
      <div style={{ position: "relative" }}>
        {/* an opaque #F4ECDA knock-out behind the letters so the stamp reads over text and faces */}
        <div style={{ position: "absolute", inset: size * 0.03, borderRadius: size * 0.16, background: "rgba(244,236,218,0.86)" }} />
        <div style={{ position: "relative", filter: `url(#${id})`, border: `${Math.round(size * 0.09)}px solid ${c}`, borderRadius: size * 0.18, padding: `${size * 0.08}px ${size * 0.28}px`, background: "rgba(255,255,255,0.0)" }}>
          <div style={{ border: `${Math.round(size * 0.04)}px solid ${c}`, borderRadius: size * 0.1, padding: `${size * 0.05}px ${size * 0.22}px`, fontFamily: FONTS.title, fontWeight: 900, fontSize: size, lineHeight: 1, color: c, whiteSpace: "nowrap", paddingTop: size * 0.12 }}>{text}</div>
        </div>
      </div>
    </div>
  );
};

/** 4-point sparkle star (✦), scales in/out over `dur`. */
export const Sparkle: React.FC<{ x: number; y: number; t: number; at: number; size?: number; color?: string; dur?: number }> = ({ x, y, t, at, size = 46, color = "#FFF4C8", dur = 0.5 }) => {
  const k = (t - at) / dur;
  if (k < 0 || k > 1) return null;
  const s = Math.sin(k * Math.PI);
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, transform: `scale(${s}) rotate(${k * 40}deg)`, filter: `drop-shadow(0 0 6px ${color})` }}>
      <path d="M0 -50 C 6 -10 10 -6 50 0 C 10 6 6 10 0 50 C -6 10 -10 6 -50 0 C -10 -6 -6 -10 0 -50 Z" fill={color} />
    </svg>
  );
};

const CONFETTI_COLS = ["#E2683F", "#E0A01E", "#2E9E4F", "#2F6FD8", "#E85D9B", "#F4ECDA", "#7457CF"];
/** Confetti burst: ~46 paper flecks thrown up and out from (x, y), gravity, flutter, fade. */
export const Confetti: React.FC<{ x: number; y: number; t: number; at: number; n?: number; spread?: number }> = ({ x, y, t, at, n = 46, spread = 1 }) => {
  const dt = t - at;
  if (dt < 0 || dt > 1.8) return null;
  return (
    <>
      {Array.from({ length: n }).map((_, i) => {
        const a = (hash01(`cf${i}a`) - 0.5) * Math.PI * 1.25 - Math.PI / 2;
        const v = (520 + hash01(`cf${i}v`) * 720) * spread;
        const vx = Math.cos(a) * v;
        const vy = Math.sin(a) * v;
        const drag = Math.exp(-dt * 1.6);
        const px = x + (vx * (1 - drag)) / 1.6 + Math.sin(dt * 9 + i) * 14;
        const py = y + (vy * (1 - drag)) / 1.6 + 520 * dt * dt;
        const rot = (hash01(`cf${i}r`) - 0.5) * 720 * dt + i * 37;
        const w = 12 + hash01(`cf${i}w`) * 12;
        const flip = Math.abs(Math.cos(dt * (6 + hash01(`cf${i}f`) * 8) + i));
        const op = dt > 1.3 ? Math.max(0, 1 - (dt - 1.3) / 0.5) : 1;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px - w / 2,
              top: py - w * 0.3,
              width: w,
              height: w * 0.6 * Math.max(0.15, flip),
              background: CONFETTI_COLS[i % CONFETTI_COLS.length],
              transform: `rotate(${rot.toFixed(1)}deg)`,
              opacity: op,
              boxShadow: "0 2px 3px rgba(0,0,0,0.25)",
            }}
          />
        );
      })}
    </>
  );
};

/** A plain 5-point star (card icon). */
export const Starburst: React.FC<{ size: number; color?: string; style?: React.CSSProperties }> = ({ size, color = "#E8705A", style }) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 46 : 20;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" style={style}>
      <polygon points={pts} fill={color} />
    </svg>
  );
};

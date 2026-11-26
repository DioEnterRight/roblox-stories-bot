/**
 * Screen inserts: a laptop or phone app floats over the (defocused) 3D shot so a joke can be READ — the calendar with
 * every meeting cancelled, the bank balance, mom's text, the LinkedIn post. Pure function of t.
 *
 * props.insert = { device: "laptop" | "phone", app: "calendar" | "email" | "bank" | "chat" | "notes" | "social" | "search",
 *                  title, lines: ["..."], highlight?: n, strike?: [n...] }
 * Chat lines starting with "<" are incoming bubbles, ">" outgoing. Lines appear one by one: on {fire:"line", payload:{id:"insert"}}
 * anchors (in order) or, without anchors, 0.28 s apart from the cut. A highlighted line pulses; struck lines get a red strike.
 */
import React from "react";
import { clamp01, easeOutCubic, popIn } from "../anim";
import { FONTS } from "./fonts";

export type InsertSpec = { device?: "laptop" | "phone"; app?: string; title?: string; lines?: string[]; highlight?: number; strike?: number[]; accent?: string };

// letter badges instead of emoji: the render machine may have no colour-emoji font
const APP: Record<string, { bar: string; icon: string; name: string }> = {
  calendar: { bar: "#3C6FE0", icon: "31", name: "Calendar" },
  email: { bar: "#D9402F", icon: "@", name: "Inbox" },
  bank: { bar: "#2E9E4F", icon: "$", name: "Bank" },
  chat: { bar: "#1F8F6A", icon: "…", name: "Messages" },
  notes: { bar: "#E0A01E", icon: "N", name: "Notes" },
  social: { bar: "#2F6FD8", icon: "in", name: "Feed" },
  search: { bar: "#5A5F6E", icon: "?", name: "Search" },
};

const Line: React.FC<{ text: string; k: number; hi: boolean; struck: boolean; t: number; chat: boolean; accent: string; size: number }> = ({ text, k, hi, struck, t, chat, accent, size }) => {
  if (k <= 0) return null;
  const incoming = chat && text.startsWith("<");
  const outgoing = chat && text.startsWith(">");
  const body = chat ? text.replace(/^[<>]\s*/, "") : text;
  const pulse = hi ? 1 + 0.03 * Math.sin(t * 9) : 1;
  const style: React.CSSProperties = {
    opacity: k,
    transform: `translateY(${((1 - easeOutCubic(k)) * 18).toFixed(1)}px) scale(${pulse.toFixed(3)})`,
    fontFamily: FONTS.ui,
    fontWeight: 800,
    fontSize: size,
    lineHeight: 1.15,
    color: "#1E1D24",
    position: "relative",
  };
  if (chat) {
    return (
      <div style={{ display: "flex", justifyContent: outgoing ? "flex-end" : "flex-start", margin: "10px 0" }}>
        <div
          style={{
            ...style,
            maxWidth: "82%",
            padding: "14px 20px",
            borderRadius: 26,
            background: outgoing ? accent : "#ECEEF2",
            color: outgoing ? "#FFFFFF" : "#1E1D24",
            borderBottomRightRadius: outgoing ? 6 : 26,
            borderBottomLeftRadius: incoming ? 6 : 26,
          }}
        >
          {body}
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...style, padding: "12px 18px", margin: "8px 0", borderRadius: 14, background: hi ? "#FFF2B8" : "#F3F4F7", border: hi ? "4px solid #E0A01E" : "4px solid transparent" }}>
      {body}
      {struck ? <div style={{ position: "absolute", left: 10, right: 10, top: "50%", height: 6, background: "#D9402F", borderRadius: 3, transformOrigin: "0 50%", transform: `scaleX(${k.toFixed(3)})` }} /> : null}
    </div>
  );
};

export const Insert: React.FC<{ spec: InsertSpec; t: number; showAt: number; lineAts: number[] }> = ({ spec, t, showAt, lineAts }) => {
  if (t < showAt) return null;
  const device = spec.device ?? "laptop";
  const app = APP[spec.app ?? "notes"] ?? APP.notes;
  const lines = (spec.lines ?? []).slice(0, device === "phone" ? 6 : 5);
  const k = popIn(t, showAt, 0.26, 1.2);
  const float = Math.sin(t * 1.4) * 4;
  const accent = spec.accent ?? "#2F6FD8";
  const chat = spec.app === "chat";
  const times = lines.map((_, i) => lineAts[i] ?? showAt + 0.2 + i * 0.28);
  const lineK = (i: number) => clamp01((t - times[i]) / 0.18);
  const isPhone = device === "phone";
  const W = isPhone ? 600 : 940;
  const H = isPhone ? 1000 : 640;
  const top = isPhone ? 190 : 330;
  const fontSize = isPhone ? 40 : 42;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: `rgba(10,10,20,${(0.28 * clamp01((t - showAt) / 0.2)).toFixed(3)})` }} />
      <div style={{ position: "absolute", left: (1080 - W) / 2, top: top + float, width: W, height: H, transform: `scale(${Math.max(0.001, k).toFixed(4)})`, transformOrigin: "50% 60%" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: isPhone ? 64 : 26,
            background: "#16161C",
            boxShadow: "0 30px 60px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.35)",
            padding: isPhone ? 18 : 16,
          }}
        >
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: isPhone ? 48 : 14, overflow: "hidden", background: "#FFFFFF" }}>
            <div style={{ height: isPhone ? 150 : 86, background: app.bar, display: "flex", alignItems: isPhone ? "flex-end" : "center", padding: isPhone ? "0 30px 22px" : "0 26px", gap: 16 }}>
              <span style={{ width: isPhone ? 64 : 56, height: isPhone ? 64 : 56, borderRadius: 16, background: "#FFFFFF", color: app.bar, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.title, fontWeight: 900, fontSize: isPhone ? 32 : 28, flex: "0 0 auto" }}>{app.icon}</span>
              <span style={{ fontFamily: FONTS.title, fontWeight: 900, fontSize: isPhone ? 46 : 42, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{spec.title ?? app.name}</span>
            </div>
            <div style={{ padding: isPhone ? "18px 26px" : "16px 26px" }}>
              {lines.map((l, i) => (
                <Line key={i} text={l} k={lineK(i)} hi={spec.highlight === i} struck={(spec.strike ?? []).includes(i)} t={t} chat={chat} accent={accent} size={fontSize} />
              ))}
            </div>
          </div>
        </div>
        {!isPhone ? <div style={{ position: "absolute", left: -60, right: -60, bottom: -34, height: 34, borderRadius: "0 0 30px 30px", background: "linear-gradient(#C9CDD6, #8E939E)" }} /> : null}
      </div>
    </div>
  );
};

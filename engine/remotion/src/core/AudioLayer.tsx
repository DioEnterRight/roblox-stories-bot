import React from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import type { ReelSpec } from "./types";

const dbToGain = (db: number) => Math.pow(10, db / 20);
/** Every source is mixed 6 dB down so voice + bed + SFX never clip inside Remotion's mix;
 *  pipeline/render.mjs restores +6 dB in front of its 4×-oversampled limiter. */
export const MIX_HEADROOM_DB = -6;
const HR = dbToGain(MIX_HEADROOM_DB);

/** Voice (mastered), optional music bed and word-anchored sound effects. */
export const AudioLayer: React.FC<{ reel: ReelSpec }> = ({ reel }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const base = `projects/${reel.slug}/`;
  const music = reel.audio.music;
  // speech spans (words merged across gaps < 0.25 s) for optional bed ducking
  const spans: Array<[number, number]> = [];
  for (const l of reel.lines) for (const w of l.words) {
    const last = spans[spans.length - 1];
    if (last && w.s - last[1] < 0.25) last[1] = Math.max(last[1], w.e); else spans.push([w.s, w.e]);
  }
  return (
    <>
      <Audio src={staticFile(base + reel.audio.voice)} volume={HR} />
      {music ? (
        <Sequence from={Math.round((music.startAt ?? 0) * fps)} premountFor={fps}>
          <Audio
            src={music.file.startsWith("/") || music.file.includes("://") ? music.file : staticFile(music.file.startsWith("music/") ? music.file : base + music.file)}
            volume={(f) => {
              const fade = Math.round((music.fadeOutSec ?? 1.5) * fps);
              const remain = durationInFrames - f;
              const fadeMul = remain < fade ? Math.max(0, remain / fade) : 1;
              const fadeInFrames = Math.max(1, Math.round((music.fadeInSec ?? 0.5) * fps));
              const fadeIn = f < fadeInFrames ? f / fadeInFrames : 1;
              // mute windows: digital silence for reveals/punchlines, 0.06 s ramps either side
              const t = (f + Math.round((music.startAt ?? 0) * fps)) / fps;
              const ramp = 0.06;
              let muteMul = 1;
              for (const m of music.mutes ?? []) {
                if (t >= m.from - ramp && t <= m.to + ramp) {
                  const a = Math.min(1, Math.max(0, (m.from - t) / ramp));
                  const b = Math.min(1, Math.max(0, (t - m.to) / ramp));
                  muteMul = Math.min(muteMul, Math.max(a, b));
                }
              }
              let duckMul = 1;
              if (music.duckDb) {
                const r = music.duckRampSec ?? 0.12;
                let k = 0;
                for (const [a, b] of spans) {
                  if (t < a - r) break;
                  if (t <= b + r) k = Math.max(k, Math.min(1, (t - (a - r)) / r, (b + r - t) / r));
                }
                duckMul = 1 + (dbToGain(music.duckDb) - 1) * k;
              }
              return HR * dbToGain(music.gainDb) * fadeMul * fadeIn * muteMul * duckMul;
            }}
          />
        </Sequence>
      ) : null}
      {(reel.audio.sfx ?? []).map((s, i) => (
        <Sequence key={i} from={Math.round(s.at * fps)} premountFor={fps}>
          <Audio src={s.file.startsWith("sfx/") ? staticFile(s.file) : staticFile(base + s.file)} volume={HR * dbToGain(s.gainDb ?? -6)} />
        </Sequence>
      ))}
    </>
  );
};

import type { CaptionSpec, CaptionState, CaptionWord, Line, Word } from "../types";

export type WordGroup = { lineIndex: number; words: Word[]; start: number; end: number; speaker: string };

const PUNCT_END = /[.!?…]$/;
const PUNCT_SOFT = /[,;:]$/;

/**
 * Split the voiced lines into caption groups. Deterministic, cheap — recomputed per frame is fine,
 * but callers should memoize on (lines, spec).
 */
export const buildGroups = (lines: Line[], spec: CaptionSpec): WordGroup[] => {
  const groups: WordGroup[] = [];
  const maxWords = spec.maxWords ?? (spec.groupBy === "word" ? 1 : spec.groupBy === "line" ? 999 : 4);
  const gapSplit = spec.gapSplitSec ?? 0.45;
  lines.forEach((line, lineIndex) => {
    if (spec.groupBy === "line") {
      if (line.words.length) groups.push({ lineIndex, words: line.words, start: line.words[0].s, end: line.words[line.words.length - 1].e, speaker: line.speaker });
      return;
    }
    let cur: Word[] = [];
    const flush = () => {
      if (cur.length) groups.push({ lineIndex, words: cur, start: cur[0].s, end: cur[cur.length - 1].e, speaker: line.speaker });
      cur = [];
    };
    line.words.forEach((w, i) => {
      const prev = line.words[i - 1];
      if (prev && w.s - prev.e > gapSplit) flush();
      cur.push(w);
      const hardStop = PUNCT_END.test(w.w);
      const softStop = PUNCT_SOFT.test(w.w) && cur.length >= Math.max(2, Math.floor(maxWords / 2));
      if (cur.length >= maxWords || hardStop || softStop) flush();
    });
    flush();
  });
  return groups;
};

/**
 * The caption state at reel time `t` (seconds).
 * A group becomes active `leadSec` before its first word is spoken and stays until the next group
 * becomes active or `holdSec` after its last word ends.
 */
export const getCaptionState = (lines: Line[], spec: CaptionSpec, groups: WordGroup[], t: number): CaptionState => {
  const lead = spec.leadSec ?? 0;
  const hold = spec.holdSec ?? 0.6;
  let gi = -1;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const activeFrom = g.start - lead;
    const next = groups[i + 1];
    const activeTo = next ? Math.min(next.start - lead, g.end + hold) : g.end + hold;
    if (t >= activeFrom && t < Math.max(activeTo, activeFrom + 0.05)) {
      gi = i;
      break;
    }
  }
  if (gi < 0) {
    return { visible: false, lineIndex: -1, groupIndex: -1, words: [], groupStart: 0, groupEnd: 0, speaker: "", t };
  }
  const g = groups[gi];
  let currentIdx = -1;
  const words: CaptionWord[] = g.words.map((w, index) => {
    const appearAt = w.s - lead;
    const age = t - appearAt;
    if (age >= 0) currentIdx = index;
    return { ...w, appearAt, age, state: "upcoming", index };
  });
  words.forEach((w, i) => {
    w.state = i < currentIdx ? "spoken" : i === currentIdx ? "current" : "upcoming";
  });
  const accentSet = new Set((spec.accentWords ?? []).map((s) => s.toLowerCase()));
  words.forEach((w) => {
    if (!w.accent && accentSet.size && accentSet.has(w.w.toLowerCase().replace(/[^a-z0-9$%']/g, ""))) w.accent = true;
  });
  return {
    visible: true,
    lineIndex: g.lineIndex,
    line: lines[g.lineIndex],
    groupIndex: gi,
    words,
    groupStart: g.start - lead,
    groupEnd: g.end + hold,
    speaker: g.speaker,
    t,
  };
};

#!/usr/bin/env node
/**
 * plan.mjs — resolve a word-anchored plan into a fully timed reel.json.
 *
 *   node engine/scripts/plan.mjs <project>            reads <project>/plan.json + words.json → writes reel.json
 *   node engine/scripts/plan.mjs <project> --check    validate only
 *
 * plan.json (written by pipeline/compiler.py):
 * {
 *   "niche": "ceo", "meta": {...}, "captions": {...optional overrides...},
 *   "audio": { "voice": "audio.master.wav", "music": {...}, "sfx": [...] },
 *   "accents": ["shop", "maze"],            // caption accent words (global); "lineAccents": {"l2": ["maze"]} per line
 *   "scenes": [
 *     { "id": "s1", "archetype": "StatCard", "props": {...},
 *       "start": {"line":"l1","word":"million"} | {"sec": 0} | "prev",          // default "prev" (= previous scene end); first scene defaults to 0
 *       "end":   {"line":"l2","word":"frame","offset":0.2} | {"sec": 3.1} | "next" | {"after": 2.5},  // default "next" (= next scene start); last defaults to the end
 *       "anchors": [ {"fire":"stamp", "at": {"line":"l1","word":"never"} } ],
 *       ...any Scene fields (label, labelRight, display, cast, camera, set, transitionIn/Out, captions)
 *     }
 *   ],
 *   "tailSec": 0.5
 * }
 * Every boundary between two scenes needs ONE anchor: either the earlier scene's "end" or the later scene's "start".
 * Word refs: {"line":"l2","word":"shop"} = first word of that line matching (or starting with) the text, case/punctuation-insensitive;
 * "occurrence": 2 picks the second match; "wordIndex": n picks by index (negative from the end); "edge": "end" uses the word's END;
 * "offset" adds seconds. {"line":"l2"} alone = the line's start (or its end with edge:"end").
 */
import fs from "node:fs";
import path from "node:path";
import { fail, log, mediaDuration, normWord, parseArgs, readJson, resolveProject, warn, writeJson, REMOTION_ROOT } from "./lib/project.mjs";

const args = parseArgs(process.argv.slice(2));
const { slug, dir } = resolveProject(args._[0]);
const planPath = path.join(dir, "plan.json");
const wordsPath = path.join(dir, "words.json");
if (!fs.existsSync(planPath)) fail(`Missing ${planPath}`);
if (!fs.existsSync(wordsPath)) fail(`Missing ${wordsPath} — the pipeline writes it (pipeline/voice.py)`);
const plan = readJson(planPath);
const words = readJson(wordsPath);
const lines = words.lines;
const lineById = new Map(lines.map((l) => [l.id, l]));
const problems = [];

const resolveRef = (ref, ctx) => {
  if (ref === undefined || ref === null) return undefined;
  if (typeof ref === "number") return ref;
  if (typeof ref !== "object") return undefined;
  if (typeof ref.sec === "number") return ref.sec + (ref.offset ?? 0);
  if (!ref.line) return undefined;
  const line = lineById.get(ref.line);
  if (!line) {
    problems.push(`${ctx}: unknown line "${ref.line}" (known: ${[...lineById.keys()].join(", ")})`);
    return undefined;
  }
  if (typeof ref.wordIndex === "number") {
    const w = line.words.at(ref.wordIndex);
    if (!w) problems.push(`${ctx}: wordIndex ${ref.wordIndex} out of range in line ${ref.line}`);
    return w ? (ref.edge === "end" ? w.e : w.s) + (ref.offset ?? 0) : undefined;
  }
  if (ref.word) {
    const target = normWord(ref.word);
    // exact matches win; prefix matching ("CEO" → "CEO's") only when no exact match exists ("a" must not hit "and")
    const exact = line.words.filter((x) => normWord(x.w) === target);
    const matches = exact.length ? exact : line.words.filter((x) => normWord(x.w).startsWith(target));
    const w = matches[(ref.occurrence ?? 1) - 1];
    if (!w) {
      problems.push(`${ctx}: word "${ref.word}" not found in line ${ref.line} ("${line.text}")`);
      return undefined;
    }
    return (ref.edge === "end" ? w.e : w.s) + (ref.offset ?? 0);
  }
  return (ref.edge === "end" ? line.end : line.start) + (ref.offset ?? 0);
};

// caption accents
const accentSet = new Set((plan.accents ?? []).map(normWord));
for (const l of lines) for (const w of l.words) if (accentSet.has(normWord(w.w))) w.accent = true;
for (const [lineId, list] of Object.entries(plan.lineAccents ?? {})) {
  const line = lineById.get(lineId);
  if (!line) {
    problems.push(`lineAccents: unknown line ${lineId}`);
    continue;
  }
  const set = new Set(list.map(normWord));
  for (const w of line.words) if (set.has(normWord(w.w))) w.accent = true;
}

// total length
const voiceFile = plan.audio?.voice ? path.join(dir, plan.audio.voice) : null;
const audioDur = voiceFile && fs.existsSync(voiceFile) ? mediaDuration(voiceFile) : words.duration ?? 0;
if (voiceFile && !fs.existsSync(voiceFile)) problems.push(`audio.voice not found: ${voiceFile}`);
const lastWordEnd = lines.length ? lines[lines.length - 1].end : 0;
const totalEnd = Math.max(audioDur, lastWordEnd) + (plan.tailSec ?? 0.5);

// explicit anchors first
const src = plan.scenes ?? [];
if (!src.length) fail("plan.json has no scenes");
const explicitStart = src.map((s, i) => (s.start === undefined || s.start === "prev" ? undefined : resolveRef(s.start, `scene ${s.id ?? i} start`)));
const explicitEnd = src.map((s, i) => (s.end === undefined || s.end === "next" || (typeof s.end === "object" && typeof s.end.after === "number") ? undefined : resolveRef(s.end, `scene ${s.id ?? i} end`)));
const after = src.map((s) => (typeof s.end === "object" && typeof s.end?.after === "number" ? s.end.after : undefined));

const starts = new Array(src.length).fill(undefined);
const ends = new Array(src.length).fill(undefined);
starts[0] = explicitStart[0] ?? 0;
for (let i = 1; i < src.length; i++) {
  const prevId = src[i - 1].id ?? `s${i}`;
  const curId = src[i].id ?? `s${i + 1}`;
  let boundary;
  if (explicitStart[i] !== undefined) boundary = explicitStart[i];
  else if (explicitEnd[i - 1] !== undefined) boundary = explicitEnd[i - 1];
  else if (after[i - 1] !== undefined && starts[i - 1] !== undefined) boundary = starts[i - 1] + after[i - 1];
  else {
    problems.push(`no anchor between ${prevId} and ${curId}: give ${prevId} an "end" or ${curId} a "start"`);
    boundary = starts[i - 1] !== undefined ? starts[i - 1] + 2 : 0;
  }
  if (explicitStart[i] !== undefined && explicitEnd[i - 1] !== undefined && Math.abs(explicitStart[i] - explicitEnd[i - 1]) > 0.05) {
    warn(`${prevId} ends at ${explicitEnd[i - 1].toFixed(2)} but ${curId} starts at ${explicitStart[i].toFixed(2)} — using both (overlap/gap handled by transitions)`);
  }
  ends[i - 1] = explicitEnd[i - 1] ?? (after[i - 1] !== undefined && starts[i - 1] !== undefined ? starts[i - 1] + after[i - 1] : boundary);
  starts[i] = explicitStart[i] ?? boundary;
}
const last = src.length - 1;
ends[last] = explicitEnd[last] ?? (after[last] !== undefined ? starts[last] + after[last] : totalEnd);

const scenes = src.map((s, i) => {
  const out = { ...s, id: s.id ?? `s${i + 1}`, props: s.props ?? {}, start: starts[i], end: ends[i] };
  if (s.anchors) {
    out.anchors = s.anchors
      .map((a) => ({ fire: a.fire, at: resolveRef(a.at, `scene ${out.id} anchor ${a.fire}`), payload: a.payload }))
      .filter((a) => typeof a.at === "number");
  } else delete out.anchors;
  return out;
});

// sanity, gaps, rounding
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  if (!(s.end > s.start)) problems.push(`scene ${s.id}: end (${s.end?.toFixed?.(2)}) must be after start (${s.start?.toFixed?.(2)})`);
  if (i > 0 && s.start < scenes[i - 1].start) problems.push(`scene ${s.id} starts before ${scenes[i - 1].id}`);
  if (i > 0) {
    const gap = s.start - scenes[i - 1].end;
    if (gap > 0.06) {
      warn(`gap of ${gap.toFixed(2)}s between ${scenes[i - 1].id} and ${s.id} — extending ${scenes[i - 1].id}`);
      scenes[i - 1].end = s.start;
    }
  }
}
if (scenes[0].start > 0.05) {
  warn(`first scene starts at ${scenes[0].start.toFixed(2)}s — moving it to 0`);
  scenes[0].start = 0;
}
if (scenes[last].end < totalEnd - 0.01) {
  warn(`last scene ends at ${scenes[last].end.toFixed(2)}s but the reel lasts ${totalEnd.toFixed(2)}s — extending it`);
  scenes[last].end = totalEnd;
}
for (const s of scenes) {
  s.start = Math.round(s.start * 1000) / 1000;
  s.end = Math.round(s.end * 1000) / 1000;
  const d = s.end - s.start;
  if (d < 0.6) warn(`scene ${s.id} is very short (${d.toFixed(2)}s)`);
  if (d > 9) warn(`scene ${s.id} is long (${d.toFixed(2)}s) — consider splitting or adding anchors`);
}
for (const l of lines) for (const w of l.words) if (!scenes.some((s) => w.s >= s.start - 0.001 && w.s < s.end + 0.001)) problems.push(`word "${w.w}" (${w.s}s) is not covered by any scene`);

// sound effects may be anchored to words too: { "file": "sfx/pop.wav", "at": {"line":"l3","word":"stamp"}, "gainDb": -12 }
// Optional audio: a sound effect or music bed whose file is not on disk is skipped with a warning, never a failed render.
const publicFileExists = (f, folder) => fs.existsSync(path.join(REMOTION_ROOT, "public", f)) || fs.existsSync(path.join(dir, f)) || fs.existsSync(path.join(REMOTION_ROOT, "public", folder, f));
const wantedSfx = plan.audio?.sfx ?? [];
const presentSfx = wantedSfx.filter((x) => publicFileExists(x.file, "sfx"));
if (presentSfx.length < wantedSfx.length) warn(`skipping ${wantedSfx.length - presentSfx.length} sound effect(s): file not found (the pipeline writes them: pipeline/music.py ensure_sfx)`);
const sfx = presentSfx.map((x, i) => ({ ...x, at: typeof x.at === "number" ? x.at : resolveRef(x.at, `sfx ${i} (${x.file})`) }));
for (const x of sfx) if (typeof x.at !== "number") problems.push(`sfx ${x.file}: could not resolve "at"`);
// music mute windows may be anchored to words: "mutes": [{ "from": {"line":"l12","edge":"end"}, "to": {"line":"l13","offset":-0.05} }]
let music = plan.audio?.music ? { ...plan.audio.music } : undefined;
if (music && !music.file.includes("://") && !publicFileExists(music.file, "music")) {
  warn(`skipping the music bed: ${music.file} not found (the pipeline writes music.wav into the project)`);
  music = undefined;
}
if (music?.mutes) {
  music.mutes = music.mutes.map((m, i) => ({ from: typeof m.from === "number" ? m.from : resolveRef(m.from, `music mute ${i} from`), to: typeof m.to === "number" ? m.to : resolveRef(m.to, `music mute ${i} to`) }));
  for (const m of music.mutes) if (typeof m.from !== "number" || typeof m.to !== "number") problems.push("music mute window could not be resolved");
}

if (problems.length) {
  console.error("✖ plan problems:\n  - " + problems.join("\n  - "));
  process.exit(1);
}

const meta = { ...(plan.meta ?? { title: slug, topic: slug }) };

const reel = {
  version: 1,
  niche: plan.niche,
  slug,
  meta,
  fps: plan.fps ?? 30,
  width: 1080,
  height: 1920,
  durationSec: Math.round(totalEnd * 1000) / 1000,
  audio: { ...(plan.audio ?? { voice: "audio.master.wav" }), sfx: sfx.map((x) => ({ ...x, at: Math.round(x.at * 1000) / 1000 })), music },
  lines,
  captions: plan.captions ?? {},
  scenes,
  style: plan.style,
};
if (!reel.niche) fail('plan.json needs a "niche" id');
if (args.check) {
  log(`plan OK: ${scenes.length} scenes, ${reel.durationSec}s, ${lines.length} lines, ${lines.reduce((n, l) => n + l.words.length, 0)} words`);
  process.exit(0);
}
writeJson(path.join(dir, "reel.json"), reel);
log(`wrote ${path.join(dir, "reel.json")} — ${scenes.length} scenes, ${reel.durationSec}s`);
for (const s of scenes) log(`  ${String(s.id).padEnd(6)} ${s.start.toFixed(2).padStart(6)} → ${s.end.toFixed(2).padStart(6)}  ${s.archetype}${s.label ? "  " + s.label : ""}`);

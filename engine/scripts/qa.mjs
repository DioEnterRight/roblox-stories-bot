#!/usr/bin/env node
/**
 * qa.mjs — "watch its own video": frames, contact sheet, motion/static check, caption coverage.
 *
 *   node engine/scripts/qa.mjs <project> [--master | --video <file>] [--fps 2] [--static-max 0.9]
 *   (default: renders/<slug>/<slug>.mp4 = the latest render; --master: <slug>.master.mp4 = the latest --hq master)
 * Writes renders/<slug>/qa/{frames/, sheet.png, report.json, report.md}
 * Motion check: per-frame mean absolute difference (full frame rate, downscaled) → flags
 * static stretches ≥ 0.9 s (flat moments) and over-busy stretches.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fail, FFMPEG, log, parseArgs, readJson, resolveProject, RENDERS_ROOT, REMOTION_ROOT } from "./lib/project.mjs";

const args = parseArgs(process.argv.slice(2));
const { slug, dir } = resolveProject(args._[0]);
const outDir = path.join(RENDERS_ROOT, slug);
const video = args.video ? path.resolve(args.video) : path.join(outDir, args.master ? `${slug}.master.mp4` : `${slug}.mp4`);
if (!fs.existsSync(video)) fail(`No render found at ${video} — run engine/scripts/render.mjs first`);
const reel = readJson(path.join(dir, "reel.json"));
// A niche may allow longer holds: style.json → "qa": { "staticMaxSec": 2.0 }
const nicheStylePath = path.join(REMOTION_ROOT, "src", "niches", reel.niche, "style.json");
const nicheQa = fs.existsSync(nicheStylePath) ? (JSON.parse(fs.readFileSync(nicheStylePath, "utf8")).qa ?? {}) : {};
const staticMaxSec = Number(args["static-max"] ?? reel.style?.qa?.staticMaxSec ?? nicheQa.staticMaxSec ?? 0.9);
const qaDir = path.join(outDir, "qa");
fs.rmSync(qaDir, { recursive: true, force: true });
fs.mkdirSync(path.join(qaDir, "frames"), { recursive: true });
const sheetFps = Number(args.fps ?? 2);

// 1. frames for the agent to look at (2 fps, 540px wide) + contact sheet (1 fps)
spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-vf", `fps=${sheetFps},scale=540:-1`, path.join(qaDir, "frames", "f_%04d.png")], { stdio: "inherit" });
const dur = reel.durationSec;
const cols = 6;
const rows = Math.max(1, Math.ceil(Math.ceil(dur) / cols));
spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-vf", `fps=1,scale=240:-1,tile=${cols}x${rows}`, path.join(qaDir, "sheet.png")], { stdio: "inherit" });

// 2. motion energy at full frame rate: decode to tiny grey frames and diff in Node
const w = 54;
const h = 96;
const raw = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", video, "-vf", `scale=${w}:${h},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
const buf = raw.stdout;
const n = Math.floor(buf.length / (w * h));
const energy = [];
for (let i = 1; i < n; i++) {
  let sum = 0;
  const a = i * w * h;
  const b = (i - 1) * w * h;
  for (let p = 0; p < w * h; p++) sum += Math.abs(buf[a + p] - buf[b + p]);
  energy.push(sum / (w * h));
}
const fps = reel.fps || 30;
// "static" = frame-to-frame change below the reel's own noise floor (film grain keeps a still picture from reading 0) + 0.35.
// Floor = the 3rd percentile of the motion series, so grainy niches are judged against their grain, clean ones against ~0.
const sortedEnergy = [...energy].sort((a, b) => a - b);
const noiseFloor = sortedEnergy.length ? sortedEnergy[Math.floor(sortedEnergy.length * 0.03)] : 0;
const staticThresh = Math.max(0.35, noiseFloor + 0.35);
const busyThresh = 18;
const stretches = [];
let runStart = -1;
for (let i = 0; i < energy.length; i++) {
  const isStatic = energy[i] < staticThresh;
  if (isStatic && runStart < 0) runStart = i;
  if ((!isStatic || i === energy.length - 1) && runStart >= 0) {
    const len = (i - runStart) / fps;
    if (len >= staticMaxSec) stretches.push({ from: +(runStart / fps).toFixed(2), to: +(i / fps).toFixed(2), len: +len.toFixed(2) });
    runStart = -1;
  }
}
const busy = [];
for (let i = 0; i < energy.length; i++) if (energy[i] > busyThresh) busy.push(+(i / fps).toFixed(2));
const cuts = [];
for (let i = 1; i < energy.length; i++) if (energy[i] > 40 && energy[i] > 3 * (energy[i - 1] + 1)) cuts.push(+(i / fps).toFixed(2));

// 3. caption coverage + scene timing checks (structural)
const issues = [];
for (let i = 1; i < reel.scenes.length; i++) {
  const gap = reel.scenes[i].start - reel.scenes[i - 1].end;
  if (gap > 0.06) issues.push(`gap ${gap.toFixed(2)}s between ${reel.scenes[i - 1].id} and ${reel.scenes[i].id}`);
}
for (const s of reel.scenes) if (s.end - s.start > 8) issues.push(`scene ${s.id} is ${(s.end - s.start).toFixed(1)}s long`);
const words = reel.lines.flatMap((l) => l.words);
const spanStart = words.length ? words[0].s : 0;
const spanEnd = words.length ? words[words.length - 1].e : 0;
const silentHead = spanStart;
const silentTail = reel.durationSec - spanEnd;
if (silentHead > 0.8) issues.push(`voice starts late (${silentHead.toFixed(2)}s of silence at the start)`);
if (silentTail > 1.5) issues.push(`long silent tail (${silentTail.toFixed(2)}s)`);
for (const s of stretches) issues.push(`static picture ${s.from}s → ${s.to}s (${s.len}s)`);

// single-frame glitch: a frame whose mean brightness jumps >3 levels vs BOTH neighbours while the neighbours agree (<1)
const means = [];
for (let i = 0; i < n; i++) { let acc = 0; const o = i * w * h; for (let p = 0; p < w * h; p++) acc += buf[o + p]; means.push(acc / (w * h)); }
const glitches = [];
for (let i = 1; i < n - 1; i++) {
  if (Math.abs(means[i] - means[i - 1]) > 3 && Math.abs(means[i] - means[i + 1]) > 3 && Math.abs(means[i + 1] - means[i - 1]) < 1)
    glitches.push({ frame: i, t: +(i / fps).toFixed(3), mean: +means[i].toFixed(1), neighbours: +((means[i - 1] + means[i + 1]) / 2).toFixed(1) });
}
for (const g of glitches) issues.push(`single-frame glitch at frame ${g.frame} (${g.t}s): mean ${g.mean} vs neighbours ${g.neighbours} — re-render`);
const avg = energy.reduce((a, b) => a + b, 0) / Math.max(1, energy.length);
const floorNote = `noise floor ${noiseFloor.toFixed(2)} → static threshold ${staticThresh.toFixed(2)}`;
const report = {
  video,
  frames: n,
  durationSec: reel.durationSec,
  motion: { meanEnergy: +avg.toFixed(2), staticStretches: stretches, busyFrames: busy.length, detectedCuts: cuts },
  glitches,
  scenes: reel.scenes.map((s) => ({ id: s.id, archetype: s.archetype, start: s.start, end: s.end, len: +(s.end - s.start).toFixed(2) })),
  words: words.length,
  wordsPerMinute: words.length ? +((words.length / Math.max(0.1, spanEnd - spanStart)) * 60).toFixed(0) : 0,
  issues,
};
fs.writeFileSync(path.join(qaDir, "report.json"), JSON.stringify(report, null, 2));
const md = [
  `# QA — ${slug}`,
  ``,
  `Video: ${video}`,
  `Duration ${reel.durationSec}s · ${n} frames · ${words.length} words (${report.wordsPerMinute} wpm) · ${reel.scenes.length} scenes`,
  ``,
  `## Motion`,
  `Mean motion energy ${avg.toFixed(2)} (grey abs-diff/pixel). Static stretches ≥${staticMaxSec}s: ${stretches.length}. Detected hard cuts: ${cuts.length}. (${floorNote})`,
  stretches.length ? stretches.map((s) => `- STATIC ${s.from}s → ${s.to}s (${s.len}s)`).join("\n") : `- no static stretches ✓ (limit ${staticMaxSec}s for this niche)`,
  ``,
  `## Issues`,
  issues.length ? issues.map((i) => `- ${i}`).join("\n") : `- none ✓`,
  ``,
  `## Look at`,
  `- Contact sheet: ${path.join(qaDir, "sheet.png")}`,
  `- Frames (2 fps): ${path.join(qaDir, "frames")}`,
].join("\n");
fs.writeFileSync(path.join(qaDir, "report.md"), md + "\n");
console.log(md);
log(`report → ${path.join(qaDir, "report.md")}`);

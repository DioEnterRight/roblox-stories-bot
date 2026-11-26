#!/usr/bin/env node
/**
 * render.mjs — render a project with the Remotion Node API (software WebGL "swangle" by default, no GPU needed).
 *
 *   node engine/scripts/render.mjs <project>                       full MP4 → renders/<slug>/<slug>.mp4 (+ timestamped copy)
 *   node engine/scripts/render.mjs <project> --stills 1.2,4.5,9    PNG stills at those seconds → renders/<slug>/stills/
 *   node engine/scripts/render.mjs <project> --range 3-8           MP4 of seconds 3..8 only (fast preview)
 *   node engine/scripts/render.mjs <project> --scale 0.5           half-resolution preview
 *   options: --hq (1080x1920 master; ALSO written to renders/<slug>/<slug>.master.mp4 — the file you deliver)
 *            --concurrency 4  --crf 21  --out <file>  --no-audio  --lufs -14  --no-limit
 *
 * Stills are rendered through the frame-sequence path: Remotion's renderStill returns a black
 * canvas for WebGL, renderFrames does not.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fail, log, parseArgs, readJson, resolveProject, REMOTION_ROOT, RENDERS_ROOT } from "./lib/project.mjs";

const require = createRequire(path.join(REMOTION_ROOT, "package.json"));
const { bundle } = require("@remotion/bundler");
const { renderMedia, renderFrames, selectComposition } = require("@remotion/renderer");

const args = parseArgs(process.argv.slice(2));
const { slug, dir } = resolveProject(args._[0]);
const reelPath = path.join(dir, "reel.json");
if (!fs.existsSync(reelPath)) fail(`Missing ${reelPath} — run engine/scripts/plan.mjs first`);
const reel = readJson(reelPath);
const fps = reel.fps || 30;
// Light by default: 720x1280, fast x264. --hq gives the master: 1080x1920, CRF 18, slow preset.
// 4 workers per render (lower with --concurrency on smaller machines); at most RENDER_SLOTS heavy renders run at once.
const hq = Boolean(args.hq);
const concurrency = Math.min(Number(args.concurrency ?? 4), 4); // extra renders queue for a free slot
const scale = Number(args.scale ?? (hq ? 1 : 2 / 3));
const outDir = path.join(RENDERS_ROOT, slug);
fs.mkdirSync(outDir, { recursive: true });

// Each invocation bundles into its OWN folder (rspack takes ~2-3 s), so several agents can render
// different projects at the same time without clobbering a shared bundle. Removed after the render.
// ── Machine-wide render queue ────────────────────────────────────────────────
// At most RENDER_SLOTS (default 2) heavy renders (full video or --range) run at once on this machine; others wait.
// Stills are light (one frame) and skip the queue. The lock is a file with the owner's pid; stale locks
// (dead pid) are taken over. Each render uses up to 4 Chrome workers.
// Override with RENDER_SLOTS=n.
const SLOTS = Math.max(1, Number(process.env.RENDER_SLOTS ?? 2));
const heavy = !args.stills;
if (heavy) {
  fs.mkdirSync(RENDERS_ROOT, { recursive: true });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  let myLock = null;
  let waitedSec = 0;
  while (!myLock) {
    for (let i = 1; i <= SLOTS && !myLock; i++) {
      const lockFile = path.join(RENDERS_ROOT, `.render.lock.${i}`);
      try {
        const fd = fs.openSync(lockFile, "wx");
        fs.writeSync(fd, `${process.pid} ${slug} ${new Date().toISOString()}`);
        fs.closeSync(fd);
        myLock = lockFile;
      } catch {
        let owner = 0;
        try { owner = Number(fs.readFileSync(lockFile, "utf8").split(" ")[0]); } catch {}
        if (owner && !alive(owner)) { try { fs.rmSync(lockFile); } catch {} i--; }
      }
    }
    if (!myLock) {
      if (waitedSec % 30 === 0) log(`render queue: all ${SLOTS} slots busy, waiting (${waitedSec}s)`);
      await new Promise((r) => setTimeout(r, 2000));
      waitedSec += 2;
    }
  }
  const release = () => { try { if (Number(fs.readFileSync(myLock, "utf8").split(" ")[0]) === process.pid) fs.rmSync(myLock); } catch {} };
  process.on("exit", release);
  process.on("SIGINT", () => { release(); process.exit(130); });
  process.on("SIGTERM", () => { release(); process.exit(143); });
}

const bundleDir = path.join(REMOTION_ROOT, "out", "bundles", `${slug}-${process.pid}`);
fs.rmSync(bundleDir, { recursive: true, force: true });
const tb = Date.now();
const serveUrl = await bundle({
  entryPoint: path.join(REMOTION_ROOT, "src", "index.ts"),
  outDir: bundleDir,
  publicDir: path.join(REMOTION_ROOT, "public"),
  onProgress: () => {},
});
log(`bundled in ${((Date.now() - tb) / 1000).toFixed(1)}s`);
const cleanup = () => fs.rmSync(bundleDir, { recursive: true, force: true });
process.on("exit", cleanup);

const inputProps = { slug };
// GitHub runners have no GPU: software WebGL ("swangle") through the runner's own Chrome (CHROME=/usr/bin/google-chrome).
const browserExecutable = process.env.CHROME || process.env.REMOTION_BROWSER || null;
const chromiumOptions = { gl: process.env.REMOTION_GL || "swangle" };
// Browser log: the engine's guards print "[ceo-guard] ..." once per problem; forward them (the pipeline reads them back).
const onBrowserLog = ({ type, text }) => {
  if (text.includes("[ceo-guard]")) console.log(`GUARD ${text.replace("[ceo-guard] ", "")}`);
  else if (type === "error") console.log(`BROWSER-ERROR ${text.slice(0, 300)}`);
};
const composition = await selectComposition({ serveUrl, id: "Reel", inputProps, chromiumOptions, browserExecutable, timeoutInMilliseconds: 120000, onBrowserLog });
log(`composition: ${composition.durationInFrames} frames @ ${composition.fps}fps (${(composition.durationInFrames / composition.fps).toFixed(2)}s), ${composition.width}x${composition.height}`);

const t0 = Date.now();
let lastPct = -1;
const tty = process.stdout.isTTY;
const onProgress = ({ progress }) => {
  const pct = Math.floor(progress * (tty ? 20 : 10)) * (tty ? 5 : 10);
  if (pct !== lastPct) {
    lastPct = pct;
    const min = ((Date.now() - t0) / 60000).toFixed(1);
    process.stdout.write(tty ? `\r  rendering ${String(pct).padStart(3)}%` : `  rendering ${pct}% (${min} min)\n`);
  }
};

if (args.stills) {
  const secs = String(args.stills).split(",").map(Number).filter((n) => !Number.isNaN(n));
  const stillsDir = path.join(outDir, "stills");
  fs.mkdirSync(stillsDir, { recursive: true });
  const frames = secs.map((s) => Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(s * fps))));
  for (const f of frames) {
    const tmp = path.join(stillsDir, `_tmp-${f}`);
    fs.mkdirSync(tmp, { recursive: true });
    await renderFrames({ composition, serveUrl, inputProps, outputDir: tmp, imageFormat: "png", frameRange: [f, f], chromiumOptions, browserExecutable, onBrowserLog, concurrency: 1, scale, timeoutInMilliseconds: 120000, onFrameUpdate: () => {}, onStart: () => {} });
    const produced = fs.readdirSync(tmp).find((n) => n.endsWith(".png"));
    const dest = path.join(stillsDir, `${slug}-${String((f / fps).toFixed(2)).replace(".", "_")}s-f${f}.png`);
    fs.renameSync(path.join(tmp, produced), dest);
    fs.rmSync(tmp, { recursive: true, force: true });
    log(`still ${dest}`);
  }
  process.exit(0);
}

let frameRange = null;
if (args.range) {
  const [a, b] = String(args.range).split("-").map(Number);
  frameRange = [Math.max(0, Math.round(a * fps)), Math.min(composition.durationInFrames - 1, Math.round(b * fps))];
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outFile = args.out ? path.resolve(args.out) : path.join(outDir, frameRange ? `${slug}-preview-${stamp}.mp4` : `${slug}-${stamp}.mp4`);
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  crf: Number(args.crf ?? (hq ? 18 : 21)),
  imageFormat: "jpeg",
  jpegQuality: hq ? 92 : 80,
  outputLocation: outFile,
  inputProps,
  chromiumOptions,
  browserExecutable,
  onBrowserLog,
  concurrency,
  scale,
  frameRange,
  muted: Boolean(args["no-audio"]),
  audioCodec: "aac",
  audioBitrate: "192k",
  x264Preset: hq ? "slow" : "veryfast",
  pixelFormat: "yuv420p",
  colorSpace: "bt709",
  timeoutInMilliseconds: 120000,
  onProgress,
});
process.stdout.write("\n");
// ── Final-mix true-peak limiter ──────────────────────────────────────────────
// Voice is mastered to −14 LUFS / −1 dBTP, but music + SFX on top can push the Remotion mix to 0 dBFS.
// Remotion mixes every source 6 dB down (AudioLayer MIX_HEADROOM_DB); +6 dB is restored here.
// Re-encode only the audio: 4× oversampled limiter at −2.5 dBFS (≈ ≤ −1 dBTP after AAC), video stream copied.
// Ceiling per niche: style.json "audio": {"limiterDbfs": -3.5} (default -2.5 dBFS sample peak at 4x ≈ -1.5…-2.5 dBTP after AAC)
let limiterDbfs = -2.5;
try {
  const st = JSON.parse(fs.readFileSync(path.join(REMOTION_ROOT, "src", "niches", reel.niche, "style.json"), "utf8"));
  limiterDbfs = Number(reel.style?.audio?.limiterDbfs ?? st.audio?.limiterDbfs ?? limiterDbfs);
} catch {}
const limitAmp = Math.pow(10, limiterDbfs / 20);
if (!args["no-audio"] && !args["no-limit"]) {
  const { spawnSync } = await import("node:child_process");
  const { FFMPEG } = await import("./lib/project.mjs");
  const tmp = outFile.replace(/\.mp4$/, ".lim.mp4");
  // measure the raw Remotion mix (+6 dB headroom restore) and set a linear gain so the final lands on -14 LUFS
  const pre = spawnSync(FFMPEG, ["-hide_banner", "-i", outFile, "-af", "volume=6dB,ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
  const preI = Number([...pre.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()?.[1] ?? -14);
  let nicheLufs = -14;
  try { nicheLufs = Number(JSON.parse(fs.readFileSync(path.join(REMOTION_ROOT, "src", "niches", reel.niche, "style.json"), "utf8")).audio?.lufs ?? -14); } catch {}
  const targetI = Number(args.lufs ?? nicheLufs);
  const trimDb = Math.max(-12, Math.min(12, targetI - preI));
  // limiter costs a few tenths of a LU on dense mixes: measure the result and correct once from the raw render
  let ceilAmp = limitAmp;
  const limitPass = (gainDb) => spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", outFile, "-c:v", "copy",
    "-af", `volume=${gainDb.toFixed(2)}dB,aresample=192000,alimiter=limit=${ceilAmp.toFixed(4)}:attack=4:release=60:level=false,aresample=48000`,
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp], { encoding: "utf8" });
  const measure = (f) => {
    const m = spawnSync(FFMPEG, ["-hide_banner", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
    return { I: Number([...m.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()?.[1]), TP: Number([...m.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop()?.[1]) };
  };
  let gain = 6 + trimDb;
  let r = limitPass(gain);
  let res = r.status === 0 ? measure(tmp) : null;
  if (res && Number.isFinite(res.I) && Math.abs(res.I - targetI) > 0.15) {
    gain += Math.max(-3, Math.min(3, targetI - res.I));
    r = limitPass(gain);
    res = r.status === 0 ? measure(tmp) : null;
  }
  // AAC can overshoot the ceiling: measure the encoded true peak and pull the ceiling down until it is under the niche's max
  let truePeakMax = -1.0;
  try { truePeakMax = Number(JSON.parse(fs.readFileSync(path.join(REMOTION_ROOT, "src", "niches", reel.niche, "style.json"), "utf8")).audio?.truePeakMax ?? -1.0); } catch {}
  for (let k = 0; k < 3 && r.status === 0 && res && Number.isFinite(res.TP) && res.TP > truePeakMax; k++) {
    ceilAmp *= Math.pow(10, -(res.TP - truePeakMax + 0.3) / 20);
    r = limitPass(gain);
    res = r.status === 0 ? measure(tmp) : null;
  }
  if (r.status === 0 && res) {
    fs.renameSync(tmp, outFile);
    log(`final mix: ${Number.isFinite(res.I) ? res.I.toFixed(1) : "?"} LUFS (target ${targetI}), true peak ${Number.isFinite(res.TP) ? res.TP.toFixed(1) : "?"} dBTP, ceiling ${limiterDbfs} dBFS`);
  } else {
    log(`limiter step failed (kept unlimited file): ${(r.stderr || "").slice(0, 200)}`);
    try { fs.rmSync(tmp); } catch {}
  }
}
const secs = (Date.now() - t0) / 1000;
const nFrames = frameRange ? frameRange[1] - frameRange[0] + 1 : composition.durationInFrames;
log(`rendered ${nFrames} frames in ${secs.toFixed(1)}s (${(nFrames / secs).toFixed(1)} fps) → ${outFile}`);
if (!frameRange && !args.out) {
  const latest = path.join(outDir, `${slug}.mp4`);
  fs.copyFileSync(outFile, latest);
  log(`latest → ${latest}`);
  if (hq && scale === 1) {
    const master = path.join(outDir, `${slug}.master.mp4`);
    fs.copyFileSync(outFile, master);
    log(`master (1080x1920) → ${master}`);
  }
}

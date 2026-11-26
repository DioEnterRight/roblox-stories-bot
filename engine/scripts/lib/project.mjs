// Shared helpers for pipeline scripts (ESM, Node >= 20, no dependencies).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_ROOT = path.resolve(__dirname, "..", "..");
export const REMOTION_ROOT = path.join(ENGINE_ROOT, "remotion");
export const PROJECTS_ROOT = path.join(REMOTION_ROOT, "public", "projects");
export const RENDERS_ROOT = path.join(ENGINE_ROOT, "renders");
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg"; // on PATH, or set FFMPEG_PATH

export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const writeJson = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
};

/** Resolve a project by slug or path. Returns { slug, dir }. */
export const resolveProject = (arg) => {
  if (!arg) throw new Error("Usage: <script> <project-slug | project-dir>");
  let dir = arg;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) dir = path.join(PROJECTS_ROOT, arg);
  if (!fs.existsSync(dir)) throw new Error(`Project not found: ${arg} (looked in ${PROJECTS_ROOT})`);
  return { slug: path.basename(dir), dir: path.resolve(dir) };
};

export const parseArgs = (argv) => {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
};

/** Duration of a media file in seconds, parsed from `ffmpeg -i` (so ffprobe is not needed). */
export const mediaDuration = (file) => {
  const r = spawnSync(FFMPEG, ["-i", file], { encoding: "utf8" });
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr || "");
  if (!m) throw new Error(`Could not read duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
};

export const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: opts.quiet ? "pipe" : "inherit", encoding: "utf8", ...opts });

export const log = (...a) => console.log("•", ...a);
export const warn = (...a) => console.warn("⚠", ...a);
export const fail = (msg) => {
  console.error("✖", msg);
  process.exit(1);
};

export const normWord = (w) => String(w).toLowerCase().replace(/[^a-z0-9$%'’]/g, "");

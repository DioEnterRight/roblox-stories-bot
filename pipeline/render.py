"""Typecheck, bundle and render with Remotion. Software WebGL ("swangle") works on GitHub's CPU runners."""
import os
import sys

from .common import OUT, ROOT, env, log, run

REMOTION = ["node", str(ROOT / "node_modules" / "@remotion" / "cli" / "remotion-cli.js")]
BUNDLE = OUT / "bundle"


def _browser_args():
    chrome = env("CHROME")
    return [f"--browser-executable={chrome}"] if chrome else []


def _gl():
    return env("REMOTION_GL") or "swangle"


def typecheck():
    run(["node", ROOT / "node_modules" / "typescript" / "bin" / "tsc", "-p", ROOT], cwd=ROOT)


def bundle():
    run(REMOTION + ["bundle", "src/index.ts", f"--out-dir={BUNDLE}"], cwd=ROOT, capture=True)


def stills(scenes, out_dir):
    """One preview still (half size) in the middle of every camera shot, plus contact sheets. Returns sheet paths."""
    sys.path.insert(0, str(ROOT / "scripts"))
    from make_short import contact_sheets, still_frames
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for fr in still_frames(scenes):
        p = str(out_dir / f"f{fr:05d}.png")
        run(REMOTION + ["still", BUNDLE, "RobloxShort", p, f"--frame={fr}", f"--gl={_gl()}", "--scale=0.5",
                        *_browser_args()], cwd=ROOT, capture=True)
        paths.append(p)
    return contact_sheets(paths, str(out_dir))


def video(out_path):
    log("Rendering the 3D video on CPU: this is the slow step (about 40-100 minutes)")
    run(REMOTION + ["render", BUNDLE, "RobloxShort", out_path, f"--gl={_gl()}", f"--concurrency={os.cpu_count() or 2}",
                    "--codec=h264", "--image-format=png", "--pixel-format=yuv420p", *_browser_args()], cwd=ROOT)

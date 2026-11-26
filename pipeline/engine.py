"""Bridge to the Node engine (engine/scripts/*.mjs + engine/remotion): project folders, plan check, stills with the
render-time guard warnings, the final render, the motion QA, contact sheets.

A project lives in engine/remotion/public/projects/<slug>/ (voice.wav, music.wav, words.json, plan.json, reel.json);
renders go to engine/renders/<slug>/.
"""
import json
import os
import re
import shutil
import subprocess
import threading

from PIL import Image, ImageDraw

from .common import ENGINE, PROJECTS, RENDERS, log, run, write_json

SCRIPTS = ENGINE / "scripts"
NODE = shutil.which("node") or "node"


def project_dir(slug):
    d = PROJECTS / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def cleanup(slug):
    if os.environ.get("KEEP_PROJECT"):   # debugging: keep the engine project to re-render stills by hand
        return
    shutil.rmtree(PROJECTS / slug, ignore_errors=True)
    shutil.rmtree(RENDERS / slug, ignore_errors=True)


def write_plan(slug, plan):
    write_json(project_dir(slug) / "plan.json", plan)


def check_plan(slug):
    """plan.mjs: resolves every word anchor and writes reel.json. -> (ok, problems)"""
    res = run([NODE, SCRIPTS / "plan.mjs", slug], check=False, capture=True, cwd=ENGINE)
    text = (res.stdout or "") + (res.stderr or "")
    problems = [l.strip(" -") for l in text.splitlines() if l.strip().startswith("- ")]
    if res.returncode != 0:
        log(f"plan.mjs refused the plan: {problems[:6] or text[-400:]}", "WARN")
        return False, problems or [text[-400:]]
    return True, []


def _guards(text):
    return sorted({m.group(1).strip() for m in re.finditer(r"^GUARD (.+)$", text, re.M)})


def stills(slug, seconds, scale=0.5, timeout=1800):
    """Render PNG stills at these seconds. -> (paths, guard warnings from the browser)."""
    secs = ",".join(f"{s:.2f}" for s in seconds)
    shutil.rmtree(RENDERS / slug / "stills", ignore_errors=True)
    res = run([NODE, SCRIPTS / "render.mjs", slug, "--stills", secs, "--scale", str(scale)], check=False, capture=True, cwd=ENGINE,
              timeout=timeout)
    text = (res.stdout or "") + (res.stderr or "")
    if res.returncode != 0:
        raise RuntimeError(f"stills render failed: {text[-800:]}")
    d = RENDERS / slug / "stills"
    paths = sorted(d.glob("*.png"), key=lambda p: int(re.search(r"-f(\d+)\.png$", p.name).group(1)))
    return paths, _guards(text)


def _stream(cmd, timeout_s):
    """Run a long command, echoing its output live (progress in the Actions log) and returning it. -> (exit code, text)"""
    lines = []
    with subprocess.Popen([str(c) for c in cmd], cwd=ENGINE, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT) as p:
        timer = threading.Timer(timeout_s, p.kill)
        timer.start()
        try:
            for line in p.stdout:
                print(line, end="", flush=True)
                lines.append(line)
        finally:
            timer.cancel()
        code = p.wait()
    if code == -9:
        raise RuntimeError(f"final render timed out after {timeout_s // 60} min")
    return code, "".join(lines)


def render_final(slug, timeout_min=150):
    """The 1080x1920 master with the mixed, loudness-normalised sound. -> (mp4 path, guard warnings)."""
    conc = str(max(1, min(4, (os.cpu_count() or 2))))
    code, text = _stream([NODE, SCRIPTS / "render.mjs", slug, "--hq", "--concurrency", conc], timeout_min * 60)
    if code != 0:
        raise RuntimeError(f"final render failed: {text[-800:]}")
    out = RENDERS / slug / f"{slug}.master.mp4"
    if not out.exists():
        raise RuntimeError("final render produced no master file")
    return out, _guards(text)


def qa(slug):
    """engine qa.mjs on the master: static stretches, single-frame glitches, gaps. -> report dict."""
    res = run([NODE, SCRIPTS / "qa.mjs", slug, "--master"], check=False, capture=True, cwd=ENGINE)
    rep = RENDERS / slug / "qa" / "report.json"
    if res.returncode != 0 or not rep.exists():
        log(f"qa.mjs failed: {((res.stdout or '') + (res.stderr or ''))[-400:]}", "WARN")
        return {"issues": [], "error": True}
    return json.loads(rep.read_text(encoding="utf-8"))


def contact_sheet(paths, labels, out, cols=4, width=270):
    """Stills -> one labelled JPEG grid (what the judge looks at)."""
    ims = [Image.open(p).convert("RGB") for p in paths]
    if not ims:
        raise ValueError("no stills for the contact sheet")
    h = int(ims[0].height * width / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * width, rows * (h + 28)), "#101014")
    d = ImageDraw.Draw(sheet)
    for i, (im, lab) in enumerate(zip(ims, labels)):
        x, y = (i % cols) * width, (i // cols) * (h + 28)
        sheet.paste(im.resize((width, h)), (x, y + 28))
        d.text((x + 6, y + 6), str(lab)[:40], fill="#F2F2F2")
    sheet.save(out, quality=82)
    return out


def frames_from_video(video, seconds, outdir, width=360):
    """Frames of the finished mp4 at these seconds (the judge of the final cut)."""
    outdir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, s in enumerate(seconds):
        p = outdir / f"f{i:02d}.jpg"
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{s:.2f}", "-i", video, "-frames:v", "1", "-vf", f"scale={width}:-2", p])
        paths.append(p)
    return paths

"""Quality gate: never queue a broken file (size, codecs, frame rate, A/V sync, length, loudness, silence)."""
import re

from .common import ffprobe, log, run


def _loudness(path):
    res = run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], check=False, capture=True)
    i = re.findall(r"I:\s+(-?[\d.]+) LUFS", res.stderr or "")
    return float(i[-1]) if i else None


def check(path, min_s=12, max_s=60, fps=30, size=(1080, 1920)):
    info = ffprobe(path)
    v = [s for s in info["streams"] if s["codec_type"] == "video"]
    a = [s for s in info["streams"] if s["codec_type"] == "audio"]
    dur = float(info["format"]["duration"])
    problems = []
    if not v:
        problems.append("no video stream")
    else:
        w, h = int(v[0]["width"]), int(v[0]["height"])
        if (w, h) != tuple(size):
            problems.append(f"not {size[0]}x{size[1]} ({w}x{h})")
        num, den = (int(x) for x in v[0].get("avg_frame_rate", "0/1").split("/"))
        if den and abs(num / den - fps) > 0.5:
            problems.append(f"frame rate {num / den:.2f} != {fps}")
        if v[0].get("codec_name") != "h264" or v[0].get("pix_fmt") != "yuv420p":
            problems.append(f"video {v[0].get('codec_name')}/{v[0].get('pix_fmt')} (want h264/yuv420p)")
    if not a:
        problems.append("no audio")
    else:
        if a[0].get("codec_name") != "aac":
            problems.append(f"audio codec {a[0].get('codec_name')} (want aac)")
        if v and "duration" in v[0] and "duration" in a[0] and abs(float(v[0]["duration"]) - float(a[0]["duration"])) > 0.3:
            problems.append("audio and video lengths differ")
    if not min_s <= dur <= max_s:
        problems.append(f"length {dur:.1f}s outside {min_s}-{max_s}s")
    size_mb = int(info["format"]["size"]) / 1e6
    if size_mb > 250:
        problems.append(f"file too big ({size_mb:.0f} MB)")
    lufs = _loudness(path) if a else None
    if lufs is not None and not -20 <= lufs <= -9:
        problems.append(f"loudness {lufs:.1f} LUFS (want about -14)")
    if problems:
        raise RuntimeError("Quality check failed: " + "; ".join(problems))
    log(f"QC passed: {dur:.1f}s, {size_mb:.1f} MB, {lufs if lufs is None else round(lufs, 1)} LUFS")
    return dur

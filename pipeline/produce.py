"""MAKE VIDEO: story (LLM) -> voice -> storyboard (LLM) -> compile -> mix -> render -> QC -> queue.

  python -m pipeline.produce --test                 # offline: bundled sample story, no LLM, no keys; makes preview stills
  python -m pipeline.produce --test --render        # ... and the full MP4 (slow)
  python -m pipeline.produce --release              # real run: LLM + full render, queued as a GitHub Release
"""
import argparse
import glob
import json
import os
import shutil
import sys

from . import llm, qc, render, story as story_step, storyboard
from .common import OUT, ROOT, load_config, load_history, log, now_ist, run, save_history, slugify

os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "scripts"))
from shorts import audio  # noqa: E402
from shorts.scene import write_story  # noqa: E402

AUDIO_EXT = (".mp3", ".wav", ".ogg", ".m4a")


def music_file():
    """First track in public/music/ (relative to public/), or None: the video is then voice + SFX only."""
    tracks = sorted(p for p in glob.glob("public/music/*") if p.lower().endswith(AUDIO_EXT))
    return os.path.relpath(tracks[0], "public").replace(os.sep, "/") if tracks else None


def kokoro_beats(story, cfg):
    """Story beats -> Kokoro beats (narrator vs shout voice, a longer pause before a reveal)."""
    v, beats = cfg["voice"], []
    for i, b in enumerate(story["beats"]):
        nxt = story["beats"][i + 1] if i + 1 < len(story["beats"]) else None
        if b.get("shout"):
            beats.append({"id": b["id"], "text": b["text"], "voice": v["shout"], "shout": True, "pause": 0.25})
        else:
            beats.append({"id": b["id"], "text": b["text"], "voice": v["narrator"],
                          "pause": 0.2 if nxt and nxt.get("shout") and i > 0 and not story["beats"][i - 1].get("shout") else 0.08})
    return beats


def make_story_and_voice(cfg, history, test):
    """Story + real voice timings. A story whose voice is too long or short goes back to the LLM once more."""
    s = cfg["story"]
    feedback = ""
    for attempt in range(1, 4):
        if test:
            raw = json.loads((ROOT / "prompts" / "sample_story.json").read_text(encoding="utf-8"))
            story = story_step.validate(raw, cfg, {"videos": []})
        else:
            story = story_step.write(cfg, history, feedback)
        voice, cues = audio.narration_cues(kokoro_beats(story, cfg))
        sec = cues["durationSeconds"]
        log(f"Story '{story['title']}': {len(story['beats'])} beats, voice {sec:.1f}s")
        if s["min_sec"] <= sec <= s["max_sec"]:
            return story, voice, cues
        feedback = (f"The story was {sec:.0f}s when spoken; it must be {s['min_sec']}-{s['max_sec']}s "
                    f"({'cut' if sec > s['max_sec'] else 'add'} about {abs(sec - 39) / 39 * 100:.0f}% of the words).")
        log(feedback, "WARN")
        if test:
            break
    raise RuntimeError(f"No story with a good length after 3 tries ({feedback})")


def make_storyboard(cfg, story, cues, test):
    if test:
        board = json.loads((ROOT / "prompts" / "sample_storyboard.json").read_text(encoding="utf-8"))
        errs = storyboard.shape_problems(board, story, cfg)
        scenes, cast, problems = storyboard.compile_story(story, board, cues, cfg) if not errs else ([], {}, [])
        if errs or problems:
            raise RuntimeError("sample storyboard is broken: " + "; ".join(errs + problems))
        return {"board": board, "scenes": scenes, "cast": cast}
    return storyboard.write(story, cues, cfg)


def produce_one(cfg, history, test, full_render):
    stamp = now_ist().strftime("%Y%m%d-%H%M%S")
    story, voice, cues = make_story_and_voice(cfg, history, test)
    result = make_storyboard(cfg, story, cues, test)
    vid_id = f"{stamp}-{slugify(story['title'], 28)}"
    work = OUT / vid_id
    work.mkdir(parents=True, exist_ok=True)
    (work / "story.json").write_text(json.dumps(story, indent=2, ensure_ascii=False), encoding="utf-8")
    (work / "storyboard.json").write_text(json.dumps(result["board"], indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"=== Making {vid_id} ===")

    sfx, music = storyboard.plan_audio(story, result["board"], music_file())
    audio.mix_soundtrack(voice, cues, sfx, music)
    write_story(story["title"], result["scenes"], result["cast"], cues)   # writes src/story/currentStory.ts
    render.typecheck()
    render.bundle()
    sheets = render.stills(result["scenes"], work / "preview")
    log("Preview sheets: " + ", ".join(sheets))
    if test and not full_render:
        return work, None

    raw = work / "raw.mp4"
    render.video(str(raw))
    duration = qc.check(raw, fps=30)
    shutil.move(raw, work / "final.mp4")
    caption = f"{story['title']}\n\n{story['description']}\n\n{' '.join(story['hashtags'])}".strip()
    d = cfg["disclosure"]
    meta = {"id": vid_id, "title": story["title"], "description": story["description"], "hashtags": story["hashtags"],
            "caption": caption, "duration": round(duration, 2), "language": "en", "rule": story["rule"],
            "synthetic_youtube": bool(d["youtube_synthetic"]), "ai_label_instagram": bool(d["instagram_ai_label"])}
    (work / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return work, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true", help="offline: sample story, no LLM, nothing posted")
    ap.add_argument("--render", action="store_true", help="with --test: also render the full MP4")
    ap.add_argument("--release", action="store_true", help="queue the result as a GitHub Release")
    args = ap.parse_args()
    if args.test and args.release:
        sys.exit("--test and --release cannot be combined")

    cfg = load_config()
    if cfg.get("paused") and not args.test:
        log("Paused in config.yaml: nothing to do.")
        return
    history = load_history()
    queued = [v for v in history["videos"] if v.get("status") == "queued"]
    if not args.test and len(queued) >= int(cfg["buffer"]):
        log(f"Buffer already full ({len(queued)} ready). Nothing to make today.")
        return

    if not args.test:
        llm.check()
    work, meta = produce_one(cfg, history, args.test, args.render)
    if args.release:
        tag = f"vid-{meta['id']}"
        run(["gh", "release", "create", tag, work / "final.mp4", work / "meta.json",
             "--title", meta["title"][:100], "--notes", meta["caption"][:2000]])
        history["videos"].append({"id": meta["id"], "title": meta["title"], "rule": meta["rule"], "tag": tag,
                                  "duration": meta["duration"], "status": "queued",
                                  "created": now_ist().isoformat(timespec="minutes")})
        save_history(history)
    log(f"Done: {work}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        log(f"FAILED: {e}", "ERROR")
        sys.exit(1)

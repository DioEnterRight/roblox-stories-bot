"""MAKE VIDEO: slot (language) -> look -> idea -> script (+critic) -> voice -> studio (director, checks, judge, render) ->
quality gate -> queued as a GitHub Release.

  python -m pipeline.produce --test                # offline: bank script, Kokoro voice, auto director, no keys, nothing queued
  python -m pipeline.produce --test --language hi
  python -m pipeline.produce --test --preview      # stop before the slow final render: look at out/<id>/versions/*/sheet.jpg
  python -m pipeline.produce --release             # real run: free models, queued for the Post workflow
"""
import argparse
import json
import sys
import time

from . import analytics, engine, ideas, languages, llm, qc, schedule, studio, variety, voice, writer
from .common import OUT, load_config, load_history, log, now_ist, run, save_history, slugify


def performance_summary(stats, language):
    """A few lines for the idea prompt: which published jokes did best / worst (views), in this language."""
    rows = [r for r in stats.get("videos", {}).values() if r.get("language") == language and r.get("views")]
    if len(rows) < 4:
        return "(not enough data yet)"
    rows.sort(key=lambda r: sum(r["views"].values()), reverse=True)
    fmt = lambda r: f"- {r.get('topic') or r.get('title')}: {sum(r['views'].values())} views"   # noqa: E731
    return "Did best:\n" + "\n".join(fmt(r) for r in rows[:3]) + "\nDid worst:\n" + "\n".join(fmt(r) for r in rows[-3:])


def disclosure(cfg):
    d = cfg.get("disclosure") or {}
    return {"synthetic_youtube": bool(d.get("youtube_synthetic", False)), "ai_label_instagram": bool(d.get("instagram_ai_label", True))}


def get_script(cfg, history, stats, lp, session, test):
    """-> (script, idea or None). Free models first; the offline bank when none can be reached."""
    if test:
        return writer.from_bank(cfg, history, lp, test=True), None
    if session is not None:
        try:
            idea = ideas.generate(cfg, session, history, lp, performance_summary(stats, lp["code"]))
            return writer.write(cfg, session, idea, lp, performance_summary(stats, lp["code"])), idea
        except (llm.LLMUnavailable, RuntimeError, ValueError) as e:
            log(f"writing with models failed ({str(e)[:240]}); using the offline script bank", "WARN")
    return writer.from_bank(cfg, history, lp), None


def produce_one(cfg, history, stats, language, test, preview=False):
    stamp = now_ist().strftime("%Y%m%d-%H%M%S")
    lp = languages.profile(cfg, language)
    seed = int(time.time()) % 100_000 if not test else 7
    look = variety.pick(seed, history)
    log(f"=== {language}: main {look['main']} ({look['main_mood']}), places {look['locations']}, music {look['music_style']} ===")
    session = None
    if not test:
        try:
            session = llm.Session(cfg, seed)
        except llm.LLMUnavailable as e:
            log(f"no free models this run ({e}); offline script bank + auto director", "WARN")
    script, idea = get_script(cfg, history, stats, lp, session, test)
    if script.get("laptop"):
        look["laptop"] = script["laptop"]
    vid_id = f"{stamp}-{language}-{slugify(script.get('topic') or script['title'], 28)}"
    slug = "v-" + vid_id
    work = OUT / vid_id
    work.mkdir(parents=True, exist_ok=True)
    (work / "script.json").write_text(json.dumps(script, indent=2, ensure_ascii=False), encoding="utf-8")
    (work / "look.json").write_text(json.dumps(look, indent=2), encoding="utf-8")
    try:
        words, seconds, voice_engine = voice.synthesize(cfg, script, lp, engine.project_dir(slug), allow_edge=not test)
        vmin, vmax = cfg["video"]["min_seconds"], cfg["video"]["max_seconds"] - 1.5
        if not vmin <= seconds <= vmax:
            raise RuntimeError(f"voice-over is {seconds:.1f}s (allowed {vmin}-{vmax}s): the script is too {'short' if seconds < vmin else 'long'}")
        final, report = studio.make(cfg, script, words, look, slug, work, session, preview)
        if preview:
            log(f"Preview ready: {work / 'versions'} (v{report['version']}, score {report['score']:.1f})")
            return work, None, idea
        duration = qc.check(final, cfg["video"]["min_seconds"], cfg["video"]["max_seconds"])
    finally:
        engine.cleanup(slug)
    caption = f"{script['title']}\n\n{script['description']}\n\n{' '.join(script['hashtags'])}".strip()
    meta = {
        "id": vid_id, "title": script["title"], "description": script["description"], "hashtags": script["hashtags"],
        "caption": caption, "duration": round(duration, 2), "language": language, "format": "ceo",
        "topic": script.get("topic"), "canonical_en": script.get("canonical_en"), "category": script.get("category"),
        "hook_line": script["lines"][0]["caption"], "look": variety.summary(look), "voice_engine": voice_engine,
        "models": session.used if session else {}, "critic_score": script.get("critic_score"), "studio": {
            k: report[k] for k in ("version", "score", "director", "shots", "versions")}, **disclosure(cfg),
    }
    (work / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"Made {vid_id}: {duration:.1f}s, critic {meta['critic_score']}, studio score {report['score']:.1f} ({report['director']} director)")
    return work, meta, idea


def upload_release(tag, files, title, notes, tries=5):
    """GitHub Release with retries (uploads sometimes answer 5xx). A half-made release is deleted before the next try."""
    for attempt in range(1, tries + 1):
        try:
            run(["gh", "release", "create", tag, *files, "--title", title, "--notes", notes])
            return
        except RuntimeError as e:
            if attempt == tries:
                raise
            wait = 20 * attempt
            log(f"release upload failed (try {attempt}/{tries}: {str(e)[-200:]}); retrying in {wait} s", "WARN")
            run(["gh", "release", "delete", tag, "--yes", "--cleanup-tag"], check=False)
            time.sleep(wait)


def queue(history, work, meta, idea):
    tag = f"vid-{meta['id']}"
    upload_release(tag, [work / "final.mp4", work / "meta.json"], meta["title"][:100], meta["caption"][:2000])
    history["videos"].append({**{k: meta.get(k) for k in ("id", "title", "topic", "canonical_en", "language", "format", "category",
                                                          "hook_line", "duration", "look", "critic_score")},
                              "studio_score": meta["studio"]["score"], "tag": tag, "status": "queued",
                              "created": now_ist().isoformat(timespec="minutes")})
    save_history(history)
    led = ideas.load()
    ideas.record(led, idea or {"canonical_en": meta["canonical_en"], "category": meta.get("category")}, meta["language"], meta["id"])
    ideas.save(led)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true", help="offline test: no keys, nothing queued")
    ap.add_argument("--release", action="store_true", help="queue the result as a GitHub Release")
    ap.add_argument("--language", default=None, choices=["en", "hi"], help="make one video in this language")
    ap.add_argument("--preview", action="store_true", help="stop before the final render (contact sheets only)")
    args = ap.parse_args()
    if args.release and (args.test or args.preview):
        sys.exit("--release cannot be combined with --test or --preview")
    cfg = load_config()
    if cfg.get("paused") and not args.test:
        log("Paused in config.yaml — nothing to do.")
        return
    history = load_history()
    stats = analytics.load()
    queued = [v for v in history["videos"] if v.get("status") == "queued"]
    todo = [args.language or "en"] if args.test else [args.language] if args.language else schedule.to_make(cfg, queued, now_ist())
    if not todo:
        log(f"The next uploads are covered ({len(queued)} ready). Nothing to make now.")
        return
    log(f"Videos ready: {len(queued)}. Making: {', '.join(todo)}")
    failed = []
    for language in todo:
        try:   # one bad video must not cost the others
            work, meta, idea = produce_one(cfg, history, stats, language, args.test, args.preview)
            if args.preview:
                continue
            if args.release:
                queue(history, work, meta, idea)
            log(f"Done: {work / 'final.mp4'}")
        except Exception as e:  # noqa: BLE001
            failed.append(language)
            log(f"FAILED ({language}): {str(e)[:600]}", "ERROR")
            if args.test:
                raise
    if failed:
        sys.exit(f"{len(failed)} video(s) failed: see the log above")


if __name__ == "__main__":
    main()

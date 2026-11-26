"""STATS: pulls views/likes/shares/watch-time into data/analytics.json (the idea writer reads it to learn which jokes
work). Missing permissions or API errors never stop video production.

data/analytics.json (versioned):
  videos[<id>]: video_id, language, topic, theme, published_at, last_update,
                views {yt, ig}, views_day7 {yt, ig}, metrics {...all platform numbers...}
"""
import datetime as dt

from . import instagram, youtube
from .common import DATA, env, load_history, log, now_ist, parse_time, read_json, save_history, write_json

PATH = DATA / "analytics.json"
VERSION = 1
WINDOW_DAYS = 21


def load():
    a = read_json(PATH, {})
    a.setdefault("version", VERSION)
    a.setdefault("videos", {})
    return a


def save(a):
    a["version"] = VERSION
    a["updated"] = now_ist().isoformat(timespec="minutes")
    write_json(PATH, a)


def _record(a, v):
    rec = a["videos"].setdefault(v["id"], {"video_id": v["id"]})
    rec.update({"language": v.get("language", "en"), "topic": v.get("topic"), "format": v.get("format", "ceo"),
                "title": v.get("title"), "category": v.get("category"), "hook_line": v.get("hook_line"), "look": v.get("look"),
                "critic_score": v.get("critic_score"), "studio_score": v.get("studio_score"),
                "duration": v.get("duration"), "published_at": v.get("published_at")})
    rec.setdefault("metrics", {})
    return rec


def _views(m):
    out = {}
    if "yt_views" in m and m.get("yt_privacy", "public") == "public":
        out["yt"] = m["yt_views"]
    if "ig_views" in m:
        out["ig"] = m["ig_views"]
    return out


def collect(a, history):
    """Refresh metrics of every published video. Each source fails independently."""
    cut = now_ist() - dt.timedelta(days=WINDOW_DAYS)   # older videos keep their numbers; refreshing them all would hit API limits
    published = [v for v in history["videos"] if v.get("status") == "published" and v.get("published_at")
                 and parse_time(v["published_at"]) >= cut]
    if not published:
        log("No published videos yet.")
        return
    for v in published:
        _record(a, v)
    if env("IG_PAGE_TOKEN"):
        for v in published:
            if v.get("ig_media_id"):
                try:
                    a["videos"][v["id"]]["metrics"].update(instagram.insights(v["ig_media_id"]))
                except Exception as e:  # noqa: BLE001
                    log(f"IG stats failed for {v['id']}: {e}", "WARN")
    try:
        yt = youtube.stats(published)  # refreshed every run, so stored YouTube data never goes stale
        for v in published:
            if v.get("yt_video_id") in yt:
                a["videos"][v["id"]]["metrics"].update(yt[v["yt_video_id"]])
    except Exception as e:  # noqa: BLE001
        log(f"YouTube stats skipped: {e}", "WARN")
        if "invalid_grant" in str(e):
            # Access was revoked in Google security settings -> delete stored YouTube data (Developer Policies III.D)
            for v in history["videos"]:
                v.pop("yt_video_id", None)
            for rec in a["videos"].values():
                for key in ("metrics", "metrics_day7"):
                    for k in [k for k in (rec.get(key) or {}) if k.startswith("yt_")]:
                        rec[key].pop(k)
            log("YouTube access revoked: stored YouTube data deleted.", "WARN")
    now = now_ist()
    for v in published:
        rec = a["videos"][v["id"]]
        rec["last_update"] = now.isoformat(timespec="minutes")
        rec["views"] = _views(rec["metrics"])
        age = (now - parse_time(v["published_at"])).days
        if age >= 7 and "metrics_day7" not in rec and rec["metrics"]:
            rec["metrics_day7"] = dict(rec["metrics"])
            rec["views_day7"] = _views(rec["metrics_day7"])
    log(f"Stats updated for {len(published)} video(s).")


def main():
    history = load_history()
    a = load()
    try:
        collect(a, history)
    finally:
        save(a)
        save_history(history)


if __name__ == "__main__":
    main()

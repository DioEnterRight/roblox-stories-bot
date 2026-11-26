"""Upload slots from config.yaml `schedule:` (India time). Pure functions, no I/O.

  schedule:
    every_minutes: 180        # one upload every 3 h = 8 a day
    first: "01:30"            # the first upload of the day; the rest follow every_minutes
    languages: [en, hi]       # slot by slot in this order: en, hi, en, hi ... (continues across midnight)
    make_ahead: 2             # keep the next 2 uploads ready
    make_per_run: 1           # each Make run makes at most this many

Making: each Make run makes the languages of the next `make_ahead` slots that no ready video covers yet.
Posting: the Post workflow runs every 30 min and posts the slot that is due (up to one slot interval late, max 3 h).
A video is tied to its slot (v["slot"] = "YYYY-MM-DD HH:MM") the moment it is picked, so retries never double-post.
"""
import datetime as dt
import re

TIME = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
EPOCH = dt.date(2026, 1, 1)


def _hm(t, what):
    if not TIME.fullmatch(str(t)):
        raise ValueError(f"schedule {what}: time must look like \"09:30\" (24h, India time), got {t!r}")
    return int(t[:2]) * 60 + int(t[3:])


def settings(cfg):
    s = cfg.get("schedule")
    if not isinstance(s, dict):
        raise ValueError("config.yaml schedule: must be the every_minutes / first / languages block (see SETUP.md)")
    every = int(s.get("every_minutes", 180))
    if not 30 <= every <= 1440:
        raise ValueError("schedule every_minutes must be 30-1440")
    langs = s.get("languages") or ["en"]
    enabled = cfg["languages"]["enabled"]
    for l in langs:
        if l not in enabled:
            raise ValueError(f"schedule languages: {l!r} is not in languages.enabled {enabled}")
    return s, every, list(langs)


def times(cfg):
    """-> ["HH:MM", ...] of one day."""
    s, every, _ = settings(cfg)
    first = _hm(s.get("first", "01:30"), "first")
    out, m = [], first % every
    while m < 1440:
        out.append(f"{m // 60:02d}:{m % 60:02d}")
        m += every
    return out


def language_of(cfg, day, t):
    """The language of the slot on `day` at "HH:MM": the languages list repeats slot after slot, across days."""
    _, _, langs = settings(cfg)
    day_times = times(cfg)
    k = (day - EPOCH).days * len(day_times) + day_times.index(t)
    return langs[k % len(langs)]


def late(cfg):
    """how late a slot may still be posted: one slot interval, at most 3 h"""
    return dt.timedelta(minutes=min(180, settings(cfg)[1]))


def upcoming(cfg, now, n):
    """the next n slots still ahead of now: [(slot id, language)]"""
    out, day = [], now.date()
    while len(out) < n:
        for t in times(cfg):
            start = dt.datetime.combine(day, dt.time(int(t[:2]), int(t[3:])), tzinfo=now.tzinfo)
            if start > now and len(out) < n:
                out.append((f"{day:%Y-%m-%d} {t}", language_of(cfg, day, t)))
        day += dt.timedelta(days=1)
    return out


def to_make(cfg, queued, now):
    """languages to make now: the next `make_ahead` slots minus what ready videos already cover, at most `make_per_run`"""
    s, _, _ = settings(cfg)
    have = {}
    for v in queued:
        have[v.get("language", "en")] = have.get(v.get("language", "en"), 0) + 1
    need = []
    for _, lang in upcoming(cfg, now, int(s.get("make_ahead", 2))):
        if have.get(lang, 0) > 0:
            have[lang] -= 1
        else:
            need.append(lang)
    return need[: int(s.get("make_per_run", 1))]


def due(cfg, done, now):
    """-> (slot id, language) of the earliest slot whose time has come (at most late() ago) and is not done, else None.
    done = slot ids already used. Looks at yesterday too (slots just after midnight)."""
    for day in (now.date() - dt.timedelta(days=1), now.date()):
        for t in times(cfg):
            start = dt.datetime.combine(day, dt.time(int(t[:2]), int(t[3:])), tzinfo=now.tzinfo)
            sid = f"{day:%Y-%m-%d} {t}"
            if start <= now < start + late(cfg) and sid not in done:
                return sid, language_of(cfg, day, t)
    return None


def work_now(cfg, history, now):
    """True when a Post run has something to do: a half-posted video to finish, or a due slot."""
    if any(v.get("status") == "queued" and v.get("slot") for v in history["videos"]):
        return True
    done = {v.get("slot") for v in history["videos"]} | set(history.get("missed_slots", []))
    return due(cfg, done, now) is not None


def make_now(cfg, history, now):
    return bool(to_make(cfg, [v for v in history["videos"] if v.get("status") == "queued"], now))


if __name__ == "__main__":   # workflow gates, cheap (only pyyaml): post -> due=true|false, make -> make=true|false stats=true|false
    import os
    import sys

    from .common import load_config, load_history, now_ist
    cfg, now = load_config(), now_ist()
    if sys.argv[1:] == ["make"]:
        out = {"make": not cfg.get("paused") and make_now(cfg, load_history(), now), "stats": now.hour in (4, 5)}
    else:
        out = {"due": not cfg.get("paused") and work_now(cfg, load_history(), now)}
    for k, v in out.items():
        print(f"{k}={'true' if v else 'false'}")
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write(f"{k}={'true' if v else 'false'}\n")

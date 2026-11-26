"""IDEAS: brainstorm several skit ideas -> drop near-repeats -> pick the best; the unused good ones wait in a backlog.

Repeats are caught locally (no model call) by comparing every idea's plain-English core ("canonical_en", always English
so a Hindi idea is compared with English ones): score = max(content-word overlap, character-trigram cosine).
data/ideas.json keeps every idea ever used, so the channel never tells the same joke twice.
"""
import datetime as dt
import math
import re
from collections import Counter

from .common import DATA, fill, log, now_ist, prompt, read_json, write_json

PATH = DATA / "ideas.json"
VERSION = 1
BACKLOG_DAYS, BACKLOG_MAX = 10, 40

STOP = set("""a an the of to in on for at by with from into about over under is are was were be been being am do does did
have has had it its this that these those there here what why how when where which who you your we our us i me my he
she they them their his her him can could would should will may might must if then than so very really just even not no
and or but as up down out off again more most some any all each every one get gets got make makes made like his own""".split())
SYNONYMS = {"meetings": "meeting", "boss": "ceo", "founder": "ceo", "company": "startup", "business": "startup",
            "employees": "employee", "staff": "employee", "team": "employee", "salary": "money", "income": "money",
            "investors": "investor", "funding": "investor", "office": "office", "cafe": "coffee", "chai": "coffee",
            "mom": "mother", "mummy": "mother", "parents": "mother", "linkedin": "social", "post": "social"}


def _stem(w):
    for suf in ("ing", "ies", "es", "ed", "s"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def content_words(text):
    out = set()
    for w in re.findall(r"[a-z]+", (text or "").lower()):
        if w in STOP or len(w) < 3:
            continue
        w = SYNONYMS.get(w, w)
        out.add(SYNONYMS.get(_stem(w), _stem(w)))
    return out


def _trigrams(text):
    t = f"  {' '.join(sorted(content_words(text)))}  "
    return Counter(t[i:i + 3] for i in range(len(t) - 2))


def similarity(a, b):
    """0..1 — how much two ideas are the same joke."""
    wa, wb = content_words(a), content_words(b)
    if not wa or not wb:
        return 0.0
    overlap = len(wa & wb) / min(len(wa), len(wb))
    jacc = len(wa & wb) / len(wa | wb)
    ta, tb = _trigrams(a), _trigrams(b)
    dot = sum(ta[k] * tb[k] for k in ta)
    cos = dot / (math.sqrt(sum(v * v for v in ta.values())) * math.sqrt(sum(v * v for v in tb.values())) or 1)
    return max(0.5 * overlap + 0.5 * jacc, cos)


def load():
    led = read_json(PATH, {})
    led.setdefault("version", VERSION)
    led.setdefault("ideas", [])
    led.setdefault("backlog", [])
    return led


def save(led):
    led["version"] = VERSION
    write_json(PATH, led)


def past_ideas(history, ledger):
    out = [i["canonical_en"] for i in ledger["ideas"] if i.get("canonical_en")]
    for v in history["videos"]:
        if v.get("status") != "discarded" and v.get("format", "ceo") == "ceo":
            for key in ("canonical_en", "topic"):
                if v.get(key):
                    out.append(v[key])
    return out


def is_duplicate(text, past, threshold):
    best = max(((similarity(text, p), p) for p in past), default=(0.0, None))
    return best[0] >= threshold, best


def rank_key(idea):
    s = idea.get("scores") or {}
    vals = []
    for k in ("funny", "relatable", "originality", "visual", "twist"):
        try:
            vals.append(min(10.0, max(0.0, float(s.get(k, 5)))))
        except (TypeError, ValueError):
            vals.append(5.0)
    return sum(vals) + 0.5 * vals[-1]


def choose(candidates, past, threshold, keep=None):
    """-> (best idea or None, rejected [(idea, reason)]). keep: receives the other good ideas (for the backlog)."""
    kept, rejected = [], []
    for idea in candidates if isinstance(candidates, list) else []:
        if not isinstance(idea, dict):
            continue
        text = str(idea.get("canonical_en", "")).strip()
        if not text or not idea.get("hook") or not idea.get("twist"):
            rejected.append((idea, "incomplete"))
            continue
        dup, (score, match) = is_duplicate(text, past + [k["canonical_en"] for k in kept], threshold)
        if dup:
            rejected.append((idea, f"too close ({score:.2f}) to: {match}"))
            continue
        kept.append(idea)
    kept.sort(key=rank_key, reverse=True)
    if keep is not None:
        keep += kept[1:]
    return (kept[0] if kept else None), rejected


def from_backlog(ledger, language, past, threshold):
    cut = (now_ist() - dt.timedelta(days=BACKLOG_DAYS)).isoformat(timespec="minutes")
    fresh = [i for i in ledger.get("backlog", []) if i.get("added", "") >= cut and i.get("language") in (None, language)]
    best, _ = choose(fresh, past, threshold)
    return best


def record(ledger, idea, language, video_id):
    """The idea is used: log it, take it off the backlog, park its brainstorm's other good ideas there."""
    backlog = [i for i in ledger.get("backlog", []) if i.get("canonical_en") != idea["canonical_en"]]
    for extra in idea.pop("_spare", []):
        if all(extra.get("canonical_en") != i.get("canonical_en") for i in backlog):
            backlog.append({**extra, "added": now_ist().isoformat(timespec="minutes")})
    ledger["backlog"] = backlog[-BACKLOG_MAX:]
    ledger["ideas"].append({"canonical_en": idea["canonical_en"], "category": idea.get("category"), "hook": idea.get("hook"),
                            "twist": idea.get("twist"), "language": language, "video_id": video_id,
                            "created": now_ist().isoformat(timespec="minutes")})


def recent_categories(ledger, n=6):
    return [i.get("category") for i in ledger["ideas"][-n:] if i.get("category")]


def generate(cfg, session, history, lp, performance):
    """-> the chosen idea (dict). Backlog first (no model call), else one brainstorm (two if every pitch was a repeat)."""
    icfg = cfg["ideas"]
    threshold = float(icfg.get("similarity_threshold", 0.5))
    ledger = load()
    past = past_ideas(history, ledger)
    saved = from_backlog(ledger, lp["code"], past, threshold)
    if saved:
        log(f"Idea from the backlog (no model call): {saved['canonical_en']}")
        return saved
    recent = set(recent_categories(ledger))
    cats = [c for c in icfg["categories"] if c not in recent] or icfg["categories"]
    base = fill(prompt("ideas.md"), count=int(icfg.get("candidates", 8)), format=prompt("format.md"), language_name=lp["name"],
                categories="\n".join(f"- {c}" for c in cats), avoid_list="\n".join(f"- {t}" for t in past[-150:]) or "(nothing yet)",
                performance=performance or "(no data yet)")
    rejected_all = []
    for attempt in range(1, 3):
        extra = ""
        if rejected_all:
            extra = "\n\nThese pitches were rejected as repeats or incomplete; pitch completely different ones:\n" + "\n".join(
                f"- {i.get('canonical_en', '?')} ({why})" for i, why in rejected_all[-12:])
        reply = session.json("writer", "You are a sharp comedy writer. Reply with JSON only.", base + extra)
        spare = []
        best, rejected = choose(reply.get("ideas", []), past, threshold, spare)
        for idea, why in rejected:
            log(f"  idea rejected: {idea.get('canonical_en', '?')} -> {why}")
        rejected_all += rejected
        if best:
            for s in spare:
                s["language"] = None
            log(f"Idea: {best['canonical_en']} ({best.get('category')}); {len(spare)} more kept for later")
            return {**best, "_spare": spare}
        log(f"Brainstorm {attempt}: every pitch was a repeat", "WARN")
    raise RuntimeError("No original idea survived the repeat filter")

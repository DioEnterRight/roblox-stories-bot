"""Step A: the LLM writes the story (title, rule, beats). Validation is strict so a bad story never reaches the voice."""
import re

from . import catalog, llm
from .common import ROOT, norm_text

OPENERS = ("in this town,", "in this world,")


def build_prompt(cfg, history):
    s = cfg["story"]
    recent = [f"{v['title']} ({v.get('rule', '')})" for v in history["videos"][-30:] if v.get("title")]
    system = llm.fill((ROOT / "prompts" / "story.md").read_text(encoding="utf-8"),
        min_beats=s["min_beats"], max_beats=s["max_beats"], min_words=s["min_words"], max_words=s["max_words"],
        places=", ".join(k for k in catalog.LOCATIONS if k != "town_overview") + ", town_overview (aerial, hook only)",
        recent="; ".join(recent) or "(none yet)")
    return system, "Write today's Short."


def validate(obj, cfg, history):
    """Normalise the story and return it, or raise ValueError listing EVERY problem."""
    s, errs = cfg["story"], []
    beats = obj.get("beats")
    if not isinstance(beats, list) or not beats:
        raise ValueError("'beats' must be a non-empty list")
    out, nb, ns, nw = [], 0, 0, 0   # nb = normal beats, ns = shout beats, nw = spoken words
    for i, b in enumerate(beats):
        text = " ".join(str(b.get("text", "") if isinstance(b, dict) else b).split())
        shout = bool(isinstance(b, dict) and b.get("shout"))
        if not text:
            errs.append(f"beat {i + 1}: empty text")
            continue
        words = len(text.split())
        if shout:
            nw += 1
            text = text.upper()
            if words > 2 or not text.endswith("!"):
                errs.append(f"beat {i + 1}: a shout is ONE or two uppercase words ending with '!'")
            if i in (0, len(beats) - 1):
                errs.append("a shout cannot be the first or the last beat")
            ns += 1
            out.append({"id": f"w{ns}", "text": text, "shout": True})
        else:
            nw += words
            if not 3 <= words <= 22:
                errs.append(f"beat {i + 1}: {words} words (want 6-16, hard limits 3-22)")
            nb += 1
            out.append({"id": f"b{nb}", "text": text})
    shouts = [o for o in out if o.get("shout")]
    if len(shouts) > 3:
        errs.append("at most 3 shout beats")
    if not s["min_beats"] <= len(out) <= s["max_beats"]:
        errs.append(f"{len(out)} beats (want {s['min_beats']}-{s['max_beats']})")
    if not s["min_words"] <= nw <= s["max_words"]:
        errs.append(f"{nw} spoken words (want {s['min_words']}-{s['max_words']}: that makes a 35-45 s Short)")
    if out and not out[0]["text"].lower().startswith(OPENERS):
        errs.append("beat 1 must start with 'In this town,' or 'In this world,'")
    title = " ".join(str(obj.get("title", "")).split())
    if not title or len(title) > 60:
        errs.append("title missing or longer than 60 characters")
    old = {norm_text(v["title"]) for v in history["videos"] if v.get("title")}
    if norm_text(title) in old:
        errs.append("this title was already used: invent a new story")
    full = " ".join(o["text"] for o in out) + " " + title + " " + str(obj.get("description", ""))
    bad = catalog.BANNED.search(full)
    if bad:
        errs.append(f"unsafe or banned word '{bad.group(0)}': keep it kid-safe")
    if errs:
        raise ValueError("; ".join(errs))
    tags = [t if t.startswith("#") else "#" + t for t in obj.get("hashtags") or []]
    tags = [re.sub(r"[^#\w]", "", t) for t in tags][: cfg["publish"]["hashtags_max"]] or ["#roblox", "#robloxstory"]
    return {"title": title, "rule": " ".join(str(obj.get("rule", "")).split()),
            "description": " ".join(str(obj.get("description", "")).split())[:200] or title,
            "hashtags": tags, "beats": out}


def write(cfg, history, feedback=""):
    system, user = build_prompt(cfg, history)
    if feedback:
        user += f"\n\nThe last attempt failed: {feedback}"
    return llm.ask_json(system, user, lambda o: validate(o, cfg, history), temperature=0.9, max_tokens=3000)

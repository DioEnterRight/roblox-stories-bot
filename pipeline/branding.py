"""Channel branding (config.yaml `brand`): @outrichguy in the top-right corner of every frame, and a last-3-seconds
outro where the CEO turns to camera and says the follow line while a big "FOLLOW @outrichguy" card (Dio's Stories
underneath, smaller) takes over the screen.

  add_outro(cfg, script, language)   -> script with the outro line appended (spoken by the CEO's voice)
  force_outro_shot(shots, script)    -> the director's shot list with one fixed shot for the outro line
  meta(cfg, script, words)           -> reel.meta.brand for the engine (corner tag + outro timing)
"""
import copy


def add_outro(cfg, script, language):
    b = cfg["brand"]
    o = b["outro"].get(language) or b["outro"]["en"]
    script = copy.deepcopy(script)
    if script["lines"] and script["lines"][-1].get("outro"):
        return script
    script["lines"].append({"text": o["spoken"], "caption": o["caption"], "outro": True,
                            "ceo": {"action": "point", "expression": "happy"}})
    return script


def outro_index(script):
    i = len(script["lines"]) - 1
    return i if i >= 0 and script["lines"][i].get("outro") else None


def force_outro_shot(shots, script):
    """Drop whatever the director planned for the outro line and add one shot: the CEO, medium, facing camera."""
    oi = outro_index(script)
    if oi is None or not isinstance(shots, list):
        return shots
    line_no = oi + 1
    keep = [s for s in shots if isinstance(s, dict) and int((s.get("start") or {}).get("line", 0) or 0) < line_no]
    base = keep[0] if keep else {}
    keep.append({"start": {"line": line_no, "word": 0}, "location": base.get("location"), "spot": base.get("spot"),
                 "framing": "medium", "move": "push_in", "ceo": {"action": "point", "expression": "happy", "hold": "none"},
                 "events": [{"word": {"line": line_no, "word": 0}, "do": "hop"}], "outro": True})
    return keep


def meta(cfg, script, words):
    b = cfg["brand"]
    out = {"corner": b["corner_handle"]}
    oi = outro_index(script)
    if oi is not None and oi < len(words["lines"]):
        ws = words["lines"][oi]["words"]
        out["outro"] = {"start": ws[0]["s"], "headline": b["outro_headline"], "sub": b["channel_name"],
                        "minSec": float(b["outro_seconds"])}
    return out


def tail_seconds(cfg, script, words, base=0.35):
    """Hold the end so the outro lasts at least `brand.outro_seconds`."""
    oi = outro_index(script)
    if oi is None:
        return base
    ws = words["lines"][oi]["words"]
    return max(base, float(cfg["brand"]["outro_seconds"]) - (ws[-1]["e"] - ws[0]["s"]))

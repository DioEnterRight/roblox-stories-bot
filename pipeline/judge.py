"""JUDGE: a free vision model scores the stills of a cut (prompts/judge.md) and lists shot-level fixes.
The engine's own guards (people cut by the frame, jump cuts, cards over faces) are hard facts: each one costs a point
of composition, so a cut with guard problems can never beat a clean one on paper."""
import json

from .common import fill, log, prompt


def score(session, script, shots_summary, sheet, guards):
    """-> {"scores": {..., "overall": x}, "fixes": [...], "model": id} or None when no vision model answers."""
    if session is None or not session.candidates.get("judge"):
        return None
    text = json.dumps({"punch_line": script.get("punch_line"), "lines": [l["caption"] for l in script["lines"]]}, ensure_ascii=False)
    try:
        res = session.json("judge", "You are a strict judge of short cartoon videos. Reply with JSON only.",
                           fill(prompt("judge.md"), script=text, shots=shots_summary), images=[sheet], attempts_on_bad_json=1)
        s = res["scores"]
        overall = float(s["overall"])
    except Exception as e:  # noqa: BLE001 - a missing judge never stops a video
        log(f"judge skipped ({str(e)[:200]})", "WARN")
        return None
    if guards:
        s["composition"] = max(1.0, float(s.get("composition", overall)) - len(guards))
        overall = max(1.0, overall - 0.5 * min(4, len(guards)))
    s["overall"] = round(overall, 2)
    res["fixes"] = [str(f) for f in (res.get("fixes") or [])][:6]
    res["model"] = (session.used.get("judge") or ["?"])[-1]
    return res

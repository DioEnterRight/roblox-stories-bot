"""DIRECTOR: a free model turns the timed voice-over into a shot list (see prompts/director.md and compiler.py).
Repair notes (compiler repairs, engine guards, judge fixes) go back to it for a revised list."""
import json

from .common import fill, locations, prompt
from .compiler import PERSONAS


def world_text(look):
    locs = locations()
    out = []
    for name in look["locations"]:
        L = locs[name]
        spots = "; ".join(f"{k} = {v['desc']}" for k, v in L["spots"].items())
        out.append(f"- {name} ({look['moods'][name]} light): {L['desc']}.\n  spots: {spots}.\n  wides: {', '.join(w['name'] for w in L['wides'])}")
    return "\n".join(out)


def beats_text(script, words):
    rows = []
    for i, (line, wl) in enumerate(zip(script["lines"], words["lines"])):
        ws = " ".join(f"{j}:{w['w']}@{w['s']:.2f}" for j, w in enumerate(wl["words"]))
        gags = {k: line[k] for k in ("card", "stamp", "insert") if line.get(k)}
        extra = f" | second character: {line['who']}" if line.get("who") else ""
        rows.append(f"line {i + 1}{' (PUNCH LINE)' if i == script.get('punch_line') else ''}: {ws}\n"
                    f"  visual: {line.get('visual', '')}{extra}\n  emphasis: {line.get('emphasis', '')}"
                    + (f"\n  gags: {json.dumps(gags, ensure_ascii=False)}" if gags else ""))
    return "\n".join(rows)


def brief(script, words, look):
    dur = words["lines"][-1]["words"][-1]["e"]
    n = max(6, round(dur / 2.2))
    return fill(prompt("director.md"), world=world_text(look), personas=", ".join(PERSONAS),
                shot_hint=f"This voice-over is {dur:.1f} s long: aim for about {n} shots.",
                punch_line_human=int(script.get("punch_line", len(script["lines"]) - 1)) + 1,
                max_locations=len(look["locations"]), locations=", ".join(look["locations"]), beats=beats_text(script, words))


SYSTEM = "You are a film director for short vertical cartoon skits. Reply with JSON only."


def direct(session, script, words, look):
    reply = session.json("director", SYSTEM, brief(script, words, look), max_tokens=7000)
    return reply.get("shots") or []


def revise(session, script, words, look, shots, notes):
    clean = [{k: v for k, v in s.items() if not k.startswith("_")} for s in shots]
    ask = (brief(script, words, look) + "\n\n## Your previous shot list\n" + json.dumps({"shots": clean}, ensure_ascii=False)
           + "\n\n## Notes from the checks and the judge (fix every one, keep what works)\n- " + "\n- ".join(notes[:14])
           + "\n\nReply with the COMPLETE corrected shot list.")
    reply = session.json("director", SYSTEM, ask, max_tokens=7000)
    return reply.get("shots") or []

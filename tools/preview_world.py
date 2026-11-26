"""Developer tool: render one still of every location x camera (wides + member framings) into a contact sheet, so a
change to a set or a camera number can be checked by eye before it reaches a real video. Makes no model calls.

  python tools/preview_world.py                  # every location, its first mood
  python tools/preview_world.py --mood night     # force a mood where the location has it
  python tools/preview_world.py --only street
Writes out/preview_world/sheet_<location>.jpg and prints the engine's guard warnings.
"""
import argparse
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import compiler, engine, music, variety  # noqa: E402
from pipeline.common import OUT, locations, write_json  # noqa: E402

WORD = 0.4


def fake_words(n_words):
    words, t = [], 0.1
    for i in range(n_words):
        words.append({"w": f"w{i}", "s": round(t, 3), "e": round(t + WORD - 0.05, 3)})
        t += WORD
    return {"duration": round(t + 0.3, 3), "lines": [{"id": "l1", "speaker": "NARRATOR", "text": " ".join(w["w"] for w in words),
                                                     "start": words[0]["s"], "end": words[-1]["e"], "words": words}],
            "words": words}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--mood", default=None)
    ap.add_argument("--framings", default="medium,close")
    a = ap.parse_args()
    locs = locations()
    names = [a.only] if a.only else list(locs)
    framings = a.framings.split(",")
    shots = []
    for name in names:
        L = locs[name]
        for w in range(len(L["wides"])):
            shots.append(({"location": name, "spot": next(iter(L["spots"])), "framing": "wide", "wide": L["wides"][w]["name"]}, f"{name} wide:{L['wides'][w]['name']}"))
        for spot in L["spots"]:
            for f in framings:
                shots.append(({"location": name, "spot": spot, "framing": f}, f"{name}/{spot} {f}"))
    words = fake_words(len(shots) * 2 + 2)
    look = variety.pick(7, {"videos": []}, names)
    look["locations"] = names
    look["moods"] = {n: (a.mood if a.mood in locs[n]["moods"] else locs[n]["moods"][0]) for n in names}
    look["laptop"] = ["INBOX (0)", "MEETINGS: 0", "REVENUE: 0"]
    shot_list = []
    for i, (s, _) in enumerate(shots):
        s = dict(s)
        s.update({"start": {"line": 1, "word": i * 2}, "move": "hold", "ceo": {"action": "idle", "expression": "neutral"}})
        shot_list.append(s)
    checked, repairs = compiler.check_shots(shot_list, words, look)
    plan = compiler.compile_plan(checked, words, {"title": "preview", "lines": [{"caption": "preview"}]}, look)
    plan["audio"]["sfx"] = []
    slug = "_preview_world"
    d = engine.project_dir(slug)
    write_json(d / "words.json", words)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", str(words["duration"]), str(d / "voice.wav")], check=True)
    music.bed("keys", words["duration"], 72, 0, 1, d / "music.wav")
    music.ensure_sfx()
    engine.write_plan(slug, plan)
    ok, problems = engine.check_plan(slug)
    if not ok:
        sys.exit(f"plan refused: {problems}")
    mids = [(i * 2 + 1) * WORD + 0.1 for i in range(len(shots))]
    paths, guards = engine.stills(slug, mids, scale=0.5)
    out = OUT / "preview_world"
    out.mkdir(parents=True, exist_ok=True)
    by_loc = {}
    for p, (s, lab) in zip(paths, shots):
        by_loc.setdefault(s["location"], []).append((p, lab))
    for name, items in by_loc.items():
        engine.contact_sheet([p for p, _ in items], [lab for _, lab in items], out / f"sheet_{name}.jpg", cols=5, width=216)
        print("sheet:", out / f"sheet_{name}.jpg")
    print("repairs:", repairs)
    print("guards:\n  " + "\n  ".join(guards))


if __name__ == "__main__":
    main()

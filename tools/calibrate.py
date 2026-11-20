"""Stage check: renders every location with 3 actors (wide) and 2 actors (two-shot) and writes contact sheets.

  python tools/calibrate.py [loc ...]   # -> out/calibrate/sheet-*.png  (look at them before changing catalog.STAGE)
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from pipeline import catalog, render, storyboard  # noqa: E402
from pipeline.common import OUT, load_config  # noqa: E402
os.chdir(ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from shorts.scene import write_story  # noqa: E402

LOCS = sys.argv[1:] or [k for k in catalog.LOCATIONS if k != "town_overview"]
CAST = {"leo": {"extends": "kid_boy", "hair": {"color": "ginger"}, "top": {"style": "hoodie", "color": "royal"}},
        "mia": {"extends": "kid_girl", "hair": {"style": "pigtails", "color": "goldenBlonde"}, "scale": 0.8},
        "rocky": {"extends": "bully", "top": {"style": "jacket", "color": "red"}}}


def main():
    cfg = load_config()
    story, shots, timings, t = {"beats": []}, [], {}, 0
    for loc in LOCS:
        for name, who, night in (("a", ["leo", "mia", "rocky"], False), ("b", ["leo", "rocky"], True)):
            bid = f"b{len(story['beats']) + 1}"
            story["beats"].append({"id": bid, "text": f"{loc} {name}"})
            timings[bid] = {"startFrame": t, "endFrame": t + 40, "startSec": t / 30, "endSec": (t + 40) / 30, "text": ""}
            t += 40
            shots.append({"beat": bid, "loc": loc, "night": night, "cam": "wide" if name == "a" else "two",
                          "actors": {a: {"anim": "idle", "expr": "smile"} for a in who}})
    cues = {"beatTimings": timings, "durationInFrames": t, "captions": []}
    board = {"cast": CAST, "variant": "blue", "shots": shots}
    scenes, cast, problems = storyboard.compile_story(story, board, cues, cfg)
    print("problems:", problems)
    write_story("calibrate", scenes, cast, cues)
    render.bundle()
    print("\n".join(render.stills(scenes, OUT / "calibrate")))


if __name__ == "__main__":
    main()

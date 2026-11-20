"""Step B: the LLM picks cast, places, actions and moods per beat. This module turns that into exact scenes.

The LLM never writes coordinates, cameras or code. Everything numeric is decided here, deterministically, and the
engine's own rule checks (spacing, shot lengths, scene coverage) run on the result, so the video cannot break the rules.
"""
import math
import sys

from . import catalog, llm
from .common import ROOT

sys.path.insert(0, str(ROOT / "scripts"))
from shorts.scene import (FPS, HALF, SHOT_MAX, SHOT_MIN, _scale, check_scenes, check_shots,  # noqa: E402
                          check_spacing, close_up, face, kf, medium, shot, wide)

MIN_SCENE_SEC = 1.5
LOCOMOTION = {"walk", "sprint"}
ONE_SHOT_ANIMS = {"walk", "sprint", "jump", "wave", "point"}   # not repeated forever when a later beat does not mention them
COOKED_KEYS = {"extends", "skin", "hair", "top", "bottom", "shoes", "accessories", "facialHair", "facialHairColor",
               "freckles", "blush", "scale"}
OVERVIEW_SHOTS = [
    ([-10, 62, 74], [-2, 46, 56], [8, 0, -6], [6, 2, -8], 55),
    ([34, 44, 62], [22, 32, 50], [0, 0, -6], [0, 3, -6], 55),
    ([-44, 38, 54], [-30, 28, 44], [0, 0, -6], [0, 3, -6], 55),
]
PATTERN_ONE = ["wide", "medium", "close", "medium", "close"]
PATTERN_MANY = ["wide", "close", "two", "close", "medium"]


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------
def build_prompt(story, cues, cfg):
    cat = catalog
    beats = "\n".join(f"{b['id']} ({cues['beatTimings'][b['id']]['endSec'] - cues['beatTimings'][b['id']]['startSec']:.1f}s)"
                      f"{' SHOUT' if b.get('shout') else ''}: {b['text']}" for b in story["beats"])
    system = llm.fill(
        (ROOT / "prompts" / "storyboard.md").read_text(encoding="utf-8"),
        presets=", ".join(cat.PRESETS), hair_styles=", ".join(cat.HAIR_STYLES), hair_colors=", ".join(cat.HAIR_COLORS),
        skin=", ".join(cat.SKIN_TONES), tops=", ".join(cat.TOP_STYLES), cloth=", ".join(cat.CLOTH_COLORS),
        bottoms=", ".join(cat.BOTTOM_STYLES), shoes=", ".join(cat.SHOE_STYLES), accessories=", ".join(cat.ACCESSORIES),
        locations="\n".join(f"  {k}: {v}" for k, v in cat.LOCATIONS.items()), variants=", ".join(cat.VARIANTS),
        anims=", ".join(cat.ANIMS), exprs=", ".join(cat.EXPRESSIONS), props=", ".join(cat.PROPS),
        sfx=", ".join(cat.SFX),
        hook_rule=("the FIRST beat uses it (aerial hook while the rule is spoken); no other beat does."
                   if cfg["story"]["hook_style"] == "aerial" else "do not use it."))
    user = f"TITLE: {story['title']}\nRULE: {story['rule']}\nBEATS (id, spoken length):\n{beats}"
    return system, user


# ---------------------------------------------------------------------------
# Validation of the LLM's JSON (shape only; geometry is compiled afterwards)
# ---------------------------------------------------------------------------
def shape_problems(board, story, cfg):
    errs = []
    cast = board.get("cast")
    errs += catalog.cast_problems(cast)
    if errs:
        return errs
    for cid, look in list(cast.items()):
        if isinstance(look, dict):
            cast[cid] = {k: v for k, v in look.items() if k in COOKED_KEYS}
    if board.get("variant", "blue") not in catalog.VARIANTS:
        errs.append(f"variant must be one of {catalog.VARIANTS}")
    shots = board.get("shots")
    ids = [b["id"] for b in story["beats"]]
    if not isinstance(shots, list) or [s.get("beat") for s in shots if isinstance(s, dict)] != ids:
        return errs + [f"'shots' must have exactly one entry per beat, in this order: {ids}"]
    known = set(cast) | set(catalog.PRESETS)
    for s in shots:
        b = s["beat"]
        if s.get("loc") not in catalog.LOCATIONS:
            errs.append(f"{b}: loc '{s.get('loc')}' not in {list(catalog.LOCATIONS)}")
            continue
        actors = s.get("actors") or {}
        if not isinstance(actors, dict):
            errs.append(f"{b}: actors must be an object")
            continue
        if len(actors) > 3:
            errs.append(f"{b}: {len(actors)} characters in one beat, max 3")
        if s["loc"] == "town_overview" and actors:
            errs.append(f"{b}: town_overview has no actors")
        for aid, st in actors.items():
            st = st if isinstance(st, dict) else {}
            if aid not in known:
                errs.append(f"{b}: actor '{aid}' is not in cast")
            if st.get("anim", "idle") not in catalog.ANIMS:
                errs.append(f"{b}.{aid}: anim '{st.get('anim')}' not in {catalog.ANIMS}")
            if st.get("expr", "smile") not in catalog.EXPRESSIONS:
                errs.append(f"{b}.{aid}: expr '{st.get('expr')}' not in {catalog.EXPRESSIONS}")
            if st.get("prop") not in (None, "none", *catalog.PROPS):
                errs.append(f"{b}.{aid}: prop '{st.get('prop')}' not in {catalog.PROPS}")
        if s.get("cam") not in (None, *catalog.CAMS):
            errs.append(f"{b}: cam must be one of {catalog.CAMS}")
        if s.get("sfx") not in (None, *catalog.SFX):
            errs.append(f"{b}: sfx '{s.get('sfx')}' not in {catalog.SFX}")
        if s.get("focus") and s["focus"] not in known:
            errs.append(f"{b}: focus '{s['focus']}' is not in cast")
    if shots and cfg["story"]["hook_style"] == "aerial" and shots[0].get("loc") != "town_overview":
        errs.append("the first beat must use loc town_overview (aerial hook)")
    return errs


# ---------------------------------------------------------------------------
# Compiler pieces (pure functions, unit-tested)
# ---------------------------------------------------------------------------
def plan_cuts(windows, lo, target):
    """windows: [[start, end, spec]] contiguous -> same shape, every piece between lo and SHOT_MAX frames.
    Short windows merge into a neighbour (the longer one keeps its spec), long ones split into equal pieces."""
    w = [list(x) for x in windows]
    while len(w) > 1 and min(x[1] - x[0] for x in w) < lo:
        i = min(range(len(w)), key=lambda k: w[k][1] - w[k][0])
        j = i - 1 if i > 0 else 1
        a, b = sorted((i, j))
        keep = w[a] if (w[a][1] - w[a][0]) >= (w[b][1] - w[b][0]) else w[b]
        w[a:b + 1] = [[w[a][0], w[b][1], keep[2]]]
    out = []
    for s, e, spec in w:
        n = round((e - s) / target) if (e - s) > target * 1.5 else 1
        n = max(1, n)
        edges = [s + round((e - s) * k / n) for k in range(n + 1)]
        for k in range(n):
            out.append([edges[k], edges[k + 1], spec if k == 0 else None])
    return out


def _mean(vals):
    return sum(vals) / len(vals)


def camera(kind, a, b, pos, focus, scale, idx, shake, cam_dx=0.0):
    """One camera shot. pos = {actor: [x, y, z]} of the actors in the scene; cam_dx moves wide/two cameras sideways."""
    xs = [p[0] for p in pos.values()]
    cx, z = _mean(xs) + cam_dx, _mean([p[2] for p in pos.values()])
    drift = 0.8 if idx % 2 else -0.8
    if kind == "wide":
        big = len(pos) >= 3
        return wide(a, b, (cx + drift, 0, z), dist=23 if big else 20, fov=60 if big else 58)
    if kind == "two":
        return medium(a, b, (cx + drift * 0.5, 0, z), dist=19, fov=58)
    fx, _, fz = pos[focus]
    if kind == "medium":
        return medium(a, b, (fx, 0, fz), dist=12, fov=50, shake=shake)
    return close_up(a, b, [fx, 0, fz], scale=scale, side=1.6 if idx % 2 else -1.6, shake=shake)


def facing(me, others, ordinal):
    """rotationY: turned part-way to the nearest other actor (faces stay readable); alone: small alternating turn."""
    if not others:
        return 0.0
    near = min(others, key=lambda o: math.hypot(o[0] - me[0], o[2] - me[2]))
    return 0.45 * face(me, near)


def _states(scene_shots, order):
    """Per beat: {actor: (anim, expr, prop)}; actors inherit the previous state (one-shot anims fall back to idle)."""
    cur, out, first = {}, [], {}
    for s in scene_shots:
        for aid, st in (s.get("actors") or {}).items():
            st = st if isinstance(st, dict) else {}
            first.setdefault(aid, (st.get("anim", "idle"), st.get("expr", "smile"), st.get("prop")))
    for s in scene_shots:
        listed = s.get("actors") or {}
        for aid in order:
            if aid in listed:
                st = listed[aid] if isinstance(listed[aid], dict) else {}
                prev = cur.get(aid, first[aid])
                cur[aid] = (st.get("anim", "idle"), st.get("expr", prev[1]), st.get("prop", prev[2]))
            else:
                prev = cur.get(aid, first[aid])
                cur[aid] = ("idle" if prev[0] in ONE_SHOT_ANIMS else prev[0], prev[1], prev[2])
        out.append(dict(cur))
    return out


def build_scene(sid, loc, meta, scene_shots, beat_windows, order, cast, cfg, moves):
    """One scene dict from its shots and beat windows [(start, end, beat_id, is_shout)]."""
    start, end = beat_windows[0][0], beat_windows[-1][1]
    sc = {"id": sid, "location": loc, "startFrame": start, "endFrame": end, "cameraShots": [], "characters": {}}
    if loc in catalog.FAMILY_LOCATIONS:
        sc["variant"] = meta["variant"]
    if meta.get("night"):
        sc["isNight"] = True
    if meta.get("board") and loc == "classroom":
        sc["boardText"] = [str(x)[:24] for x in meta["board"]][:4]

    lo = round(cfg["cuts"]["min_sec"] * FPS)
    target = cfg["cuts"]["target_sec"] * FPS
    specs = [[s_, e_, {"cam": sh.get("cam"), "focus": sh.get("focus") or next(iter(sh.get("actors") or {}), None),
                       "shake": shout}] for (s_, e_, _b, shout), sh in zip(beat_windows, scene_shots)]
    cuts = plan_cuts(specs, lo, target)

    if loc == "town_overview":
        for k, (a, b, _spec) in enumerate(cuts):
            fp, tp, ft, tt, fov = OVERVIEW_SHOTS[k % len(OVERVIEW_SHOTS)]
            sc["cameraShots"].append(shot(a, b, fp, tp, ft, tt, fov))
        return sc

    n = len(order)
    slots = catalog.stage(loc, n)
    pos = {aid: [slots[i][0], 0.0, slots[i][1]] for i, aid in enumerate(order)}
    states = _states(scene_shots, order)

    pattern, idx, prev, ring = (PATTERN_ONE if n == 1 else PATTERN_MANY), 0, None, 0
    for a, b, spec in cuts:
        kind, focus = (spec or {}).get("cam"), (spec or {}).get("focus")
        if kind is None:
            for _ in range(len(pattern)):
                kind = pattern[idx % len(pattern)]
                idx += 1
                if kind != (prev[0] if prev else None):
                    break
        if kind == "two" and n == 1:
            kind = "medium"
        if kind in ("medium", "close"):
            if focus not in pos:
                focus = order[ring % n]
            ring += 1
            if prev and prev == (kind, focus) and n > 1:
                focus = order[ring % n]
                ring += 1
        prev = (kind, focus if kind in ("medium", "close") else None)
        sc["cameraShots"].append(camera(kind, a, b, pos, focus, _scale(focus, cast) if focus else 1.0,
                                        len(sc["cameraShots"]), 0.08 if (spec or {}).get("shake") else None,
                                        catalog.STAGE.get(loc, {}).get("cam_dx", 0.0)))

    for i, aid in enumerate(order):
        me, others = pos[aid], [p for k, p in pos.items() if k != aid]
        ry = facing(me, others, i)
        keys = []
        for (ws, we, _b, _s), st in zip(beat_windows, states):
            anim, expr, prop = st[aid][0], st[aid][1], st[aid][2]
            if moves and anim in LOCOMOTION:
                sign = 1 if me[0] > 0 else -1
                if me[0] == 0:
                    sp, srot = [me[0], 0.0, me[2] - 3.0], 0.0
                else:
                    sp, srot = [me[0] + 5.0 * sign, 0.0, me[2]], -sign * HALF
                keys += [kf(ws, sp, srot, anim, expr, prop), kf(max(ws + 1, we - 2), me, ry, anim, expr, prop)]
            else:
                keys.append(kf(ws, me, ry, anim, expr, prop))
        keys.append(kf(end, me, ry, keys[-1]["anim"], keys[-1]["expression"], keys[-1].get("prop")))
        sc["characters"][aid] = keys
    return sc


def compile_story(story, board, cues, cfg):
    """-> (scenes, cast, problems). Deterministic: same input, same output."""
    B = {k: v["startFrame"] for k, v in cues["beatTimings"].items()}
    END = cues["durationInFrames"]
    cast = board["cast"]
    shots = {s["beat"]: s for s in board["shots"]}
    ids = [b["id"] for b in story["beats"]]
    shout = {b["id"]: bool(b.get("shout")) for b in story["beats"]}
    cast_order = list(cast) + [p for p in catalog.PRESETS if p not in cast]

    groups = []   # consecutive beats in the same place; a new group also starts when more than 3 different actors would share it
    for bid in ids:
        s = shots[bid]
        key = (s["loc"], bool(s.get("night")), tuple(s.get("board") or ()))
        who = set(s.get("actors") or {})
        if groups and groups[-1]["key"] == key and len(groups[-1]["who"] | who) <= 3:
            groups[-1]["ids"].append(bid)
            groups[-1]["who"] |= who
        else:
            groups.append({"key": key, "ids": [bid], "who": who, "loc": s["loc"], "night": bool(s.get("night")),
                           "board": list(s.get("board") or [])})
    problems, scenes = [], []
    for gi, g in enumerate(groups):
        gs = 0 if gi == 0 else B[g["ids"][0]] - 1
        ge = END if gi == len(groups) - 1 else B[groups[gi + 1]["ids"][0]] - 1
        wins = []
        for j, bid in enumerate(g["ids"]):
            ws = gs if j == 0 else B[bid]
            we = B[g["ids"][j + 1]] if j + 1 < len(g["ids"]) else ge
            wins.append((ws, we, bid, shout[bid]))
        if (ge - gs) < MIN_SCENE_SEC * FPS:
            problems.append(f"the stay in {g['loc']} at beats {g['ids']} lasts only {(ge - gs) / FPS:.1f}s: "
                            f"give a place at least {MIN_SCENE_SEC}s (merge it into the neighbouring place)")
        order = sorted(g["who"], key=lambda a: cast_order.index(a) if a in cast_order else 99)
        if not order and g["loc"] != "town_overview":
            problems.append(f"{g['loc']} at beats {g['ids']}: needs at least one character")
            continue
        meta = {"night": g["night"], "board": g["board"], "variant": board.get("variant", "blue")}
        sc_shots = [shots[b] for b in g["ids"]]
        sc = build_scene(f"s{gi + 1}", g["loc"], meta, sc_shots, wins, order, cast, cfg, moves=True)
        if check_spacing([sc], cast):   # a walking entrance may clip a neighbour: stand still instead
            sc = build_scene(f"s{gi + 1}", g["loc"], meta, sc_shots, wins, order, cast, cfg, moves=False)
        scenes.append(sc)
    if not problems:
        problems = check_scenes(scenes, END) + check_shots(scenes) + check_spacing(scenes, cast)
    return scenes, cast, problems


def plan_audio(story, board, music_file):
    """-> (sfx list, music dict or None) from fixed rules + the LLM's optional per-beat sfx."""
    ids = [b["id"] for b in story["beats"]]
    shots = {s["beat"]: s for s in board["shots"]}
    sfx = [(ids[0], "whoosh")]
    prev_loc = shots[ids[0]]["loc"]
    for bid in ids[1:]:
        if shots[bid]["loc"] != prev_loc:
            sfx.append((f"{bid}-0.05", "whoosh"))
        prev_loc = shots[bid]["loc"]
    for bid in ids:
        if shots[bid].get("sfx"):
            sfx.append((f"{bid}+0.15", shots[bid]["sfx"]))
    shouts = [b["id"] for b in story["beats"] if b.get("shout")]
    music = {"file": music_file, "under_voice": 0.022, "gaps": 0.05, "dropouts": []} if music_file else None
    if shouts:
        before = ids[ids.index(shouts[0]) - 1]
        sfx.append((f"{before}.end-1.5", "riser", {"dur": 1.6}))
        sfx += [(w, "impact") for w in shouts[:-1]] + [(shouts[-1], "reveal")]
        if music:
            music["dropouts"] = [(f"{before}.end-0.3", f"{shouts[-1]}.end")]
    if not shots[ids[-1]].get("sfx"):
        sfx.append((f"{ids[-1]}+0.8", "twist"))
    return sfx, music


def write(story, cues, cfg, feedback=""):
    """Ask the LLM for the storyboard, compile it, and return {"board", "scenes", "cast"} (validated)."""
    system, user = build_prompt(story, cues, cfg)
    if feedback:
        user += f"\n\n{feedback}"

    def validate(board):
        errs = shape_problems(board, story, cfg)
        if errs:
            raise ValueError("; ".join(errs))
        scenes, cast, problems = compile_story(story, board, cues, cfg)
        if problems:
            raise ValueError("; ".join(problems))
        return {"board": board, "scenes": scenes, "cast": cast}

    return llm.ask_json(system, user, validate, temperature=0.7, max_tokens=5000)

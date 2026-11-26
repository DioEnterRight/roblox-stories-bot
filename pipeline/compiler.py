"""SHOT LIST -> ENGINE PLAN. The director (an LLM, or auto_director below) writes a short shot list in plain words
(location, spot, framing, move, actions, cards...). This module checks it against the world (locations.json) and the
voice timings, repairs what it safely can (logging every repair), and compiles it into the engine's plan.json.

Everything the director cannot break lives here: camera numbers, cast positions, word anchors, timing limits, text limits.

Shot list (one object per shot, in order):
  {"start": {"line": 1, "word": 0},            # the shot starts on this word (line 1-based, word 0-based)
   "location": "apartment", "spot": "desk", "framing": "medium", "move": "push_in",
   "ceo": {"action": "type", "expression": "neutral", "hold": "coffee"},
   "extra": {"persona": "mom", "action": "shake", "expression": "angry"},          # optional second character
   "events": [{"word": {"line": 1, "word": 3}, "do": "hop"}],                     # hop | nod | shake | cheer | sparkle | confetti | exit
   "card": {"kind": "stat", "label": "MEETINGS", "value": "0", "at": {...}},       # optional, see CARD_KINDS
   "stamp": {"text": "CANCELLED", "color": "red", "at": {...}},                    # optional
   "insert": {"device": "phone", "app": "chat", "title": "Mom", "lines": ["< beta job?"]},  # optional screen insert
   "laptop": ["INBOX (0)", "REVENUE: 0"]}                                         # optional text on the laptop screen
"""
import copy
import math

from .common import latin_only, locations, log, stable_seed

FRAMINGS = ["wide", "medium", "close", "face", "low", "high", "two_shot", "ots"]
MOVES = ["push_in", "pull_out", "orbit_left", "orbit_right", "rise", "hold"]
ACTIONS = ["idle", "type", "scroll", "write", "point", "cheer", "raise", "cross", "nod", "shake", "bounce", "look", "sad"]
EXPRESSIONS = ["neutral", "happy", "angry", "sceptic", "sad", "worried", "sleepy", "surprised", "closed", "x"]
HOLDS = ["none", "phone", "coffee", "pencil", "bag", "calculator", "magnifier"]
PERSONAS = ["mom", "dad", "investor", "intern", "friend", "landlord", "barista", "hr", "rival"]
EVENTS = ["hop", "nod", "shake", "cheer", "sparkle", "confetti", "exit"]
CARD_KINDS = ["stat", "role", "flaw", "timer", "counter"]
APPS = ["calendar", "email", "bank", "chat", "notes", "social", "search"]
COLORS = ["red", "green", "gold", "blue", "orange"]

# member framings: camera relative to the CEO's head (metres): dist in front, height above, side offset, fov, look height
MEMBER = {   # the box cast is ~1 m wide: in a 9:16 frame these put it at ~45 % / 60 % / 80 % of the width
    "medium": dict(dist=5.6, height=0.55, side=0.9, fov=40, lookY=0.55),
    "close": dict(dist=4.0, height=0.35, side=0.6, fov=36, lookY=0.58),
    "face": dict(dist=3.4, height=0.16, side=0.35, fov=34, lookY=0.6),
    "low": dict(dist=4.2, height=-0.32, side=0.8, fov=44, lookY=0.72),
    "high": dict(dist=4.4, height=2.6, side=0.5, fov=42, lookY=0.4),
}
MIN_SHOT, MAX_SHOT = 0.8, 4.2
CAPTION_SAFE_TOP = 330          # card centre y (px): top band, clear of faces in close-ups and of the captions


class Repairs(list):
    def note(self, msg):
        self.append(msg)
        log(f"compiler: {msg}")


# ---------------------------------------------------------------- timing helpers
def word_time(words, ref):
    """ref {"line": n (1-based), "word": i (0-based, negative from the end)} -> (seconds, line_id, index) or None."""
    try:
        li = int(ref["line"]) - 1
        wi = int(ref.get("word", 0))
    except (KeyError, TypeError, ValueError):
        return None
    lines = words["lines"]
    if not 0 <= li < len(lines):
        return None
    ws = lines[li]["words"]
    if not ws:
        return None
    if wi < 0:
        wi += len(ws)
    if not 0 <= wi < len(ws):
        return None
    return ws[wi]["s"], lines[li]["id"], wi


def all_words(words):
    """[(time, line_no 1-based, word_index)] for every spoken word."""
    out = []
    for li, line in enumerate(words["lines"]):
        for wi, w in enumerate(line["words"]):
            out.append((w["s"], li + 1, wi))
    return out


def nearest_word(words, t):
    return min(all_words(words), key=lambda x: abs(x[0] - t))


def reel_end(words):
    return words["lines"][-1]["words"][-1]["e"]


# ---------------------------------------------------------------- shot list checks + repairs
def _clip_text(s, n):
    s = latin_only(s or "")
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _pick(value, allowed, default):
    return value if value in allowed else default


def sanitize(shots, words, look, repairs):
    """Every field inside its vocabulary; impossible choices replaced (and noted). Returns a new list."""
    locs = locations()
    allowed_locs = [l for l in look["locations"] if l in locs] or ["apartment"]
    out = []
    shots = shots if isinstance(shots, list) else []
    if len(shots) > 40:
        repairs.note(f"{len(shots)} shots is far too many: keeping the first 40")
        shots = shots[:40]
    for i, raw in enumerate(shots):
        if not isinstance(raw, dict):
            repairs.note(f"shot {i + 1} is not an object: dropped")
            continue
        s = copy.deepcopy(raw)
        loc = s.get("location")
        if loc not in allowed_locs:
            if loc is not None:
                repairs.note(f"shot {i + 1}: location {loc!r} not in this video's set {allowed_locs}: using {allowed_locs[0]}")
            loc = out[-1]["location"] if out else allowed_locs[0]
        s["location"] = loc
        spots = locs[loc]["spots"]
        if s.get("spot") not in spots:
            if s.get("spot") is not None:
                repairs.note(f"shot {i + 1}: spot {s.get('spot')!r} not in {loc} {list(spots)}")
            s["spot"] = next(iter(spots))
        s["framing"] = _pick(s.get("framing"), FRAMINGS, "medium")
        s["move"] = _pick(s.get("move"), MOVES, "push_in")
        ceo = s.get("ceo") if isinstance(s.get("ceo"), dict) else {}
        s["ceo"] = {"action": _pick(ceo.get("action"), ACTIONS, "idle"), "expression": _pick(ceo.get("expression"), EXPRESSIONS, "neutral"),
                    "hold": _pick(ceo.get("hold"), HOLDS, "none")}
        ex = s.get("extra")
        if isinstance(ex, dict) and ex.get("persona") in PERSONAS:
            s["extra"] = {"persona": ex["persona"], "action": _pick(ex.get("action"), ACTIONS, "idle"),
                          "expression": _pick(ex.get("expression"), EXPRESSIONS, "neutral"), "place": int(ex.get("place", 0) or 0)}
        else:
            if ex:
                repairs.note(f"shot {i + 1}: extra {ex!r} is not a known persona {PERSONAS}: dropped")
            s.pop("extra", None)
        if s["framing"] in ("two_shot", "ots") and "extra" not in s:
            repairs.note(f"shot {i + 1}: {s['framing']} needs a second character: using close")
            s["framing"] = "close"
        if s["framing"] == "low" and not spots[s["spot"]].get("low_ok", True):
            repairs.note(f"shot {i + 1}: low angle is blocked at {loc}/{s['spot']} (furniture in front): using close")
            s["framing"] = "close"
        s["events"] = [e for e in (s.get("events") or []) if isinstance(e, dict) and e.get("do") in EVENTS and isinstance(e.get("word"), dict)]
        card = s.get("card")
        if isinstance(card, dict) and card.get("kind") in CARD_KINDS:
            s["card"] = {"kind": card["kind"], "label": _clip_text(card.get("label"), 14).upper(), "value": _clip_text(card.get("value"), 9),
                         "text": _clip_text(card.get("text"), 22).upper(), "color": _pick(card.get("color"), COLORS, "orange"),
                         "count_to": card.get("count_to") if isinstance(card.get("count_to"), int) and 0 < card["count_to"] < 10_000_000 else None,
                         "at": card.get("at") if isinstance(card.get("at"), dict) else None}
            if s["card"]["kind"] in ("role", "flaw") and not s["card"]["text"]:
                s["card"]["text"] = s["card"]["label"] or s["card"]["value"]
            if not (s["card"]["text"] or s["card"]["label"] or s["card"]["value"] or s["card"]["count_to"]):
                s.pop("card")
        else:
            s.pop("card", None)
        st = s.get("stamp")
        if isinstance(st, dict) and latin_only(st.get("text", "")):
            s["stamp"] = {"text": _clip_text(st["text"], 14).upper(), "color": _pick(st.get("color"), COLORS, "red"),
                          "at": st.get("at") if isinstance(st.get("at"), dict) else None}
        else:
            s.pop("stamp", None)
        ins = s.get("insert")
        if isinstance(ins, dict) and isinstance(ins.get("lines"), list) and ins["lines"]:
            s["insert"] = {"device": _pick(ins.get("device"), ["laptop", "phone"], "phone"), "app": _pick(ins.get("app"), APPS, "notes"),
                           "title": _clip_text(ins.get("title"), 22), "lines": [_clip_text(x, 30) for x in ins["lines"][:5] if latin_only(str(x))],
                           "highlight": ins.get("highlight") if isinstance(ins.get("highlight"), int) else None,
                           "strike": [x for x in (ins.get("strike") or []) if isinstance(x, int)][:3]}
            if not s["insert"]["lines"]:
                s.pop("insert")
            elif s["framing"] in ("wide", "high", "low", "two_shot", "ots"):
                s["framing"] = "medium"   # a floating screen needs him medium/close behind it
        else:
            s.pop("insert", None)
        lap = s.get("laptop")
        s["laptop"] = [_clip_text(x, 24) for x in lap[:4]] if isinstance(lap, list) else None
        out.append(s)
    return out


def fix_timing(shots, words, repairs):
    """Starts on real words, strictly increasing, every shot 0.8-4.2 s (merge short ones, split long ones)."""
    end = reel_end(words) + 0.35
    timed = []
    for i, s in enumerate(shots):
        wt = word_time(words, s.get("start") or {})
        if wt is None:
            if i == 0:
                wt = word_time(words, {"line": 1, "word": 0})
            else:
                repairs.note(f"shot {i + 1}: start word {s.get('start')} does not exist: dropped")
                continue
        if i == 0 and wt[0] > 0.05:
            wt = word_time(words, {"line": 1, "word": 0})
        s["_t"] = 0.0 if not timed else wt[0]
        s["start"] = {"line": int(wt[1][1:]), "word": wt[2]}
        timed.append(s)
    timed.sort(key=lambda s: s["_t"])
    # merge shots shorter than MIN_SHOT into the previous one (keep the earlier shot's staging)
    merged = []
    for s in timed:
        if merged and s["_t"] - merged[-1]["_t"] < MIN_SHOT - 1e-6:
            repairs.note(f"shot at {s['_t']:.2f}s starts {s['_t'] - merged[-1]['_t']:.2f}s after the previous one: merged")
            for k in ("card", "stamp", "insert"):
                if k in s and k not in merged[-1]:
                    merged[-1][k] = s[k]
            merged[-1]["events"] = merged[-1].get("events", []) + s.get("events", [])
            continue
        merged.append(s)
    if merged and end - merged[-1]["_t"] < MIN_SHOT - 1e-6 and len(merged) > 1:
        repairs.note("last shot shorter than 0.8 s: merged into the one before")
        merged.pop()
    # split shots longer than MAX_SHOT into even pieces (~2.6 s) cut on the nearest words; each piece changes framing
    alt = {"wide": "medium", "medium": "close", "close": "medium", "face": "medium", "low": "medium", "high": "close",
           "two_shot": "close", "ots": "close"}
    out = []
    for i, s in enumerate(merged):
        nxt = merged[i + 1]["_t"] if i + 1 < len(merged) else end
        out.append(s)
        span = nxt - s["_t"]
        if span <= MAX_SHOT:
            continue
        pieces = max(2, math.ceil(span / 2.6))
        prev, cur = s["_t"], s
        for k in range(1, pieces):
            t, ln, wi = nearest_word(words, s["_t"] + span * k / pieces)
            if t < prev + MIN_SHOT or t > nxt - MIN_SHOT:
                continue
            twin = copy.deepcopy(cur)
            for key in ("card", "stamp", "insert"):
                twin.pop(key, None)
            twin["events"] = []
            twin["_t"], twin["start"] = t, {"line": ln, "word": wi}
            twin["framing"] = alt[cur["framing"]]
            twin["move"] = "orbit_left" if cur["move"] != "orbit_left" else "orbit_right"
            repairs.note(f"shot at {s['_t']:.2f}s ran {span:.1f}s: cut again at {t:.2f}s ({twin['framing']})")
            out.append(twin)
            prev, cur = t, twin
    return out


def fix_cuts(shots, repairs):
    """No jump cuts: the same location + spot + framing twice in a row becomes a different framing."""
    cycle = ["medium", "close", "wide", "face", "high"]
    for prev, s in zip(shots, shots[1:]):
        if (prev["location"], prev["spot"], prev["framing"]) == (s["location"], s["spot"], s["framing"]) and s["framing"] != "wide":
            new = next(f for f in cycle if f != s["framing"])
            repairs.note(f"jump cut at {s['_t']:.2f}s ({s['location']}/{s['spot']}/{s['framing']} twice): now {new}")
            s["framing"] = new
        elif prev["location"] == s["location"] and prev["framing"] == s["framing"] == "wide":
            repairs.note(f"two wides of {s['location']} in a row at {s['_t']:.2f}s: the second is now medium")
            s["framing"] = "medium"
    return shots


def check_shots(shots, words, look):
    """-> (repaired shots ready to compile, list of repairs made)."""
    repairs = Repairs()
    s = sanitize(shots, words, look, repairs)
    if not s:
        raise ValueError("the shot list is empty")
    s = fix_timing(s, words, repairs)
    s = fix_cuts(s, repairs)
    return s, list(repairs)


# ---------------------------------------------------------------- compile
def _ref(words, ref, fallback):
    """word ref -> plan.mjs ref {"line": "l3", "wordIndex": 2}; falls back when the word does not exist."""
    wt = word_time(words, ref) if isinstance(ref, dict) else None
    if wt is None:
        wt = word_time(words, fallback)
    return {"line": wt[1], "wordIndex": wt[2]}, wt[0]


def _move_params(move, dur, wide):
    k = min(1.0, 0.45 + 0.18 * dur)
    if move == "push_in":
        return {"push": (0.08 if wide else 0.13) * k}
    if move == "pull_out":
        return {"push": (-0.08 if wide else -0.12) * k}
    if move == "orbit_left":
        return {"orbit": -9 * k, "push": 0.03}
    if move == "orbit_right":
        return {"orbit": 9 * k, "push": 0.03}
    if move == "rise":
        return {"rise": 0.28 * k, "push": 0.04}
    return {}


# ---------------------------------------------------------------- the camera solver (mirrors three.js projection)
W_PX, H_PX = 1080, 1920
SAFE = dict(x0=150, x1=930, top=170, center_max=1130, center_min=420)


def _sub(a, b):
    return [a[i] - b[i] for i in range(3)]


def _norm(v):
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _dot(a, b):
    return sum(a[i] * b[i] for i in range(3))


def project(cam_from, look, fov, p):
    """World point -> (x px, y px, depth) in the 1080x1920 frame (same maths as three.js PerspectiveCamera.lookAt)."""
    f = _norm(_sub(look, cam_from))
    r = _norm(_cross(f, [0, 1, 0]))
    u = _cross(r, f)
    d = _sub(p, cam_from)
    zc = _dot(d, f)
    if zc <= 0.05:
        return None
    th = math.tan(math.radians(fov) / 2)
    nx = _dot(d, r) / (zc * th * (W_PX / H_PX))
    ny = _dot(d, u) / (zc * th)
    return ((nx + 1) / 2 * W_PX, (1 - ny) / 2 * H_PX, zc)


def _apply_move(frm, look, prm):
    """The end position of a push / orbit / rise move (same maths as presets.ts resolveCamera)."""
    push = prm.get("push", 0.0)
    orbit = math.radians(prm.get("orbit", 0.0))
    rise = prm.get("rise", 0.0)
    dx, dz = frm[0] - look[0], frm[2] - look[2]
    rr = math.hypot(dx, dz)
    a0 = math.atan2(dx, dz)
    r1 = rr * (1 - push)
    a1 = a0 + orbit
    y1 = look[1] + (frm[1] - look[1]) * (1 - push) + rise
    return [look[0] + math.sin(a1) * r1, y1, look[2] + math.cos(a1) * r1]


def framing_problems(frm, look, fov, cast_pts):
    """cast_pts: [(label, centre, head_top)] -> list of problems in this frame."""
    out = []
    for label, c, top in cast_pts:
        pc, pt = project(frm, look, fov, c), project(frm, look, fov, top)
        if pc is None or pt is None:
            out.append(f"{label} behind camera")
            continue
        if not SAFE["x0"] <= pc[0] <= SAFE["x1"]:
            out.append(f"{label} x {pc[0]:.0f}")
        if pt[1] < SAFE["top"]:
            out.append(f"{label} head cut (y {pt[1]:.0f})")
        if pc[1] > SAFE["center_max"]:
            out.append(f"{label} low (y {pc[1]:.0f})")
    return out


def _clamp_cam(frm, bounds, spot_z):
    x0, x1 = bounds["x"]
    return [min(x1, max(x0, frm[0])), min(bounds["y"][1], max(bounds["y"][0], frm[1])), min(bounds["z_max"], max(spot_z + 1.3, frm[2]))]


def solve(frm, look, fov, move, cast_pts, bounds, spot_z):
    """Aim the camera so every cast member is fully in frame and above the captions at the shot's start AND end.
    Fixes, in order: clamp into the room, re-aim sideways / up-down, step back; then shrink the move if the end breaks."""
    frm = _clamp_cam(list(frm), bounds, spot_z)
    look = list(look)
    for _ in range(14):
        probs = framing_problems(frm, look, fov, cast_pts)
        if not probs:
            break
        cx = sum(c[0] for _, c, _ in cast_pts) / len(cast_pts)
        pcs = [project(frm, look, fov, c) for _, c, _ in cast_pts]
        pts = [project(frm, look, fov, t) for _, _, t in cast_pts]
        if any(p is None for p in pcs + pts):
            frm = _clamp_cam([frm[0], frm[1], frm[2] + 0.8], bounds, spot_z)
            continue
        xs = [p[0] for p in pcs]
        if min(xs) < SAFE["x0"] or max(xs) > SAFE["x1"]:
            look[0] += (cx - look[0]) * 0.5 if abs(cx - look[0]) > 0.05 else 0.0
            if max(xs) - min(xs) > SAFE["x1"] - SAFE["x0"] - 60 or abs(cx - look[0]) <= 0.05:
                frm = _clamp_cam([frm[0], frm[1], frm[2] + 0.6], bounds, spot_z)
        top = min(p[1] for p in pts)
        low = max(p[1] for p in pcs)
        if top < SAFE["top"] and low > SAFE["center_max"]:
            frm = _clamp_cam([frm[0], frm[1], frm[2] + 0.6], bounds, spot_z)
        elif low > SAFE["center_max"]:
            look[1] -= 0.12
        elif top < SAFE["top"]:
            look[1] += 0.12
    prm = dict(move)
    for _ in range(3):
        if not prm:
            break
        end = _apply_move(frm, look, prm)
        end = _clamp_cam(end, bounds, spot_z)
        if not framing_problems(end, look, fov, cast_pts):
            return frm, look, end
        prm = {k: v * 0.5 for k, v in prm.items()}
    return frm, look, _apply_move(frm, look, {"push": 0.025})


def _head(at, y=0.62):
    return [at[0], at[1] + y, at[2]]


def _cast_points(cast):
    pts = []
    for m in cast:
        at = m["at"]
        pts.append((m["id"], [at[0], at[1] + 0.55, at[2]], [at[0], at[1] + 1.05, at[2]]))
    return pts


def _camera(shot, spot, extra_pos, loc, dur, idx, seed, cast):
    """-> (camera spec with explicit from / to / lookAt, traffic flag). All numbers solved here, none left to the engine."""
    framing = shot["framing"]
    wide = framing == "wide"
    move = _move_params(shot["move"], dur, wide)
    traffic = False
    if wide:
        wides = loc["wides"]
        named = [w for w in wides if w["name"] == shot.get("wide")]
        w = named[0] if named else wides[0] if idx == 0 else wides[(seed + idx) % len(wides)]   # the hook gets the best angle
        dx = spot["at"][0] - w["look"][0]           # slide sideways so the CEO is in the middle of the narrow frame
        frm, look, fov = [w["from"][0] + dx, w["from"][1], w["from"][2]], [spot["at"][0], w["look"][1], w["look"][2]], w["fov"]
        traffic = bool(w.get("traffic"))
        pts = _cast_points(cast)
    elif framing in MEMBER:
        side_sign = -1 if (seed + idx) % 2 else 1
        p = MEMBER[framing]
        at = spot["at"]
        head = [at[0], at[1] + p["lookY"], at[2]]
        lift = 0.5 if not spot.get("low_ok", True) and framing in ("medium", "close", "face") else 0.0   # look over the desk / table
        frm = [head[0] + p["side"] * side_sign, head[1] + p["height"] + lift, head[2] + p["dist"]]
        look, fov = head, p["fov"]
        pts = _cast_points([c for c in cast if c["id"] == "ceo"])
    else:
        a = _head(spot["at"])
        b = _head(extra_pos[:3])
        if framing == "two_shot":
            mid = [(a[i] + b[i]) / 2 for i in range(3)]
            dist = max(5.2, math.dist(a, b) * 2.6)
            frm, look, fov = [mid[0], mid[1] + 0.6, mid[2] + dist], mid, 42
            pts = _cast_points(cast)
        else:   # ots: behind the extra's shoulder, looking at the CEO
            d = [a[0] - b[0], a[2] - b[2]]
            n = math.hypot(*d) or 1.0
            frm = [b[0] - d[0] / n * 1.6 + 0.35, b[1] + 0.45, max(b[2] - d[1] / n * 1.6, b[2] + 0.9)]
            look, fov = a, 40
            pts = _cast_points([c for c in cast if c["id"] == "ceo"])
    frm, look, to = solve(frm, look, fov, move, pts, loc["bounds"], spot["at"][2])
    prm = {"from": [round(x, 3) for x in frm], "to": [round(x, 3) for x in to], "lookAt": [round(x, 3) for x in look], "fov": fov}
    if framing in ("close", "face", "ots") or shot.get("insert"):
        dist = math.dist(frm, look)
        prm["dof"] = {"bokeh": 8 if shot.get("insert") else 4.5, "range": 0.4 if shot.get("insert") else 1.2, "focus": round(dist, 3)}
    return {"rig": "push-in", "params": prm}, traffic


def _event_anchor(e, words, shot_ref, who_default):
    ref, _ = _ref(words, e["word"], shot_ref)
    do = e["do"]
    if do in ("hop",):
        return [{"fire": "hop", "at": ref, "payload": {"who": e.get("who", who_default)}}]
    if do in ("nod", "shake", "cheer"):
        return [{"fire": "act", "at": ref, "payload": {"who": e.get("who", who_default), "action": do,
                                                         "expression": {"nod": "happy", "shake": "angry", "cheer": "happy"}[do]}}]
    if do == "sparkle":
        return [{"fire": "sparkle", "at": ref, "payload": {"anchor": who_default}}]
    if do == "confetti":
        return [{"fire": "confetti", "at": ref, "payload": {"anchor": who_default, "n": 46}}]
    if do == "exit":
        return [{"fire": "exit", "at": ref, "payload": {"who": e.get("who", who_default), "to": "right"}}]
    return []


def _within(words, ref, t0, t1):
    wt = word_time(words, ref) if isinstance(ref, dict) else None
    return wt is not None and t0 - 0.01 <= wt[0] < t1


def compile_plan(shots, words, script, look, punch=None):
    """Repaired shots -> plan.json dict for engine/scripts/plan.mjs."""
    locs = locations()
    seed = int(look["seed"])
    end = reel_end(words) + 0.35
    scenes, sfx = [], []
    last_sfx = [-9.0]

    def add_sfx(name, ref, t, gain=-8.0, offset=0.0):
        if t - last_sfx[0] < 0.25:
            return
        last_sfx[0] = t
        sfx.append({"file": f"sfx/{name}.wav", "at": {**ref, "offset": offset} if offset else ref, "gainDb": gain})

    for i, s in enumerate(shots):
        t0 = s["_t"]
        t1 = shots[i + 1]["_t"] if i + 1 < len(shots) else end
        dur = t1 - t0
        loc = locs[s["location"]]
        spot = loc["spots"][s["spot"]]
        shot_ref = s["start"]
        start = {"sec": 0} if i == 0 else {"line": f"l{s['start']['line']}", "wordIndex": s["start"]["word"]}
        mood = look["moods"][s["location"]]
        extra_pos = None
        cast = [{"id": "ceo", "character": "box", "at": spot["at"], "rotY": spot.get("rotY", 0), "action": s["ceo"]["action"],
                 "expression": s["ceo"]["expression"],
                 "props": {"persona": "ceo", "outfit": look["outfit"], **({"hold": s["ceo"]["hold"]} if s["ceo"]["hold"] != "none" else {}),
                           **({"phoneLight": True} if s["ceo"]["hold"] == "phone" and mood in ("night", "rain") else {})}}]
        if "extra" in s:
            places = spot.get("extras") or [[spot["at"][0] + 1.2, spot["at"][1], spot["at"][2] + 0.3, -0.5]]
            extra_pos = places[s["extra"]["place"] % len(places)]
            cast.append({"id": "x1", "character": "box", "at": extra_pos[:3], "rotY": extra_pos[3], "action": s["extra"]["action"],
                         "expression": s["extra"]["expression"], "props": {"persona": s["extra"]["persona"]}})
        camera, traffic = _camera(s, spot, extra_pos, loc, dur, i, seed, cast)
        props = {"mood": mood, "seed": seed, "castOnly": [c["id"] for c in cast]}
        if s["location"] == "street":
            props["traffic"] = traffic
        laptop = s.get("laptop") or look.get("laptop")
        if laptop:
            props["laptop"] = {"lines": laptop[:4], "title": look.get("laptop_title", "DASHBOARD")}
        for k in ("wallSign", "chartTitle", "sign", "menu"):
            if look.get(k):
                props[k] = look[k]
        anchors = []
        for e in s.get("events", []):
            if _within(words, e["word"], t0, t1):
                anchors += _event_anchor(e, words, shot_ref, "ceo")
        if s.get("card"):
            c = s["card"]
            ref, at = _ref(words, c["at"] if c["at"] and _within(words, c["at"], t0, t1) else shot_ref, shot_ref)
            spec = {"id": "card", "kind": c["kind"], "pos": [540, CAPTION_SAFE_TOP], "color": c["color"]}
            if c["kind"] in ("role", "flaw"):
                spec["text"] = c["text"]
            elif c["kind"] == "timer":
                spec["label"] = c["label"] or "TIME"
                spec["stopValue"] = c["count_to"] or 4
            else:
                spec["label"] = c["label"]
                spec["value"] = c["value"]
                if c["count_to"]:
                    spec["count"] = {"from": 0, "to": c["count_to"], "dur": 0.8, "prefix": "", "suffix": ""}
                    anchors.append({"fire": "count", "at": ref, "payload": {"id": "card"}})
            props["cards"] = [spec]
            anchors.append({"fire": "card", "at": ref, "payload": {"id": "card"}})
            add_sfx("pop", ref, at, -9)
        if s.get("stamp"):
            st = s["stamp"]
            ref, at = _ref(words, st["at"] if st["at"] and _within(words, st["at"], t0, t1) else shot_ref, shot_ref)
            props["stamps"] = [{"id": "stamp", "text": st["text"], "color": {"red": "#D9402F", "green": "#2E9E4F", "gold": "#E0A01E",
                                                                              "blue": "#2F6FD8", "orange": "#E2683F"}[st["color"]],
                                "pos": [540, 640], "size": 112, "rot": -8 if (seed + i) % 2 else 7}]
            anchors.append({"fire": "stamp", "at": ref, "payload": {"id": "stamp"}})
            add_sfx("thud", ref, at, -6)
        if s.get("insert"):
            ins = dict(s["insert"])
            ins["accent"] = look["accent_ui"]
            props["insert"] = {k: v for k, v in ins.items() if v is not None}
            # the screen pops a beat into the shot (the first shot of the video shows HIM first)
            show = t0 + (1.0 if i == 0 else 0.35)
            _, sl, sw = nearest_word(words, min(show, t1 - 0.6))
            ref0, at0 = _ref(words, {"line": sl, "word": sw}, shot_ref)
            anchors.append({"fire": "insert", "at": ref0, "payload": {"id": "insert"}})
            add_sfx("ding", ref0, at0, -10, offset=0.02)
            # reveal the lines across the rest of the shot
            n = len(ins["lines"])
            span = max(0.5, t1 - at0 - 0.5)
            for k in range(n):
                tk = at0 + 0.2 + span * k / max(1, n)
                _, ln, wi = nearest_word(words, tk)
                anchors.append({"fire": "line", "at": {"line": f"l{ln}", "wordIndex": wi}, "payload": {"id": "insert"}})
        if i > 0 and shots[i - 1]["location"] != s["location"]:
            add_sfx("whoosh", start, t0, -14, offset=-0.12)
        scenes.append({"id": f"s{i + 1:02d}", "archetype": "Shot", "set": s["location"], "start": start, "cast": cast,
                       "camera": camera, "props": props, "anchors": anchors})

    music = {"file": "music.wav", "gainDb": look["music"]["gain_db"], "fadeInSec": 0.02, "fadeOutSec": 0.4, "duckDb": -4}
    if punch:
        pref, pt = _ref(words, punch, punch)
        music["mutes"] = [{"from": {**pref, "offset": -0.08}, "to": {"line": pref["line"], "wordIndex": -1, "edge": "end", "offset": 0.25}}]
        add_sfx("scratch", pref, pt - 0.12, -7, offset=-0.12)
    return {
        "niche": "ceo",
        "meta": {"title": script["title"], "topic": script.get("topic", script["title"]), "hook": script["lines"][0]["caption"]},
        "audio": {"voice": "voice.wav", "music": music, "sfx": sfx},
        "captions": {"params": {"accent": look["accent"]}},
        "scenes": scenes,
        "tailSec": 0.35,
    }


def summary(shots):
    """One line per shot for prompts and logs."""
    return "\n".join(f"{i + 1:02d} {s['_t']:5.2f}s {s['location']}/{s['spot']} {s['framing']}/{s['move']}"
                     f"{' +' + s['extra']['persona'] if 'extra' in s else ''}{' card' if s.get('card') else ''}"
                     f"{' stamp' if s.get('stamp') else ''}{' insert' if s.get('insert') else ''}" for i, s in enumerate(shots))


# ---------------------------------------------------------------- the free fallback director
def auto_director(script, words, look):
    """A deterministic, always-valid shot list from the script's own beat notes (no model call).
    Used when every director model fails; also the baseline the LLM director must beat."""
    seed = int(look["seed"])
    locs_all = locations()
    order = look["locations"]
    plan, prev_framing = [], None
    framing_cycle = ["wide", "medium", "close", "medium", "face", "high", "close", "low"]
    moves = ["push_in", "orbit_left", "push_in", "orbit_right", "pull_out", "rise"]
    k = 0
    for li, line in enumerate(script["lines"]):
        wl = words["lines"][li]["words"]
        if not wl:
            continue
        loc = order[0] if li < max(2, len(script["lines"]) - 2) or len(order) == 1 else order[1 % len(order)]
        spots = list(locs_all[loc]["spots"])
        spot = spots[(seed + li // 2) % len(spots)]
        # one shot per ~2.2 s of the line, cut on word starts
        n_shots = max(1, round((wl[-1]["e"] - wl[0]["s"]) / 2.2))
        if li == 0 and line.get("insert") and len(wl) >= 6:
            n_shots = max(2, n_shots)   # the hook shows HIM first; the screen comes on the second shot
        cuts = [0] + [round(len(wl) * j / n_shots) for j in range(1, n_shots)]
        for j, wi in enumerate(sorted(set(cuts))):
            framing = framing_cycle[(k + seed) % len(framing_cycle)] if k else "wide"
            if framing == prev_framing:
                framing = "medium" if framing != "medium" else "close"
            if framing == "low" and not locs_all[loc]["spots"][spot].get("low_ok", True):
                framing = "close"
            shot = {"start": {"line": li + 1, "word": wi}, "location": loc, "spot": spot, "framing": framing,
                    "move": moves[(k + seed) % len(moves)], "ceo": dict(line.get("ceo") or {"action": "idle", "expression": "neutral"}),
                    "events": []}
            gag_shot = 1 if (li == 0 and line.get("insert") and len(set(cuts)) > 1) else 0
            if j == gag_shot:
                emph = line.get("emphasis")
                hit = next((x for x, w in enumerate(wl) if emph and w["w"].strip(".,!?").lower() == str(emph).lower()), None)
                if hit is not None:
                    shot["events"].append({"word": {"line": li + 1, "word": hit}, "do": "hop"})
                for key in ("card", "stamp", "insert"):
                    if line.get(key):
                        shot[key] = dict(line[key])
                        if key in ("card", "stamp") and hit is not None:
                            shot[key]["at"] = {"line": li + 1, "word": hit}
                if line.get("who") in PERSONAS:
                    shot["extra"] = {"persona": line["who"], "action": "idle", "expression": "neutral"}
                    shot["framing"] = "two_shot"
            plan.append(shot)
            prev_framing = shot["framing"]
            k += 1
    return plan


def punchline_ref(script, words):
    """The twist word: the script's punch line (index) and its emphasis word, else the last line's first word."""
    li = script.get("punch_line")
    if not isinstance(li, int) or not 0 <= li < len(words["lines"]):
        li = len(words["lines"]) - 1
    emph = script["lines"][li].get("emphasis")
    wl = words["lines"][li]["words"]
    hit = next((x for x, w in enumerate(wl) if emph and w["w"].strip(".,!?").lower() == str(emph).lower()), 0)
    return {"line": li + 1, "word": hit}


def seed_for(video_id):
    return stable_seed("look", video_id, mod=100_000)

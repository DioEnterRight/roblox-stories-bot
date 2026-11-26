"""THE LOOK of one video: locations + moods, the CEO's outfit, caption colour, music style, wall texts, model order.

Picked from a per-video seed, steering away from what the last videos used (history entries keep a `look` summary), so
two videos in a row never share a main location, mood or music style. Everything here is a plain dict that goes into
the compiler and is saved in meta.json (so analytics can later tell which looks work).
"""
import random

from .common import locations

SHIRTS = ["#2B3A67", "#7B2D3B", "#2D6A4F", "#4A4E69", "#8C5A2B", "#1F6F8B", "#5B3F8C", "#2F2F38", "#B04A3A", "#3E6B48"]
TIES = ["#C9302C", "#E0B43C", "#2F6FD8", "#D96C9A", "#1E1E24", "#2E9E4F"]
ACCENTS = [("#FFD400", 7), ("#7CFF6B", 1), ("#5CE1FF", 1), ("#FF9D2E", 1)]
UI_ACCENTS = ["#2F6FD8", "#1F8F6A", "#7B5EA7", "#D9402F", "#E0A01E"]
WALL_SIGNS = ["CEO OF THE MONTH", "FOUNDER OF THE YEAR", "BOSS OF MYSELF", "HUSTLE NEVER SLEEPS", "EMPLOYEE OF THE MONTH: ME", "VISION 2030"]
CHARTS = ["REVENUE", "PROFIT", "INVESTORS", "CUSTOMERS", "GROWTH"]
SIGNS = ["DIO INC.", "DIO CAPITAL", "DIO VENTURES", "DIO GLOBAL", "DIO & CO."]
MENUS = ["COFFEE  CHAI  FREE WIFI", "CHAI 20  COFFEE 90", "WIFI FREE  SEATS FREE", "NO WIFI? NO BUSINESS"]
MUSIC = {  # style -> (bpm range, gain dB under the voice)
    "lofi": ((84, 96), -9.0),
    "keys": ((68, 80), -8.0),
    "corporate": ((100, 116), -10.0),
    "suspense": ((70, 84), -9.0),
    "funk": ((96, 108), -10.0),
}
LOCATION_WEIGHT = {"apartment": 3, "boardroom": 2, "cafe": 2, "street": 2, "nook": 1}


def _weighted(rng, items):
    tot = sum(w for _, w in items)
    x = rng.uniform(0, tot)
    for v, w in items:
        x -= w
        if x <= 0:
            return v
    return items[-1][0]


def _recent(history, key, n=3):
    vals = [v.get("look", {}).get(key) for v in history.get("videos", []) if v.get("look")]
    return [x for x in vals if x][-n:]


def pick(seed, history, allowed_locations=None):
    rng = random.Random(seed)
    locs = locations()
    allowed = [l for l in (allowed_locations or list(locs)) if l in locs] or list(locs)
    recent_main = _recent(history, "main", 2)
    recent_music = _recent(history, "music_style", 2)
    recent_mood = _recent(history, "main_mood", 2)
    main_pool = [(l, LOCATION_WEIGHT.get(l, 1)) for l in allowed if l not in recent_main] or [(l, 1) for l in allowed]
    main = _weighted(rng, main_pool)
    others = [l for l in allowed if l != main]
    rng.shuffle(others)
    chosen = [main] + others[: rng.choice([1, 1, 2])]
    moods = {}
    for l in chosen:
        opts = [m for m in locs[l]["moods"] if not (l == main and m in recent_mood)] or locs[l]["moods"]
        moods[l] = opts[0] if rng.random() < 0.45 else rng.choice(opts)   # the first mood of each place is its best look
    glasses = rng.choices(["none", "shades", "round"], [7, 2, 1])[0]
    outfit = {"band": rng.choice(SHIRTS), "tie": rng.choice(TIES)}
    if glasses != "none":
        outfit["glasses"] = glasses
    style = rng.choice([s for s in MUSIC if s not in recent_music] or list(MUSIC))
    (lo, hi), gain = MUSIC[style]
    return {
        "seed": seed,
        "locations": chosen,
        "main": main,
        "moods": moods,
        "main_mood": moods[main],
        "outfit": outfit,
        "accent": _weighted(rng, ACCENTS),
        "accent_ui": rng.choice(UI_ACCENTS),
        "wallSign": rng.choice(WALL_SIGNS),
        "chartTitle": rng.choice(CHARTS),
        "sign": rng.choice(SIGNS),
        "menu": rng.choice(MENUS),
        "music": {"style": style, "bpm": rng.randint(lo, hi), "key": rng.randint(-4, 5), "seed": seed, "gain_db": gain},
        "music_style": style,
    }


def summary(look):
    """The part of the look kept in history (for the no-repeat rules) and in meta.json."""
    return {k: look[k] for k in ("main", "main_mood", "music_style", "accent")} | {"locations": look["locations"]}

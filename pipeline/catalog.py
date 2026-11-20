"""Everything the LLM may choose from, and the stage numbers the compiler needs.

The prompts and the checks both read this file, so a prompt can never offer a part the engine does not have.
Names mirror src/characters/look.ts, src/types/schema.ts and scripts/shorts/audio.py (tests/test_catalog.py checks it).
"""
import re

# Original-looking presets only: the legacy noob / bacon / guest / builderman ids are brand characters, so they are not offered.
PRESETS = ["kid_boy", "kid_girl", "little_brother", "schoolgirl", "schoolboy", "nerd", "bully", "cool_kid",
           "teen_girl", "dad", "real_mom", "teacher_woman", "teacher_man", "principal", "grandpa", "grandma"]
HAIR_STYLES = ["messyFringe", "sidePart", "fluffySwept", "slickBack", "spikyAnime", "curly", "buzz", "bob",
               "wavyLong", "ponytail", "bun", "pigtails", "grandpa", "none"]
HAIR_COLORS = ["black", "darkBrown", "brown", "lightBrown", "blonde", "goldenBlonde", "platinum", "ginger",
               "auburn", "gray", "white", "pink", "blue", "purple"]
SKIN_TONES = ["porcelain", "fair", "light", "medium", "tan", "brown", "dark", "deep"]
CLOTH_COLORS = ["white", "cream", "lightGray", "gray", "charcoal", "black", "red", "darkRed", "maroon", "pink", "rose",
                "orange", "mustard", "yellow", "lime", "green", "darkGreen", "olive", "teal", "cyan", "sky", "blue",
                "royal", "navy", "purple", "lavender", "brown", "tan", "khaki", "denim", "darkDenim"]
TOP_STYLES = ["tshirt", "hoodie", "pullover", "plaid", "polo", "blouse", "sweater", "vest", "jacket", "uniform",
              "suit", "dress", "tank"]
SLEEVES = ["long", "short", "none"]
BOTTOM_STYLES = ["pants", "jeans", "shorts", "skirt"]
SHOE_STYLES = ["sneakers", "boots", "formal"]
ACCESSORIES = ["cap", "backwardsCap", "beanie", "glasses", "sunglasses", "headphones", "bow", "crown"]
FACIAL_HAIR = ["none", "mustache", "beard", "stubble"]

LOCATIONS = {
    "town_overview": "aerial shot of the whole town (no actors). Hook only.",
    "street": "Main Street sidewalk in front of a blue house",
    "crossroads": "crosswalk at a crossroads, school on the right",
    "school_exterior": "schoolyard in front of the school entrance",
    "house": "front yard of a family house",
    "shop": "sidewalk in front of the corner shop",
    "playground": "town park with slide, swings, sandbox",
    "classroom": "classroom with chalkboard (optional 'board' lines)",
    "hallway": "school hallway with lockers and a trophy case",
    "living_room": "living room with sofa and TV",
    "kitchen": "kitchen with counters and a dining table",
    "bedroom": "kid bedroom with bed and desk",
}
FAMILY_LOCATIONS = {"house", "living_room", "kitchen", "bedroom"}
VARIANTS = ["blue", "yellow", "red", "white", "green"]

ANIMS = ["idle", "walk", "sprint", "jump", "wave", "point", "dance", "celebrate", "panting", "knocked", "sleep"]
EXPRESSIONS = ["smile", "laugh", "shocked", "panic", "angry", "cool", "deadpan", "sleeping"]
PROPS = ["backpack", "pointer", "pan", "clipboard", "hammer", "wood_plank", "binoculars", "mouth_tape",
         "halo_gold", "halo_red", "creepy_shadow"]
SFX = ["whoosh", "swish", "pop", "pop_down", "bubbles", "laugh", "sparkle", "ding_dong", "bell_low", "sad", "thud",
       "impact", "riser", "reveal", "twist"]
CAMS = ["wide", "two", "medium", "close"]

# Stage: actors stand at z = STAGE_Z, spread along x. Spacing >= 4.5 studs (scene.MIN_GAP); two actors 5.5 apart
# still fit one medium two-shot, three actors 5 apart need the wide shot (dist 23, fov 60).
STAGE_Z = 1.5
SLOT_X = {1: [0.0], 2: [-2.75, 2.75], 3: [-5.0, 0.0, 5.0]}
# Per-location stage overrides measured with tools/calibrate.py: dx/z move the actors, cam_dx moves wide/two cameras
# sideways (a lamp post stands where the default camera would be in the shop).
STAGE = {"crossroads": {"dx": 1.0}, "shop": {"dx": 2.5}}

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
BANNED = re.compile(r"\b(kill\w*|murder\w*|blood\w*|gore|suicide|die[sd]?|dead|death|sex\w*|nude|naked|drug\w*|"
                    r"gun\w*|shoot\w*|nazi\w*|rape\w*|terroris\w*|porn\w*|racis\w*)\b", re.I)


def stage(loc, n):
    """Actor x/z slots for n actors at a location, left to right."""
    o = STAGE.get(loc, {})
    return [(x + o.get("dx", 0.0), o.get("z", STAGE_Z)) for x in SLOT_X[n]]


def _color_ok(c, names):
    return isinstance(c, str) and (c in names or bool(HEX.match(c)))


def cast_problems(cast):
    """Return a list of problems with a storyboard `cast` object (empty = fine)."""
    errs = []
    if not isinstance(cast, dict) or not 1 <= len(cast) <= 5:
        return ["cast must be an object with 1-5 characters"]
    for cid, look in cast.items():
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,15}", cid):
            errs.append(f"cast id '{cid}': use lower-case letters/digits/underscore")
        if isinstance(look, str):
            if look not in PRESETS:
                errs.append(f"cast '{cid}': unknown preset '{look}'")
            continue
        if not isinstance(look, dict):
            errs.append(f"cast '{cid}': must be a preset name or an object")
            continue
        ext = look.get("extends")
        if ext is not None and ext not in PRESETS:
            errs.append(f"cast '{cid}': unknown extends '{ext}'")
        errs += _look_problems(cid, look)
    return errs


def _part(cid, look, key, style_key, styles, color_keys):
    errs = []
    part = look.get(key)
    if part is None:
        return errs
    if not isinstance(part, dict):
        return [f"cast '{cid}'.{key}: must be an object"]
    if style_key in part and part[style_key] not in styles:
        errs.append(f"cast '{cid}'.{key}.{style_key}: '{part[style_key]}' not in {styles}")
    for ck, names in color_keys.items():
        if ck in part and not _color_ok(part[ck], names):
            errs.append(f"cast '{cid}'.{key}.{ck}: '{part[ck]}' is not a palette name or #RRGGBB")
    return errs


def _look_problems(cid, look):
    errs = []
    if "skin" in look and not _color_ok(look["skin"], SKIN_TONES):
        errs.append(f"cast '{cid}'.skin: '{look['skin']}' not in {SKIN_TONES}")
    errs += _part(cid, look, "hair", "style", HAIR_STYLES, {"color": HAIR_COLORS, "ombre": HAIR_COLORS})
    errs += _part(cid, look, "top", "style", TOP_STYLES, {"color": CLOTH_COLORS, "secondary": CLOTH_COLORS})
    errs += _part(cid, look, "bottom", "style", BOTTOM_STYLES, {"color": CLOTH_COLORS})
    errs += _part(cid, look, "shoes", "style", SHOE_STYLES, {"color": CLOTH_COLORS})
    if look.get("top", {}).get("sleeves") not in (None, *SLEEVES):
        errs.append(f"cast '{cid}'.top.sleeves must be one of {SLEEVES}")
    for acc in look.get("accessories", []) or []:
        t = acc.get("type") if isinstance(acc, dict) else acc
        if t not in ACCESSORIES:
            errs.append(f"cast '{cid}'.accessories: '{t}' not in {ACCESSORIES}")
    if look.get("facialHair") not in (None, *FACIAL_HAIR):
        errs.append(f"cast '{cid}'.facialHair must be one of {FACIAL_HAIR}")
    sc = look.get("scale")
    if sc is not None and not (isinstance(sc, (int, float)) and 0.55 <= sc <= 1.25):
        errs.append(f"cast '{cid}'.scale must be a number 0.55-1.25")
    return errs

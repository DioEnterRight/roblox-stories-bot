import itertools

import pytest

from pipeline import compiler, languages, variety, writer
from pipeline.common import locations
from tests.conftest import fake_words


def _script(cfg, code="en", k=0):
    lp = languages.profile(cfg, code)
    s = writer.bank(lp)[k]
    writer.validate(s, lp, cfg["writing"])
    return s


def _look(locs=None, seed=3):
    lk = variety.pick(seed, {"videos": []}, locs)
    if locs:
        lk["locations"] = locs
        lk["moods"] = {l: locations()[l]["moods"][0] for l in locs}
    return lk


def test_auto_director_compiles_for_every_bank_script(cfg):
    for code in ("en", "hi"):
        lp = languages.profile(cfg, code)
        for k in range(len(writer.bank(lp))):
            s = _script(cfg, code, k)
            w = fake_words(s)
            look = _look(seed=k)
            shots, repairs = compiler.check_shots(compiler.auto_director(s, w, look), w, look)
            plan = compiler.compile_plan(shots, w, s, look, compiler.punchline_ref(s, w))
            assert plan["scenes"][0]["start"] == {"sec": 0}
            assert len(plan["scenes"]) >= 5
            for sc in plan["scenes"]:
                p = sc["camera"]["params"]
                assert {"from", "to", "lookAt", "fov"} <= set(p)
                assert sc["cast"][0]["id"] == "ceo"


def test_repairs_merge_split_and_jump_cuts(cfg):
    s = _script(cfg)
    w = fake_words(s)
    look = _look(["apartment"])
    raw = [
        {"start": {"line": 1, "word": 0}, "location": "apartment", "spot": "desk", "framing": "close", "move": "push_in"},
        {"start": {"line": 1, "word": 1}, "location": "apartment", "spot": "desk", "framing": "wide"},        # too short: merged
        {"start": {"line": 2, "word": 0}, "location": "mars", "spot": "crater", "framing": "close"},           # bad place: repaired
        {"start": {"line": 9, "word": 0}, "location": "apartment", "spot": "desk", "framing": "close"},        # no such line: dropped
        {"start": {"line": 2, "word": 3}, "location": "apartment", "spot": "desk", "framing": "low"},          # low blocked at the desk
    ]
    shots, repairs = compiler.check_shots(raw, w, look)
    assert any("merged" in r for r in repairs)
    assert any("not in this video's set" in r for r in repairs)
    assert any("does not exist" in r for r in repairs)
    end = compiler.reel_end(w) + 0.35
    for a, b in zip(shots, shots[1:] + [{"_t": end}]):
        assert compiler.MIN_SHOT - 1e-6 <= b["_t"] - a["_t"] <= compiler.MAX_SHOT + 1e-6
    for a, b in zip(shots, shots[1:]):
        assert (a["location"], a["spot"], a["framing"]) != (b["location"], b["spot"], b["framing"])
    assert all(s_["framing"] != "low" for s_ in shots if s_["spot"] == "desk")


def test_insert_never_rides_a_wide(cfg):
    s = _script(cfg)
    w = fake_words(s)
    raw = [{"start": {"line": 1, "word": 0}, "location": "apartment", "spot": "desk", "framing": "wide",
            "insert": {"device": "phone", "app": "chat", "lines": ["< hi"]}}]
    shots, _ = compiler.check_shots(raw, w, _look(["apartment"]))
    assert shots[0]["framing"] == "medium"


@pytest.mark.parametrize("loc", list(locations()))
def test_solver_keeps_the_ceo_in_frame_everywhere(loc):
    L = locations()[loc]
    look = _look([loc])
    for (spot_name, spot), framing in itertools.product(L["spots"].items(), ["wide", "medium", "close", "face", "high"] + (["low"] if True else [])):
        if framing == "low" and not spot.get("low_ok", True):
            continue
        for move in ("push_in", "pull_out", "orbit_left", "rise"):
            shot = {"framing": framing, "move": move, "location": loc, "spot": spot_name}
            cast = [{"id": "ceo", "at": spot["at"]}]
            cam, _ = compiler._camera(shot, spot, None, L, 2.4, 1, look["seed"], cast)
            p = cam["params"]
            pts = compiler._cast_points(cast)
            for frm in (p["from"], p["to"]):
                probs = compiler.framing_problems(frm, p["lookAt"], p["fov"], pts)
                assert not probs, (loc, spot_name, framing, move, probs)
                b = L["bounds"]
                assert b["x"][0] - 1e-6 <= frm[0] <= b["x"][1] + 1e-6 and frm[1] <= b["y"][1] + 1e-6, (loc, spot_name, framing, frm)


def test_punchline_gets_music_mute_and_scratch(cfg):
    s = _script(cfg)
    w = fake_words(s)
    look = _look()
    shots, _ = compiler.check_shots(compiler.auto_director(s, w, look), w, look)
    plan = compiler.compile_plan(shots, w, s, look, compiler.punchline_ref(s, w))
    assert plan["audio"]["music"]["mutes"]
    assert any(x["file"] == "sfx/scratch.wav" for x in plan["audio"]["sfx"])

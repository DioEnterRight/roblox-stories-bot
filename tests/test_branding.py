"""Dio's Stories outro: the CEO says "Follow @outrichguy", the FOLLOW card (handle big, channel small) gets >= 3 s,
captions hide under it, and @outrichguy sits in the corner of every frame."""
from pipeline import branding, compiler, languages, variety, writer
from tests.conftest import fake_words


def _made(cfg, code="en"):
    lp = languages.profile(cfg, code)
    s = writer.bank(lp)[0]
    writer.validate(s, lp, cfg["writing"])
    s = branding.add_outro(cfg, s, code)
    w = fake_words(s)
    look = variety.pick(3, {"videos": []})
    shots, _ = compiler.check_shots(branding.force_outro_shot(compiler.auto_director(s, w, look), s), w, look)
    return s, w, compiler.compile_plan(shots, w, s, look, compiler.punchline_ref(s, w), cfg)


def test_outro_line_spoken_and_shown(cfg):
    for code in ("en", "hi"):
        s, w, plan = _made(cfg, code)
        last = s["lines"][-1]
        assert last["outro"] and "@outrichguy" in last["caption"] and "out rich guy" in last["text"]
        brand = plan["meta"]["brand"]
        assert brand["corner"] == "@outrichguy"
        assert brand["outro"]["headline"] == "@outrichguy" and brand["outro"]["sub"] == "Dio's Stories"
        ws = w["lines"][-1]["words"]
        assert ws[-1]["e"] - ws[0]["s"] + plan["tailSec"] >= cfg["brand"]["outro_seconds"] - 1e-6
        outro_scenes = [sc for sc in plan["scenes"] if sc.get("captions", {}).get("hidden")]
        assert len(outro_scenes) == 1 and outro_scenes[0]["cast"][0]["action"] == "point"


def test_add_outro_is_idempotent(cfg):
    lp = languages.profile(cfg, "en")
    s = branding.add_outro(cfg, branding.add_outro(cfg, writer.bank(lp)[0], "en"), "en")
    assert sum(1 for l in s["lines"] if l.get("outro")) == 1

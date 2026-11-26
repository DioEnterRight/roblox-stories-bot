import pytest

from pipeline import languages, writer


@pytest.mark.parametrize("code", ["en", "hi"])
def test_bank_scripts_are_valid(cfg, code):
    lp = languages.profile(cfg, code)
    for s in writer.bank(lp):
        problems = writer.validate(s, lp, cfg["writing"])
        assert not problems, (s["title"], problems)
        for l in s["lines"]:
            assert l["caption"] and l["caption"].isascii(), l
            if code == "hi":
                assert len(l["caption"].split()) == len(l["text"].split()), l
            else:
                assert l["caption"] == l["text"]
            assert l["emphasis"]


def test_validate_rejects_devanagari_in_english(cfg):
    lp = languages.profile(cfg, "en")
    s = {"title": "t", "lines": [{"text": "मैं CEO हूँ और meeting है " * 2}] * 5}
    assert any("Devanagari" in p for p in writer.validate(s, lp, cfg["writing"]))

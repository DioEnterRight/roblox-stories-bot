"""Offline checks: no LLM, no network, no render. `pytest` must pass before every push."""
import json
import pathlib
import re

import pytest
import yaml

from pipeline import catalog, llm, story, storyboard
from pipeline.common import ROOT, load_config

CFG = load_config()
SAMPLE_STORY = json.loads((ROOT / "prompts" / "sample_story.json").read_text(encoding="utf-8"))
SAMPLE_BOARD = json.loads((ROOT / "prompts" / "sample_storyboard.json").read_text(encoding="utf-8"))


def test_sample_story_is_valid():
    out = story.validate(SAMPLE_STORY, CFG, {"videos": []})
    assert CFG["story"]["min_beats"] <= len(out["beats"]) <= CFG["story"]["max_beats"]


def test_story_validator_lists_problems():
    with pytest.raises(ValueError):
        story.validate({"title": "x", "beats": []}, CFG, {"videos": []})


def test_story_rejects_duplicate_title():
    hist = {"videos": [{"title": SAMPLE_STORY["title"]}]}
    with pytest.raises(ValueError):
        story.validate(SAMPLE_STORY, CFG, hist)


def test_sample_storyboard_compiles_with_no_problems():
    st = story.validate(SAMPLE_STORY, CFG, {"videos": []})
    assert storyboard.shape_problems(SAMPLE_BOARD, st, CFG) == []


def test_cast_has_no_banned_brand_presets():
    for preset in catalog.PRESETS:
        assert not catalog.BANNED.search(json.dumps(preset)), preset


def test_extract_json_strips_think_and_fences():
    raw = '<think>hmm {not json}</think>\n```json\n{"a": 1}\n```'
    assert llm.extract_json(raw) == {"a": 1}


def test_fill_leaves_json_braces_alone():
    assert llm.fill('{"k": {x}}', x="1") == '{"k": 1}'


def test_ask_json_sends_the_rejection_back(monkeypatch):
    calls = []

    def fake_chat(system, user, **kw):
        calls.append(user)
        return '{"ok": false}' if len(calls) == 1 else '{"ok": true}'

    def validate(o):
        if not o["ok"]:
            raise ValueError("ok must be true")
        return o

    monkeypatch.setattr(llm, "chat", fake_chat)
    assert llm.ask_json("s", "u", validate) == {"ok": True}
    assert "ok must be true" in calls[1]


def test_ask_json_gives_up_after_attempts(monkeypatch):
    monkeypatch.setattr(llm, "chat", lambda *a, **k: '{"ok": false}')

    def validate(o):
        raise ValueError("always bad")

    with pytest.raises(RuntimeError):
        llm.ask_json("s", "u", validate, attempts=2)


def test_workflows_parse_and_use_only_known_secrets():
    known = {"FREELLMAPI_KEYS", "IG_USER_ID", "IG_PAGE_TOKEN",
             "YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"}
    for wf in (ROOT / ".github" / "workflows").glob("*.yml"):
        text = wf.read_text(encoding="utf-8")
        yaml.safe_load(text)
        used = {part.split("}}")[0].strip() for part in text.split("secrets.")[1:]}
        assert used <= known, (wf.name, used - known)


def test_secrets_are_never_committed():
    for f in ("config.yaml", ".env.example"):
        text = (ROOT / f).read_text(encoding="utf-8")
        assert not re.search(r"freellmapi-[0-9a-f]{20,}|sk-[A-Za-z0-9]{20,}", text), f

    assert json.loads((ROOT / "data" / "history.json").read_text())["videos"] == []


def test_llm_check_fails_fast_with_plain_message(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:9/v1")
    monkeypatch.setenv("LLM_API_KEY", "x")
    with pytest.raises(SystemExit) as e:
        llm.check()
    assert "Cannot reach FreeLLMAPI" in str(e.value)


def test_workflows_run_scripts_through_bash():
    """Windows git drops the executable bit, so a bare `tools/x.sh` fails with Permission denied on GitHub."""
    for wf in (ROOT / ".github" / "workflows").glob("*.yml"):
        for line in wf.read_text(encoding="utf-8").splitlines():
            if "tools/" in line and ".sh" in line:
                assert "bash tools/" in line, (wf.name, line)

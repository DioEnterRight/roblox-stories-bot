import pytest

from pipeline import llm


def test_extract_json_handles_think_and_fences():
    assert llm.extract_json('<think>{"no": 1}</think>```json\n{"ok": true, "s": "a}b"}\n```') == {"ok": True, "s": "a}b"}
    with pytest.raises(ValueError):
        llm.extract_json('{"cut": ')


def test_rank_prefers_and_rotates():
    ready = ["llama-3.3-70b", "gemini-2.5-pro", "deepseek-v3", "text-embed-1", "qwen3-235b", "other-1"]
    a = llm.rank(ready, ["gemini-2.5-pro", "deepseek", "qwen3", "llama"], seed=0, top=3)
    b = llm.rank(ready, ["gemini-2.5-pro", "deepseek", "qwen3", "llama"], seed=1, top=3)
    assert set(a[:3]) == set(b[:3]) == {"gemini-2.5-pro", "deepseek-v3", "qwen3-235b"}
    assert a[0] != b[0], "different videos must lead with different models"
    assert "text-embed-1" not in a


def test_session_critic_differs_from_writer(cfg, monkeypatch):
    monkeypatch.setenv("FREELLM_BASE_URL", "http://x/v1")
    monkeypatch.setenv("FREELLM_API_KEY", "k" * 10)
    monkeypatch.setattr(llm, "ready_models", lambda c: ["gemini-2.5-pro", "deepseek-v3", "qwen3-235b", "gemini-2.5-flash"])
    monkeypatch.setattr(llm, "month_usage", lambda: {})
    for seed in range(12):
        s = llm.Session(cfg, seed)
        assert s.candidates["writer"][0] != s.candidates["critic"][0]
        assert all("gemini" in m or "vl" in m or "llama-4" in m for m in s.candidates["judge"])

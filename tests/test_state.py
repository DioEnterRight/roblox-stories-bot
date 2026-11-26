import json
import subprocess
import sys

from pipeline import common


def test_merge_state_adds_counters_and_keeps_both_sides(tmp_path):
    base = {"videos": [{"id": "a", "status": "queued"}], "2026-11": {"calls": 2}}
    ours = {"videos": [{"id": "a", "status": "published"}], "2026-11": {"calls": 5}}
    theirs = {"videos": [{"id": "a", "status": "queued"}, {"id": "b", "status": "queued"}], "2026-11": {"calls": 4}}
    files = []
    for name, obj in (("o", base), ("a", ours), ("b", theirs)):
        p = tmp_path / name
        p.write_text(json.dumps(obj))
        files.append(str(p))
    subprocess.run([sys.executable, str(common.ROOT / "tools" / "merge_state.py"), *files], check=True)
    out = json.loads((tmp_path / "a").read_text())
    assert [v["id"] for v in out["videos"]] == ["a", "b"]
    assert out["videos"][0]["status"] == "published"
    assert out["2026-11"]["calls"] == 7


def test_old_history_entries_are_migrated():
    h = common.migrate_history({"version": 1, "videos": [{"id": "x", "rule": "Mood hats", "status": "published"}]})
    v = h["videos"][0]
    assert v["format"] == "roblox-story" and v["language"] == "en" and v["topic"] == "Mood hats"


def test_latin_only_drops_devanagari():
    assert common.latin_only("RENT ₹20 मैं ok") == "RENT Rs 20 ok"

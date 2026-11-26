import datetime as dt

from pipeline import schedule
from pipeline.common import IST


def test_slots_every_3h(cfg):
    assert schedule.times(cfg) == ["01:30", "04:30", "07:30", "10:30", "13:30", "16:30", "19:30", "22:30"]


def test_languages_alternate_across_midnight(cfg):
    now = dt.datetime(2026, 11, 26, 0, 0, tzinfo=IST)
    langs = [l for _, l in schedule.upcoming(cfg, now, 20)]
    assert langs[:4] in (["en", "hi", "en", "hi"], ["hi", "en", "hi", "en"])
    assert all(a != b for a, b in zip(langs, langs[1:])), "two slots in a row share a language"


def test_to_make_counts_ready_videos(cfg):
    now = dt.datetime(2026, 11, 26, 2, 0, tzinfo=IST)
    nxt = [l for _, l in schedule.upcoming(cfg, now, 2)]
    assert schedule.to_make(cfg, [], now) == nxt[:1]
    assert schedule.to_make(cfg, [{"language": nxt[0]}], now) == nxt[1:2]
    assert schedule.to_make(cfg, [{"language": nxt[0]}, {"language": nxt[1]}], now) == []


def test_due_window(cfg):
    at = dt.datetime(2026, 11, 26, 4, 40, tzinfo=IST)
    sid, _ = schedule.due(cfg, set(), at)
    assert sid == "2026-11-26 04:30"
    assert schedule.due(cfg, {sid}, at) is None

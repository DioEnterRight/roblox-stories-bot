import copy

import pytest

from pipeline import config_check


def test_repo_config_is_valid(cfg):
    assert cfg["schedule"]["languages"] == ["en", "hi"]


@pytest.mark.parametrize("path,value", [
    (("schedule", "every_minutes"), 5),
    (("schedule", "languages"), ["fr"]),
    (("voice", "engine"), "siri"),
    (("publish", "youtube_mode"), "auto"),
    (("writing", "min_words"), 500),
])
def test_bad_values_fail_fast(cfg, path, value):
    bad = copy.deepcopy(cfg)
    bad[path[0]][path[1]] = value
    with pytest.raises(config_check.ConfigError):
        config_check.validate(bad)

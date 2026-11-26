"""Fail fast on a broken config.yaml: every value the pipeline reads is checked once, at load, with a message that says
which line to fix. (Only the standard library: the cheap workflow gates import this too.)"""

LANGS = ("en", "hi")


class ConfigError(ValueError):
    pass


def _need(cond, msg):
    if not cond:
        raise ConfigError(f"config.yaml: {msg}")


def _num(d, key, lo, hi, where):
    v = d.get(key)
    _need(isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi, f"{where}.{key} must be a number {lo}-{hi} (got {v!r})")


def validate(cfg):
    _need(isinstance(cfg, dict), "the file is empty or not a mapping")
    _need(isinstance(cfg.get("paused", False), bool), "paused must be true or false")
    s = cfg.get("schedule") or {}
    _num(s, "every_minutes", 30, 1440, "schedule")
    _num(s, "make_ahead", 1, 6, "schedule")
    _num(s, "make_per_run", 1, 3, "schedule")
    _need(isinstance(s.get("languages"), list) and s["languages"], "schedule.languages must be a list like [en, hi]")
    langs = cfg.get("languages") or {}
    enabled = langs.get("enabled") or []
    _need(enabled and all(l in LANGS for l in enabled), f"languages.enabled must use {LANGS}")
    for l in enabled:
        p = langs.get(l) or {}
        for k in ("name", "prompt", "edge_voice", "kokoro_voice", "tts_lang"):
            _need(isinstance(p.get(k), str) and p[k], f"languages.{l}.{k} is missing")
        _num(p, "words_per_second", 1.5, 4.0, f"languages.{l}")
    for l in s["languages"]:
        _need(l in enabled, f"schedule.languages uses {l!r}, which is not in languages.enabled")
    v = cfg.get("voice") or {}
    _need(v.get("engine") in ("edge", "kokoro"), "voice.engine must be edge or kokoro")
    for k, lo, hi in (("gap_seconds", 0, 2), ("punch_pause", 0, 2), ("edge_pause", 0, 10), ("lead_in", 0, 2)):
        _num(v, k, lo, hi, "voice")
    i = cfg.get("ideas") or {}
    _need(isinstance(i.get("categories"), list) and len(i["categories"]) >= 3, "ideas.categories needs at least 3 situations")
    _num(i, "candidates", 3, 15, "ideas")
    _num(i, "similarity_threshold", 0.2, 0.95, "ideas")
    w = cfg.get("writing") or {}
    for k, lo, hi in (("min_lines", 3, 10), ("max_lines", 3, 12), ("min_words", 20, 150), ("max_words", 30, 200),
                      ("good_enough", 1, 10), ("rewrite_rounds", 0, 3)):
        _num(w, k, lo, hi, "writing")
    _need(w["min_lines"] <= w["max_lines"] and w["min_words"] < w["max_words"], "writing: min must be below max")
    st = cfg.get("studio") or {}
    for k, lo, hi in (("revise_rounds", 0, 3), ("good_enough", 1, 10), ("max_stills", 4, 20), ("render_timeout_minutes", 20, 230)):
        _num(st, k, lo, hi, "studio")
    f = cfg.get("freellm") or {}
    roles = f.get("roles") or {}
    for r in ("writer", "critic", "director", "judge"):
        _need(isinstance(roles.get(r), dict) and isinstance(roles[r].get("prefer"), list), f"freellm.roles.{r}.prefer must be a list")
    _num(f, "max_calls_per_video", 4, 80, "freellm")
    _num(f, "monthly_token_cap", 100_000, 10_000_000_000, "freellm")
    b = cfg.get("brand") or {}
    _need(str(b.get("corner_handle", "")).startswith("@"), "brand.corner_handle must look like @name")
    _need(b.get("outro_headline") and b.get("channel_name"), "brand.outro_headline and brand.channel_name are required")
    _need(isinstance(b.get("outro"), dict) and all(k in (b["outro"].get("en") or {}) for k in ("caption", "spoken")),
          "brand.outro.en needs caption and spoken")
    p = cfg.get("publish") or {}
    _need(p.get("youtube_mode") in ("api", "manual", "off"), "publish.youtube_mode must be api, manual or off")
    _need(isinstance(p.get("instagram"), bool), "publish.instagram must be true or false")
    vid = cfg.get("video") or {}
    _num(vid, "min_seconds", 5, 60, "video")
    _num(vid, "max_seconds", 15, 89, "video")
    return cfg

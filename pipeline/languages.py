"""Language profiles (config.yaml -> languages). One video = one language."""


def profile(cfg, code):
    langs = cfg["languages"]
    if code not in langs.get("enabled", []) or code not in langs:
        raise ValueError(f"Language '{code}' is not enabled in config.yaml -> languages")
    p = dict(langs[code])
    p["code"] = code
    return p

"""Shared helpers: config, paths, state files, shell calls."""
import datetime as dt
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unicodedata

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "out"
MODELS = ROOT / "models"
HISTORY = DATA / "history.json"
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
HISTORY_VERSION = 1

SECRET_ENV = ("LLM_API_KEY", "IG_PAGE_TOKEN", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN", "GH_TOKEN")


def redact(text):
    """Never let a secret reach the log."""
    text = str(text)
    for name in SECRET_ENV:
        val = os.environ.get(name, "").strip()
        if len(val) >= 8:
            text = text.replace(val, "***")
    return text


def log(msg, level="INFO"):
    print(f"[{dt.datetime.now(IST):%H:%M:%S}] {level:<5} {redact(msg)}", flush=True)


def load_config():
    return yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))


def now_ist():
    return dt.datetime.now(IST)


def parse_time(text):
    return dt.datetime.fromisoformat(text)


def env(name, required=False):
    val = os.environ.get(name, "").strip()
    if required and not val:
        sys.exit(f"Missing secret/env var: {name}. Add it in GitHub > Settings > Secrets and variables > Actions.")
    return val


def run(cmd, check=True, capture=False, **kw):
    """Run a command and print it (long args shortened) for the log."""
    short = " ".join(str(c) if len(str(c)) < 120 else str(c)[:60] + "..." for c in cmd)
    log(f"$ {short}")
    res = subprocess.run([str(c) for c in cmd], check=False, text=True, capture_output=capture, **kw)
    if check and res.returncode != 0:
        if capture:
            print(redact(res.stdout[-4000:] if res.stdout else ""), redact(res.stderr[-4000:] if res.stderr else ""))
        raise RuntimeError(f"Command failed ({res.returncode}): {short}")
    return res


def ffprobe(path):
    res = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
              capture=True)
    return json.loads(res.stdout)


def slugify(text, n=40):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:n].strip("-") or "video"


def norm_text(s):
    """Letters and digits only, lower case (used to match titles and captions)."""
    return "".join(ch for ch in s.lower() if unicodedata.category(ch)[0] in "LMN")


# ---------------- state files (atomic) ----------------
def read_json(path, default):
    path = pathlib.Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, obj):
    """Write via temp file + rename so a crash never leaves a half-written state file."""
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def load_history():
    return read_json(HISTORY, {"version": HISTORY_VERSION, "videos": []})


def save_history(hist):
    hist["version"] = HISTORY_VERSION
    write_json(HISTORY, hist)

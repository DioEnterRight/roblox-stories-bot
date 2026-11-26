"""FreeLLMAPI client (github.com/tashfeenahmed/freellmapi), started inside each GitHub job by tools/start_freellmapi.sh,
which sets FREELLM_BASE_URL and FREELLM_API_KEY. Free models only; nothing here can reach a paid API.

ROLES and ROTATION. Every model call has a role: writer (ideas + script), critic (judges the script), director (shot
list), judge (looks at the stills; needs vision). At the start of each video a Session asks FreeLLMAPI which models are
ready, then for every role ranks the ready models by config.yaml `freellm.roles.<role>.prefer` and ROTATES the top few
by the video's seed, so consecutive videos are written, directed and judged by different models (the critic is never
the writer's model). `auto:smart` / `auto` stay as the last fallback. Which model did what is saved in meta.json.

FREE-TIER SAFETY, in layers:
  1. FreeLLMAPI only routes to free-tier endpoints and fails over when one answers 429/5xx.
  2. Per video: at most `max_calls_per_video` requests (Budget).
  3. Per month: data/freellm_usage.json counts tokens; past `monthly_token_cap` the bot stops calling models
     (videos are still made: offline script bank + the auto director). The container is new every run, which is why
     this ledger lives in the repo.

Check the setup without making a video:  python -m pipeline.llm --check
"""
import base64
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

from . import common
from .common import log

RETRY = (408, 429, 500, 502, 503, 504)
ROLES = ("writer", "critic", "director", "judge")
FALLBACK = ["auto:smart", "auto"]


class LLMUnavailable(RuntimeError):
    """No free model can be used right now (not configured, monthly cap, or every model failed)."""


def settings(cfg):
    f = dict(cfg.get("freellm") or {})
    f["base_url"] = os.environ.get("FREELLM_BASE_URL", "").rstrip("/")
    f["key"] = os.environ.get("FREELLM_API_KEY", "")
    return f


def configured(cfg):
    f = settings(cfg)
    return bool(f["base_url"] and f["key"])


def ledger_path():
    return common.DATA / "freellm_usage.json"


def month_usage():
    return common.read_json(ledger_path(), {}).get(dt.date.today().strftime("%Y-%m"), {})


def _record(routed, usage):
    data = common.read_json(ledger_path(), {})
    m = data.setdefault(dt.date.today().strftime("%Y-%m"), {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "by_model": {}})
    m["calls"] += 1
    m["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
    m["completion_tokens"] += int(usage.get("completion_tokens") or 0)
    m["by_model"][routed] = m["by_model"].get(routed, 0) + 1
    for old in sorted(data)[:-6]:   # keep six months
        data.pop(old)
    common.write_json(ledger_path(), data)


def _http(f, path, body=None, timeout=60):
    req = urllib.request.Request(f["base_url"] + path, data=json.dumps(body).encode() if body is not None else None,
                                 method="POST" if body is not None else "GET",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + f["key"]})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read()), r.headers.get("X-Routed-Via")


def ready_models(cfg):
    f = settings(cfg)
    data, _ = _http(f, "/models?available=true")
    return [m.get("id") for m in data.get("data", []) if m.get("id")]


def rank(ready, prefer, seed, top=4):
    """Ready models ordered by the role's preference list; the best `top` are rotated by the seed (variety between
    videos without dropping to weak models). Models matching nothing in `prefer` come after, in their listed order."""
    lowered = [(m, m.lower()) for m in ready]
    ranked, seen = [], set()
    for p in prefer:
        for m, ml in lowered:
            if p.lower() in ml and m not in seen:
                ranked.append(m)
                seen.add(m)
    rest = [m for m in ready if m not in seen and not any(x in m.lower() for x in ("embed", "whisper", "tts", "guard", "rerank"))]
    head = ranked[:top]
    if head:
        k = seed % len(head)
        head = head[k:] + head[:k]
    return head + ranked[top:] + rest


class Budget:
    def __init__(self, cfg):
        f = settings(cfg)
        self.left = int(f.get("max_calls_per_video", 24))
        cap = int(f.get("monthly_token_cap", 60_000_000))
        m = month_usage()
        used = int(m.get("prompt_tokens", 0)) + int(m.get("completion_tokens", 0))
        if used >= cap:
            raise LLMUnavailable(f"FreeLLMAPI monthly cap reached ({used:,} of {cap:,} tokens) — models paused until next month")

    def spend(self):
        if self.left <= 0:
            raise LLMUnavailable("FreeLLMAPI per-video request cap reached (freellm.max_calls_per_video)")
        self.left -= 1


class Session:
    """One video's model plan: the rotated candidates per role, the budget, and a log of who answered what."""

    def __init__(self, cfg, seed):
        self.cfg = cfg
        self.f = settings(cfg)
        self.seed = int(seed)
        self.used = {}
        if not configured(cfg):
            raise LLMUnavailable("FREELLM_BASE_URL / FREELLM_API_KEY are not set (the 'Start FreeLLMAPI' step did not run)")
        self.budget = Budget(cfg)
        try:
            ready = ready_models(cfg)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            raise LLMUnavailable(f"FreeLLMAPI is not reachable: {e}") from None
        if not ready:
            raise LLMUnavailable("FreeLLMAPI has no ready model (every key rejected or used up)")
        roles = self.f.get("roles") or {}
        self.candidates = {}
        for i, role in enumerate(ROLES):
            rc = roles.get(role) or {}
            prefer = rc.get("prefer") or []
            if role == "judge" and not prefer:
                prefer = ["gemini", "llama-4", "gpt-4o", "vl", "pixtral", "vision"]
            order = rank(ready, prefer, self.seed + i * 7, int(rc.get("rotate_top", 4)))
            if role == "judge":   # never send images to a model that is not known to see
                order = [m for m in order if any(p.lower() in m.lower() for p in prefer)]
            self.candidates[role] = order + ([] if role == "judge" else FALLBACK)
        w = self.candidates["writer"][:1]
        if w and self.candidates["critic"] and self.candidates["critic"][0] == w[0]:
            c = self.candidates["critic"]
            self.candidates["critic"] = c[1:2] + c[:1] + c[2:]
        log("models this video: " + "; ".join(f"{r}={self.candidates[r][:3]}" for r in ROLES))

    def chat(self, role, messages, json_mode=True, attempts=2, max_tokens=None):
        rc = (self.f.get("roles") or {}).get(role) or {}
        temperature = float(rc.get("temperature", 0.7))
        errors = []
        for model in self.candidates.get(role, []):
            jm = json_mode
            i = 0
            while i < attempts:
                self.budget.spend()
                body = {"model": model, "messages": messages, "temperature": temperature,
                        "max_tokens": int(max_tokens or rc.get("max_tokens") or self.f.get("max_tokens", 8000))}
                if jm:
                    body["response_format"] = {"type": "json_object"}
                try:
                    data, routed = _http(self.f, "/chat/completions", body, timeout=int(self.f.get("timeout_seconds", 240)))
                    msg = data["choices"][0]["message"]
                    text = msg.get("content") or ""
                    usage = data.get("usage") or {}
                    routed = routed or model
                    _record(routed, usage)
                    if not text.strip():
                        raise ValueError("empty reply")
                    self.used.setdefault(role, []).append(routed)
                    log(f"{role}: {model} -> {routed} (in {usage.get('prompt_tokens', '?')}, out {usage.get('completion_tokens', '?')})")
                    return text
                except urllib.error.HTTPError as e:
                    detail = e.read()[:300].decode("utf-8", "replace")
                    if e.code == 400 and jm and "response_format" in detail:
                        jm = False   # no JSON mode on this route: the prompt still demands JSON
                        continue
                    errors.append(f"{model}: HTTP {e.code} {detail[:120]}")
                    if e.code in (401, 403):
                        raise LLMUnavailable(f"FreeLLMAPI refused the key (HTTP {e.code})") from None
                    if e.code not in RETRY or "quota" in detail.lower():
                        break
                except (urllib.error.URLError, TimeoutError, KeyError, IndexError, ValueError, json.JSONDecodeError) as e:
                    errors.append(f"{model}: {e!r}"[:200])
                i += 1
                if i < attempts:
                    time.sleep(4 * i)
            log(f"{role}: {model} failed ({errors[-1] if errors else '?'}), next model", "WARN")
        raise LLMUnavailable(f"every {role} model failed: " + " | ".join(errors[-4:]))

    def json(self, role, system, user, images=None, attempts_on_bad_json=2, max_tokens=None):
        """Ask for ONE JSON object; a reply that is not valid JSON is asked again (with the parse error)."""
        content = user if not images else [{"type": "text", "text": user}] + [
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode()}} for p in images]
        messages = [{"role": "system", "content": system}, {"role": "user", "content": content}]
        last = None
        for k in range(attempts_on_bad_json):
            text = self.chat(role, messages, max_tokens=max_tokens)
            try:
                return extract_json(text)
            except (ValueError, json.JSONDecodeError) as e:
                last = e
                log(f"{role}: reply was not valid JSON ({str(e)[:100]}), asking again", "WARN")
                messages = messages + [{"role": "assistant", "content": text[:4000]},
                                       {"role": "user", "content": f"That was not one valid JSON object ({e}). Reply with ONLY the JSON object."}]
        raise LLMUnavailable(f"{role}: no valid JSON after {attempts_on_bad_json} tries: {last}")


def extract_json(text):
    """The first complete top-level JSON object in a reply, after dropping <think> blocks and ``` fences."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S)
    text = re.sub(r"```(?:json)?", "", text)
    start = text.find("{")
    if start < 0:
        raise ValueError("reply has no JSON object")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
    raise ValueError("JSON object in the reply is cut off (raise freellm.max_tokens?)")


def check(cfg):
    """One tiny request per role: proves the keys work and shows which models each role would use."""
    s = Session(cfg, seed=int(time.time()) % 1000)
    for role in ("writer", "director"):
        if s.json(role, "Reply with JSON only.", 'Reply with exactly this JSON: {"ok": true}').get("ok") is not True:
            raise SystemExit(f"{role} answered, but not with the expected JSON")
    if s.candidates.get("judge"):
        log(f"judge (vision) candidates: {s.candidates['judge'][:4]}")
    else:
        log("No vision model is ready: the judge is skipped (add a Google AI Studio key, see SETUP.md)", "WARN")
    m = month_usage()
    log(f"FreeLLMAPI OK. This month so far: {m.get('calls', 0)} calls, {int(m.get('prompt_tokens', 0)) + int(m.get('completion_tokens', 0)):,} tokens")


if __name__ == "__main__":
    if "--check" in sys.argv:
        try:
            check(common.load_config())
        except LLMUnavailable as e:
            sys.exit(f"FreeLLMAPI check failed: {e}")

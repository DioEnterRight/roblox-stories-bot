"""One OpenAI-compatible chat client. Works with FreeLLMAPI, Google AI Studio, NVIDIA NIM, OpenRouter...

Env (GitHub secrets):
  LLM_BASE_URL   e.g. https://generativelanguage.googleapis.com/v1beta/openai   or  http://host:3001/v1
  LLM_API_KEY    the key for that endpoint
  LLM_MODEL      model id; with FreeLLMAPI "auto" lets its router pick (default "auto")
"""
import datetime as dt
import json
import re
import time

import requests

from .common import DATA, env, log, read_json, write_json

USAGE_FILE = DATA / "usage.json"
RETRY_STATUS = (408, 429, 500, 502, 503, 504)


def fill(template, **values):
    """Replace {name} placeholders only (prompts contain JSON braces, so str.format cannot be used)."""
    for k, v in values.items():
        template = template.replace("{" + k + "}", str(v))
    return template


def extract_json(text):
    """The first complete {...} object in a model reply (drops <think> blocks and code fences)."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the model reply")
    return json.loads(text[start:end + 1])


def _record_usage(usage):
    month = dt.date.today().strftime("%Y-%m")
    data = read_json(USAGE_FILE, {})
    m = data.setdefault(month, {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0})
    m["calls"] += 1
    m["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
    m["completion_tokens"] += int(usage.get("completion_tokens") or 0)
    write_json(USAGE_FILE, data)


def _headers(key):
    return {"Authorization": f"Bearer {key}"}


def check():
    """Fail fast with a plain message when the LLM endpoint (your FreeLLMAPI tunnel) is not reachable."""
    base, key = env("LLM_BASE_URL", required=True).rstrip("/"), env("LLM_API_KEY", required=True)
    try:
        r = requests.get(f"{base}/models", headers=_headers(key), timeout=30)
    except requests.RequestException as e:
        raise SystemExit(f"Cannot reach FreeLLMAPI at {base}: {e}. The 'Start FreeLLMAPI inside this job' step must run first. "
                         "See SETUP.md.")
    if r.status_code in (401, 403):
        raise SystemExit(f"FreeLLMAPI answered {r.status_code}: the FreeLLMAPI unified key was not accepted (look at the 'Start FreeLLMAPI' step log).")
    if r.status_code >= 400:
        raise SystemExit(f"FreeLLMAPI answered HTTP {r.status_code} at {base}/models: {r.text[:200]}")
    log("FreeLLMAPI reachable")


def chat(system, user, temperature=0.8, max_tokens=4096, timeout=240):
    """Return the reply text. Retries rate limits / 5xx; drops response_format if the provider rejects it."""
    base = env("LLM_BASE_URL", required=True).rstrip("/")
    key = env("LLM_API_KEY", required=True)
    body = {"model": env("LLM_MODEL") or "auto", "temperature": temperature, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {"type": "json_object"}}
    last = ""
    for attempt in range(1, 6):
        r = requests.post(f"{base}/chat/completions", headers=_headers(key),
                          json=body, timeout=timeout)
        if r.status_code == 400 and "response_format" in body:
            body.pop("response_format")  # this provider has no JSON mode: the prompt still demands JSON
            continue
        if r.status_code in RETRY_STATUS:
            last = f"HTTP {r.status_code} {r.text[:200]}"
            wait = min(60, 5 * attempt * attempt)
            log(f"LLM busy ({last}); retry in {wait}s", "WARN")
            time.sleep(wait)
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"LLM error HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        usage = data.get("usage") or {}
        _record_usage(usage)
        log(f"LLM via {r.headers.get('X-Routed-Via', body['model'])}: "
            f"in={usage.get('prompt_tokens', '?')} out={usage.get('completion_tokens', '?')}")
        return data["choices"][0]["message"].get("content") or ""
    raise RuntimeError(f"LLM kept failing: {last}")


def ask_json(system, user, validate, attempts=3, **kw):
    """Ask, parse, validate. On a bad reply the problem is sent back once per attempt. Returns the validated object."""
    prompt, problem = user, ""
    for attempt in range(1, attempts + 1):
        try:
            obj = extract_json(chat(system, prompt, **kw))
            return validate(obj)
        except (ValueError, KeyError, TypeError) as e:
            problem = str(e)[:1500]
            log(f"Reply rejected (attempt {attempt}/{attempts}): {problem[:300]}", "WARN")
            prompt = (f"{user}\n\nYOUR PREVIOUS REPLY WAS REJECTED:\n{problem}\n"
                      "Fix every problem. Reply with ONLY the corrected JSON object.")
    raise RuntimeError(f"LLM could not produce a valid reply: {problem[:300]}")

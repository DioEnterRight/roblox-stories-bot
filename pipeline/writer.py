"""SCRIPT: writer model drafts the skit -> a different critic model scores it -> one rewrite from the critic's fixes when
it scores under `writing.good_enough` -> the better draft wins (numbers, not opinions).

When no free model can be reached, the script comes from the offline bank (prompts/bank_<lang>.json): hand-written
skits, each used once, so the channel keeps posting through an outage without ever repeating itself.
"""
import json
import re

from . import ideas as ideas_mod
from .common import PROMPTS, fill, latin_only, log, prompt
from .compiler import PERSONAS

DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def _scores_overall(res):
    try:
        return float(res["scores"]["overall"])
    except (KeyError, TypeError, ValueError):
        return 0.0


def validate(script, lp, wcfg):
    """Clean the model's script in place and return a list of problems (empty = usable)."""
    problems = []
    if not isinstance(script, dict):
        return ["the reply is not a JSON object"]
    lines = [l for l in script.get("lines", []) if isinstance(l, dict) and str(l.get("text", "")).strip()]
    script["lines"] = lines
    if not wcfg["min_lines"] <= len(lines) <= wcfg["max_lines"]:
        problems.append(f"{len(lines)} lines; write {wcfg['min_lines']}-{wcfg['max_lines']}")
    words = sum(len(l["text"].split()) for l in lines)
    lo, hi = wcfg["min_words"], wcfg["max_words"]
    if not lo <= words <= hi:
        problems.append(f"{words} spoken words; write {lo}-{hi}")
    for i, l in enumerate(lines):
        l["text"] = re.sub(r"\s+", " ", l["text"]).strip()
        if lp["code"] == "hi":
            if not DEVANAGARI.search(l["text"]):
                problems.append(f"line {i + 1} has no Devanagari: write the Hindi words in Devanagari (English words stay Latin)")
            cap = latin_only(l.get("caption", ""))
            if not cap:
                problems.append(f"line {i + 1} has no Roman caption")
            elif len(cap.split()) != len(l["text"].split()):
                log(f"line {i + 1}: caption has {len(cap.split())} words, voice {len(l['text'].split())} (spread by timing)", "WARN")
            l["caption"] = cap or latin_only(l["text"])
        else:
            if DEVANAGARI.search(l["text"]):
                problems.append(f"line {i + 1} contains Devanagari in an English video")
            l["caption"] = latin_only(l["text"])
        caps = [re.sub(r"[^\w']", "", w) for w in l["caption"].split()]
        emph = re.sub(r"[^\w']", "", str(l.get("emphasis", "")))
        if emph.lower() not in [c.lower() for c in caps]:
            l["emphasis"] = max(caps, key=len) if caps else ""
        if l.get("who") not in PERSONAS:
            l.pop("who", None)
        for k in ("card", "stamp", "insert"):
            if not isinstance(l.get(k), dict) or not l[k]:
                l.pop(k, None)
    pl = script.get("punch_line")
    if not isinstance(pl, int) or not 0 <= pl < len(lines):
        script["punch_line"] = max(0, len(lines) - 2 if len(lines) > 4 else len(lines) - 1)
    script["title"] = str(script.get("title") or "").strip()[:90] or "CEO of nothing"
    script["description"] = str(script.get("description") or "").strip()[:400]
    tags = [t if str(t).startswith("#") else f"#{t}" for t in script.get("hashtags", []) if str(t).strip()]
    script["hashtags"] = [re.sub(r"\s+", "", t) for t in tags][: wcfg.get("hashtags_max", 5)] or ["#ceo", "#comedy", "#relatable"]
    script["laptop"] = [latin_only(x)[:24] for x in (script.get("laptop") or []) if latin_only(x)][:3]
    script.setdefault("topic", script["title"])
    return problems


def _ask(session, system, user):
    return session.json("writer", system, user, max_tokens=6000)


def write(cfg, session, idea, lp, performance):
    wcfg = cfg["writing"]
    rules = (PROMPTS / lp["prompt"]).read_text(encoding="utf-8")
    base = fill(prompt("script.md"), format=prompt("format.md"), idea=json.dumps({k: v for k, v in idea.items() if not k.startswith("_")},
                                                                                  ensure_ascii=False, indent=1),
                language_rules=rules, min_words=wcfg["min_words"], max_words=wcfg["max_words"], min_lines=wcfg["min_lines"],
                max_lines=wcfg["max_lines"], wps=lp["words_per_second"], personas=", ".join(PERSONAS),
                title_rule="catchy title, see the language rules", caption_rule="see the language rules")
    system = "You write deadpan comedy skits. Reply with JSON only."
    draft, problems = None, []
    for attempt in range(1, 3):
        ask = base if not problems else base + "\n\nYour last draft had these problems, fix them:\n- " + "\n- ".join(problems)
        draft = _ask(session, system, ask)
        problems = validate(draft, lp, wcfg)
        if not problems:
            break
        log(f"script draft {attempt} problems: {problems}", "WARN")
    if problems:
        raise RuntimeError(f"script still broken after 2 drafts: {problems}")
    best, best_score, review = draft, -1.0, None
    for rnd in range(1 + int(wcfg.get("rewrite_rounds", 1))):
        review = critic(cfg, session, best if rnd == 0 else draft, lp)
        score = _scores_overall(review) if review else 0.0
        cand = best if rnd == 0 else draft
        if score > best_score:
            best, best_score = cand, score
        log(f"critic round {rnd + 1}: overall {score:.1f} {review.get('scores') if review else ''}")
        if not review or score >= float(wcfg.get("good_enough", 7.5)) or rnd == int(wcfg.get("rewrite_rounds", 1)):
            break
        fixes = review.get("fixes") or []
        ask = (base + "\n\nAn editor reviewed this draft:\n" + json.dumps(best, ensure_ascii=False) + "\n\nApply these fixes "
               "(keep what works, make the twist land harder):\n- " + "\n- ".join(map(str, fixes[:5])))
        try:
            draft = _ask(session, system, ask)
        except Exception as e:  # noqa: BLE001 - keep the first draft
            log(f"rewrite failed ({str(e)[:160]}); keeping the first draft", "WARN")
            break
        if validate(draft, lp, wcfg):
            log("rewrite broke the rules; keeping the first draft", "WARN")
            break
    best["critic_score"] = round(best_score, 2)
    best["language"] = lp["code"]
    best["canonical_en"] = idea.get("canonical_en", best.get("canonical_en"))
    best["category"] = idea.get("category", best.get("category"))
    return best


def critic(cfg, session, script, lp):
    """-> {"scores": {...}, "fixes": [...]} or None when no critic model answers."""
    text = json.dumps({k: script[k] for k in ("title", "punch_line", "lines")}, ensure_ascii=False, indent=1)
    try:
        return session.json("critic", "You are a strict comedy editor. Reply with JSON only.",
                            fill(prompt("critic.md"), format=prompt("format.md"), language_name=lp["name"], script=text))
    except Exception as e:  # noqa: BLE001 - a missing critic never stops a video
        log(f"critic skipped ({str(e)[:160]})", "WARN")
        return None


# ---------------------------------------------------------------- offline bank
def bank(lp):
    return json.loads((PROMPTS / f"bank_{lp['code']}.json").read_text(encoding="utf-8"))["scripts"]


def from_bank(cfg, history, lp, test=False):
    """A hand-written skit nobody has posted yet (test mode: always the first). Raises when the bank is used up."""
    led = ideas_mod.load()
    past = ideas_mod.past_ideas(history, led)
    for s in bank(lp):
        if test or not ideas_mod.is_duplicate(s["canonical_en"], past, 0.85)[0]:
            s = json.loads(json.dumps(s))
            problems = validate(s, lp, cfg["writing"])
            if problems and not test:
                log(f"bank script {s['title']!r} breaks the rules: {problems}", "WARN")
                continue
            s["language"] = lp["code"]
            s["critic_score"] = None
            log(f"Script from the offline bank: {s['title']}")
            return s
    raise RuntimeError(f"the offline {lp['code']} script bank is used up and no free model is reachable")

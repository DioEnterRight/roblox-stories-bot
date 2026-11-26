"""VOICE: Microsoft edge-tts (free, real per-word timestamps) with Kokoro (free, offline) as the fallback.

Each script line is spoken separately, so every line's start is exact. edge-tts streams a WordBoundary per spoken word;
align_words() maps those onto the line's words. The screen shows the line's CAPTION words (Roman Hinglish for Hindi),
laid 1:1 on the spoken words (or spread by length when the counts differ). A short beat of silence before the punch
line gives the twist its comic timing. If edge-tts fails for any line, the WHOLE video switches to Kokoro so the voice
never changes mid-video. Kokoro gives no timestamps: word times are estimated from phoneme counts.

edge-tts uses Microsoft's public read-aloud service without an official licence: it can rate-limit or stop working at
any time, which is why Kokoro stays wired in.

Output (engine format): voice.wav (48 kHz) + words.json {duration, lines:[{id, speaker, text, start, end, words:[{w,s,e}]}], words}.
"""
import asyncio
import difflib
import re
import subprocess
import time

import numpy as np
import soundfile as sf

from .common import MODELS, is_wordchar, log, norm_text, write_json

SR = 24000
LANG_SWITCH = re.compile(r"\([a-z]{2}(?:-[a-z]{2})?\)")


def _trim(x, thresh=0.01, pad=0.03):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    return x[max(0, idx[0] - int(pad * SR)): min(len(x), idx[-1] + int(pad * SR))]


def align_words(words, marks, dur):
    """Spoken-word timestamps -> the script's words (sequence alignment). Unmatched words (numbers read as several
    words) share the gap between their matched neighbours by length. Monotonic, inside [0, dur]."""
    if not words:
        return []
    keys = [norm_text(w) for w in words]
    mkeys = [norm_text(m[2]) for m in marks]
    times = [None] * len(words)
    sm = difflib.SequenceMatcher(a=keys, b=mkeys, autojunk=False)
    for blk in sm.get_matching_blocks():
        for j in range(blk.size):
            m = marks[blk.b + j]
            times[blk.a + j] = [m[0], m[1]]
    for op, a0, a1, b0, b1 in sm.get_opcodes():
        if op == "replace" and b1 > b0:
            lo, hi = marks[b0][0], marks[b1 - 1][1]
            sizes = [max(1, len(keys[i])) for i in range(a0, a1)]
            edges = np.concatenate([[0], np.cumsum(sizes)]) / sum(sizes) * (hi - lo) + lo
            for k, i in enumerate(range(a0, a1)):
                times[i] = [edges[k], edges[k + 1]]
    i = 0
    while i < len(words):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(words) and times[j] is None:
            j += 1
        lo = times[i - 1][1] if i > 0 else 0.0
        hi = max(times[j][0] if j < len(words) else dur, lo)
        sizes = [max(1, len(keys[x])) for x in range(i, j)]
        edges = np.concatenate([[0], np.cumsum(sizes)]) / sum(sizes) * (hi - lo) + lo
        for k, x in enumerate(range(i, j)):
            times[x] = [edges[k], edges[k + 1]]
        i = j
    prev = 0.0
    for t in times:
        t[0] = min(max(t[0], prev), dur)
        t[1] = min(max(t[1], t[0] + 0.04), dur)
        prev = t[0]
    return [(float(a), float(b)) for a, b in times]


def caption_words(caption, spoken):
    """spoken [(word, s, e)] -> caption words with times: 1:1 when the counts match, else spread by word length."""
    cap = caption.split()
    if not cap:
        return spoken
    if len(cap) == len(spoken):
        return [(c, s, e) for c, (_, s, e) in zip(cap, spoken)]
    a, b = spoken[0][1], spoken[-1][2]
    tot = sum(len(c) + 1 for c in cap)
    out, t = [], a
    for c in cap:
        d = (b - a) * (len(c) + 1) / tot
        out.append((c, t, t + d * 0.92))
        t += d
    return out


# ---------------------------------------------------------------- edge-tts
async def _edge_stream(text, voice, rate):
    import edge_tts

    com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    audio, marks = bytearray(), []
    async for ch in com.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "WordBoundary":   # 100-nanosecond ticks
            marks.append((ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7, ch["text"]))
    if not audio:
        raise RuntimeError("edge-tts returned no audio")
    return bytes(audio), marks


def _decode_mp3(data):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", str(SR), "pipe:1"],
                         input=data, capture_output=True, check=True)
    return np.frombuffer(out.stdout, dtype=np.float32).copy()


def edge_line(text, voice, rate, retries):
    """One line -> (samples, marks). 'No audio was received' is throttling: back off longer each try."""
    waits = [3, 6, 12, 20, 30, 40]
    for attempt in range(1, retries + 1):
        try:
            data, marks = asyncio.run(_edge_stream(text, voice, rate))
            return _decode_mp3(data), marks
        except Exception as e:  # noqa: BLE001
            if attempt == retries:
                raise
            w = waits[min(attempt, len(waits)) - 1]
            log(f"edge-tts attempt {attempt} failed ({str(e)[:120]}); retrying in {w} s", "WARN")
            time.sleep(w)


def _line_edge(text, lp, vcfg):
    raw, marks = edge_line(text, lp["edge_voice"], lp.get("edge_rate", "+0%"), int(vcfg.get("edge_retries", 6)))
    idx = np.where(np.abs(raw) > 0.01)[0]
    if len(idx) == 0 or len(raw) < SR * 0.2:
        raise RuntimeError("edge-tts line came out empty")
    a = max(0, idx[0] - int(0.03 * SR))
    b = min(len(raw), idx[-1] + int(0.03 * SR))
    samples, lead = raw[a:b], a / SR
    dur = len(samples) / SR
    words = text.split()
    spans = align_words(words, [(m0 - lead, m1 - lead, t) for m0, m1, t in marks], dur)
    return samples, [(w, s0, s1) for w, (s0, s1) in zip(words, spans)]


# ---------------------------------------------------------------- Kokoro (fallback)
def _kokoro():
    from kokoro_onnx import Kokoro
    return Kokoro(str(MODELS / "kokoro.onnx"), str(MODELS / "voices.bin"))


def _phonemes(k, text, tts_lang):
    return LANG_SWITCH.sub("", k.tokenizer.phonemize(text, tts_lang)).strip()


def _line_kokoro(k, text, lp):
    if lp["tts_lang"].startswith("en"):
        samples, sr = k.create(text, voice=lp["kokoro_voice"], speed=float(lp.get("kokoro_speed", 1.0)), lang=lp["tts_lang"])
    else:
        samples, sr = k.create(_phonemes(k, text, lp["tts_lang"]), voice=lp["kokoro_voice"], speed=float(lp.get("kokoro_speed", 1.0)),
                               is_phonemes=True)
    if sr != SR:
        raise RuntimeError(f"unexpected Kokoro sample rate {sr}")
    samples = _trim(np.asarray(samples, dtype=np.float32))
    if len(samples) < SR * 0.2:
        raise RuntimeError(f"Kokoro line came out empty: {text[:60]}")
    dur = len(samples) / SR
    words = text.split()
    try:
        sizes = [max(1, len(_phonemes(k, w, lp["tts_lang"]).replace(" ", ""))) for w in words]
    except Exception:  # noqa: BLE001
        sizes = [max(1, sum(1 for ch in w if is_wordchar(ch))) for w in words]
    weights = np.array([1.2 + s * 0.55 + (2.0 if re.search(r"[,;:]$", w) else 2.6 if re.search(r"[.!?।]$", w) else 0) for s, w in zip(sizes, words)])
    bounds = np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * dur
    return samples, [(w, bounds[j], bounds[j + 1]) for j, w in enumerate(words)]


# ---------------------------------------------------------------- the whole voice-over
def synthesize(cfg, script, lp, project_dir, allow_edge=True):
    """-> (words.json dict, seconds, engine name). Writes voice.wav + words.json into the project folder."""
    vcfg = cfg["voice"]
    engine = "edge" if allow_edge and vcfg.get("engine", "edge") == "edge" and lp.get("edge_voice") else "kokoro"
    lines = script["lines"]
    rendered = None
    if engine == "edge":
        try:
            rendered = []
            for i, l in enumerate(lines):
                if i:
                    time.sleep(float(vcfg.get("edge_pause", 1.2)))   # spacing requests avoids Microsoft's throttling
                log(f"voice line {i + 1}/{len(lines)} (edge-tts {lp['edge_voice']})")
                rendered.append(_line_edge(l["text"], lp, vcfg))
        except Exception as e:  # noqa: BLE001 - any edge failure means Kokoro for the whole video
            log(f"edge-tts failed ({str(e)[:200]}); the whole video uses Kokoro", "WARN")
            engine, rendered = "kokoro", None
    if rendered is None:
        if not (MODELS / "kokoro.onnx").exists():
            raise RuntimeError("edge-tts failed and the Kokoro backup voice is not downloaded (python -m pipeline.fetch_models)")
        k = _kokoro()
        rendered = []
        for i, l in enumerate(lines):
            log(f"voice line {i + 1}/{len(lines)} (Kokoro {lp['kokoro_voice']})")
            rendered.append(_line_kokoro(k, l["text"], lp))
    gap = float(vcfg.get("gap_seconds", 0.2))
    punch_pause = float(vcfg.get("punch_pause", 0.45))
    t = float(vcfg.get("lead_in", 0.12))
    pieces = [np.zeros(int(t * SR), dtype=np.float32)]
    out_lines, flat = [], []
    for i, ((samples, spoken), l) in enumerate(zip(rendered, lines)):
        if i and i == script.get("punch_line"):
            pieces.append(np.zeros(int(punch_pause * SR), dtype=np.float32))
            t += punch_pause
        dur = len(samples) / SR
        cap = caption_words(l["caption"], spoken)
        ws = [{"w": w, "s": round(t + s, 3), "e": round(t + e, 3)} for w, s, e in cap]
        out_lines.append({"id": f"l{i + 1}", "speaker": "NARRATOR", "text": l["caption"], "start": ws[0]["s"], "end": ws[-1]["e"], "words": ws})
        flat += ws
        pieces += [samples.astype(np.float32), np.zeros(int(gap * SR), dtype=np.float32)]
        t += dur + gap
    audio = np.concatenate(pieces)
    peak = float(np.max(np.abs(audio))) or 1.0
    audio = audio / peak * 0.89
    tmp = project_dir / "voice24k.wav"
    sf.write(tmp, audio, SR)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-ar", "48000", "-ac", "1", str(project_dir / "voice.wav")], check=True)
    tmp.unlink()
    seconds = len(audio) / SR
    words = {"duration": round(seconds, 3), "lines": out_lines, "words": flat}
    write_json(project_dir / "words.json", words)
    n = len(flat)
    log(f"voice: {seconds:.1f}s, {n} words, {n / max(1e-6, flat[-1]['e'] - flat[0]['s']) * 60:.0f} wpm ({engine})")
    return words, seconds, engine

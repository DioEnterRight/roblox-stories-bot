"""Procedural music beds and sound effects: free, deterministic, made on the runner (no samples, no licences).

  bed(style, seconds, bpm, key, seed, out)  -> a stereo WAV at -20 LUFS (the plan sets its level under the voice)
  ensure_sfx()                              -> pop / thud / ding / whoosh / scratch WAVs in engine/remotion/public/sfx

Styles: lofi (swung drums, bass, e-piano), keys (pad + arpeggio, no drums), corporate (bright 8th-note piano, claps:
the ironic "motivational" bed), suspense (low drone, plucks, ticking), funk (tight drums, round bass, chord stabs).
Same (style, bpm, key, seed) -> the same file, so a re-render never changes the music.
"""
import json
import re
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

from .common import REMOTION, log

SR = 44100
SFX_DIR = REMOTION / "public" / "sfx"

PROGRESSIONS = {
    "major": [[0, 4, 7, 11, 14], [9, 12, 16, 19, 23], [5, 9, 12, 16, 19], [7, 11, 14, 17, 21]],     # I - vi - IV - V (maj7 colours)
    "pop": [[0, 4, 7, 12, 16], [7, 11, 14, 19, 23], [9, 12, 16, 21, 24], [5, 9, 12, 17, 21]],       # I - V - vi - IV
    "minor": [[0, 3, 7, 10, 14], [8, 12, 15, 19, 22], [5, 8, 12, 15, 19], [7, 10, 14, 17, 22]],     # i - VI - iv - v
    "jazzy": [[2, 5, 9, 12, 16], [7, 11, 14, 17, 21], [0, 4, 7, 11, 14], [9, 12, 16, 19, 23]],      # ii - V - I - vi
}
STYLE_PROG = {"lofi": ["jazzy", "major"], "keys": ["major", "jazzy"], "corporate": ["pop", "major"], "suspense": ["minor"], "funk": ["minor", "jazzy"]}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def adsr(n, a, d, s, r):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sus = max(0, n - a - d - r)
    e = np.concatenate([np.linspace(0, 1, max(a, 1), endpoint=False), np.linspace(1, s, max(d, 1), endpoint=False), np.full(sus, s),
                        np.linspace(s, 0, max(r, 1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def lp(x, cutoff, slope=4.0):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** (2 * slope))
    return np.fft.irfft(X, len(x))


def hp(x, cutoff, slope=2.0):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    with np.errstate(divide="ignore"):
        X *= 1 / np.sqrt(1 + (cutoff / np.maximum(f, 1e-3)) ** (2 * slope))
    return np.fft.irfft(X, len(x))


def place(buf, sig, start):
    s = int(start * SR)
    e = min(len(buf), s + len(sig))
    if 0 <= s < len(buf):
        buf[s:e] += sig[: e - s]


def epiano(freq, dur, vel=0.5, bright=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = (np.sin(2 * np.pi * freq * t) + (0.35 + 0.5 * bright) * np.sin(4 * np.pi * freq * t) * np.exp(-t * 3)
            + 0.2 * bright * np.sin(2 * np.pi * 3.01 * freq * t) * np.exp(-t * 6))
    return vel * tone * (1 + 0.06 * np.sin(2 * np.pi * 4.2 * t)) * adsr(n, 0.008, 0.8, 0.35, min(0.6, dur * 0.5))


def pluck(freq, dur, vel=0.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * freq * k * t) * np.exp(-t * (4 + 3 * k)) / k for k in range(1, 6))
    return vel * s * adsr(n, 0.003, 0.2, 0.0, 0.05)


def pad(freq, dur, vel=0.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    v = sum(np.sin(2 * np.pi * freq * (1 + d) * t + ph) for d, ph in [(-0.004, 0), (0, 1.1), (0.0045, 2.3)]) / 3
    return vel * v * adsr(n, 0.5, 0.4, 0.8, 0.8)


def kick(vel=0.8):
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 58 + 75 * np.exp(-t * 30)
    return vel * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def snare(rng, vel=0.5):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    return vel * (np.sin(2 * np.pi * 190 * t) * np.exp(-t * 18) * 0.5 + hp(lp(rng.standard_normal(n), 6000), 900) * np.exp(-t * 15) * 0.4)


def clap(rng, vel=0.45):
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    env = sum(np.exp(-np.maximum(0, t - o) * 60) * (t >= o) for o in (0, 0.011, 0.022)) * np.exp(-t * 9)
    return vel * hp(lp(rng.standard_normal(n), 5000), 1200) * env


def hat(rng, vel=0.12):
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    return vel * hp(rng.standard_normal(n), 7000, 3) * np.exp(-t * 60)


def bass(freq, dur, vel=0.33, drive=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t)
    return vel * np.tanh(drive * s) * adsr(n, 0.005, 0.12, 0.7, 0.06)


def _render(style, seconds, bpm, key, seed):
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    bar = 4 * beat
    L = np.zeros(int(seconds * SR))
    R = np.zeros_like(L)
    prog = PROGRESSIONS[STYLE_PROG[style][seed % len(STYLE_PROG[style])]]
    root = 48 + key
    swing = 0.07 * beat if style == "lofi" else 0.0
    t0, ci = 0.0, 0
    while t0 < seconds:
        chord = [root + n for n in prog[ci % 4]]
        if style in ("lofi", "funk", "corporate"):
            kicks = {"lofi": [0, 2.5], "funk": [0, 0.75, 2.5], "corporate": [0, 1, 2, 3]}[style]
            for b in kicks:
                k = kick(0.55 if style == "corporate" else 0.65)
                place(L, k, t0 + b * beat)
                place(R, k, t0 + b * beat)
            for b in (1, 3):
                sn = clap(rng) if style == "corporate" else snare(rng, 0.45)
                place(L, sn * 0.9, t0 + b * beat)
                place(R, sn, t0 + b * beat)
            for i in range(8):
                h = hat(rng, 0.10 if i % 2 else 0.14)
                off = i * beat / 2 + (swing if i % 2 else 0)
                place(L, h * 0.8, t0 + off)
                place(R, h, t0 + off)
            line = {"lofi": [(0, 0, 1.4), (1.5, 0, 0.45), (2, 7, 0.9), (3, 12, 0.45)],
                    "funk": [(0, 0, 0.4), (0.75, 12, 0.2), (1.5, 0, 0.3), (2.5, 10, 0.3), (3, 7, 0.4), (3.5, 5, 0.3)],
                    "corporate": [(0, 0, 0.9), (1, 0, 0.9), (2, 7, 0.9), (3, 5, 0.9)]}[style]
            for off, iv, d in line:
                bb = bass(hz(chord[0] - 12 + iv), d * beat, 0.3 if style != "funk" else 0.36, 1.6 if style != "funk" else 2.6)
                place(L, bb, t0 + off * beat)
                place(R, bb, t0 + off * beat)
        if style == "corporate":
            pat = [1, 2, 3, 4, 3, 2, 4, 3]
            for i, ni in enumerate(pat):
                e = epiano(hz(chord[ni] + 12), beat * 0.6, 0.22, bright=0.9)
                place(L, e * 0.6, t0 + i * beat / 2)
                place(R, e * 0.45, t0 + i * beat / 2)
        elif style == "funk":
            for off in (0.5, 1.75, 2.5, 3.5):
                for k, m in enumerate(chord[1:4]):
                    p = pluck(hz(m + 12), beat * 0.35, 0.12)
                    place(L, p, t0 + off * beat + k * 0.004)
                    place(R, p * 0.8, t0 + off * beat + k * 0.004)
        elif style == "suspense":
            dr = pad(hz(chord[0] - 12), bar + 0.6, 0.25)
            place(L, dr, t0)
            place(R, dr, t0)
            for i in range(8):
                if rng.random() < 0.7:
                    p = pluck(hz(chord[int(rng.integers(1, 5))]), beat * 0.4, 0.18)
                    place(L if i % 2 else R, p, t0 + i * beat / 2)
                tk = hat(rng, 0.09)
                place(L, tk, t0 + i * beat / 2)
                place(R, tk, t0 + i * beat / 2)
        else:   # lofi + keys: e-piano chords / arpeggio + soft pad
            hits = [(0, 1), (1.5, 3), (2, 4), (3.25, 2)] if style == "keys" else [(0, None), (1, None), (2, None), (3, None)]
            for off, idx in hits:
                notes = [chord[idx]] if idx is not None else chord[1:]
                for k, m in enumerate(notes):
                    e = epiano(hz(m + 12), beat * (2.0 if style == "keys" else 1.0), 0.2 if style == "keys" else 0.13)
                    place(L, e * (0.55 - 0.05 * k), t0 + off * beat + k * 0.01)
                    place(R, e * (0.45 + 0.05 * k), t0 + off * beat + k * 0.01)
        if style in ("keys", "lofi", "corporate"):
            for m in chord[1:4]:
                p = pad(hz(m + 12), bar + 0.6, 0.08 if style != "keys" else 0.14)
                place(L, p * 0.5, t0)
                place(R, p * 0.5, t0)
        t0 += bar
        ci += 1
    mix = np.stack([L, R])
    if style == "lofi":
        hiss = hp(rng.standard_normal(len(L)), 2500) * 0.005
        mix = mix + hiss
    return np.stack([lp(hp(ch, 35), 12000, 2) for ch in mix])


def _write(path, stereo, peak=0.89):
    m = np.max(np.abs(stereo)) or 1.0
    data = (stereo / m * peak * 32767).astype(np.int16)
    if data.ndim == 1:
        data = data[None, :]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(data.shape[0])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.T.copy().tobytes())


def _loudnorm(src, dst, target=-20.0):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af", f"loudnorm=I={target}:TP=-2:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S).group(0))
    af = (f"loudnorm=I={target}:TP=-2:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
          f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-af", af, "-ar", "48000", str(dst)], check=True)


def bed(style, seconds, bpm, key, seed, out):
    if style not in STYLE_PROG:
        raise ValueError(f"unknown music style {style!r}")
    mix = _render(style, seconds + 1.0, bpm, key, seed)
    n = mix.shape[1]
    fo = int(SR * 0.8)
    mix[:, -fo:] *= np.linspace(1, 0, fo)
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "raw.wav"
        _write(raw, mix)
        _loudnorm(raw, out)
    log(f"music: {style} {bpm} bpm key {key:+d} ({n / SR:.1f}s) -> {Path(out).name}")
    return out


# ---------------------------------------------------------------- sound effects
def _sfx():
    rng = np.random.default_rng(7)
    out = {}
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    out["pop"] = np.sin(2 * np.pi * np.cumsum(900 - 500 * t / t[-1]) / SR) * np.exp(-t * 38)
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    out["thud"] = (np.sin(2 * np.pi * np.cumsum(110 - 60 * t / t[-1]) / SR) * np.exp(-t * 14)
                   + 0.35 * lp(rng.standard_normal(n), 900) * np.exp(-t * 30))
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    out["ding"] = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, a, d in [(1320, 1, 4), (2640, 0.4, 7), (3960, 0.2, 10)])
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    sweep = lp(rng.standard_normal(n), 3000) * np.sin(np.pi * t / t[-1]) ** 2
    out["whoosh"] = hp(sweep, 300)
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 220 + 900 * np.abs(np.sin(2 * np.pi * 2.4 * t))
    saw = 2 * ((np.cumsum(f) / SR) % 1) - 1
    out["scratch"] = hp(lp(saw * 0.6 + 0.4 * rng.standard_normal(n), 4000), 400) * np.exp(-t * 3) * (t < 0.4)
    return out


def ensure_sfx():
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    for name, sig in _sfx().items():
        p = SFX_DIR / f"{name}.wav"
        if not p.exists():
            _write(p, sig, peak=0.7)
    return SFX_DIR

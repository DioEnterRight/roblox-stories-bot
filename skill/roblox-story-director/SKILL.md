---
name: roblox-story-director
description: Make vertical "In this town, ..." Roblox-style 3D story Shorts end to end - original story formula, voice-timed storyboard, deterministic staging/camera compiler, Remotion render. Use when planning, writing, staging, rendering or fixing a Roblox story Short or the roblox-stories-bot pipeline.
---

# Roblox Story Director

Combines `blocky-shorts` (story formula, look, edit rhythm, pitfalls; MIT, in `references/`) with the
`roblox-shorts-director` engine (R6 characters, 12 locations, scene rule checks). In this repo the whole thing runs
without Claude: an OpenAI-compatible LLM writes JSON, code does everything else.

## Pipeline (scripts over agents: every step is known in advance)
1. `pipeline/story.py` LLM step A: title, one-sentence rule, 12-18 beats (115-160 words). `validate()` lists every problem; `llm.ask_json` sends them back (3 attempts).
2. Kokoro voice (`produce.kokoro_beats`) speaks the beats: real durations, not guesses. Voice must land 30-48 s, else the story is rewritten.
3. `pipeline/storyboard.py` LLM step B: cast (presets/looks) + per-beat shot (loc, actors, anim, expr, prop, cam, sfx). Catalogs are injected from `pipeline/catalog.py`, so the LLM can only pick things that exist.
4. `compile_story` (no LLM): coordinates, walk-in movement, facing, camera cuts (~1.8 s), SFX/music plan. Engine checks (`scripts/shorts/scene.py`) reject bad output and the errors go back to the LLM (3 repair attempts).
5. `pipeline/render.py`: tsc typecheck, Remotion bundle, CPU render (swangle, system Chrome), `qc.check` (h264/yuv420p, 1080x1920, 30 fps, 48 kHz AAC, 10-89 s).
6. `produce --release` queues `final.mp4` + `meta.json` as a GitHub Release; `publish` posts it (Instagram Reels, YouTube Shorts).

## Story formula (references/scripts.md has the evidence)
- Beat 1 starts "In this town," / "In this world," and states ONE absurd rule with a VISIBLE effect (hair colour, crown, floating number). First word spoken at 0.0 s.
- World-building 10-40%; stakes 40-65% (narrator "I" + a named friend/sibling + an antagonist); twist ~70%; 1-3 uppercase shout beats before the payoff; ending calls back to the rule and finishes on a last-line twist.
- Short sentences, a turn every beat. Everything must be showable in one of the 12 locations, max 3 actors on screen.
- Title: concept noun + one emoji, the rule stated, or a first-person tease. No spoilers, no hashtags in the title.
- Original and kid-safe only: no real brands, game logos, copied plots (the BANNED regex in `catalog.py` enforces brands).

## Engine hard rules (scripts/shorts/scene.py)
- Actors at least 4.5 studs apart (scaled by size). Compiler tries walk/sprint entrances and falls back to standing if spacing would break.
- Every camera shot 1.0-3.5 s, shots cover each scene with no gaps, scenes are contiguous from frame 0 to audio end.
- Cut rhythm: the references measure a cut every 1.2-1.6 s (blocky-shorts says ~1.4 s); this repo targets 1.8 s because voice-timed beats make shorter cuts break the 1.0 s floor. Change `cuts.target_sec` in config.yaml, never the engine limits.

## Look
Blocky decal faces, key/fill/rim light, captions at ~68% height, halos/boards render as text. Camera numbers live in `storyboard.camera()` (wide dist 20-23 fov 58-60, two-shot dist 19 fov 58, medium dist 12 fov 50, close-up side 1.6). Stage offsets per location are in `catalog.STAGE`; verify with `python tools/calibrate.py [loc ...]` and look at `out/calibrate/sheet-*.png` before changing them.

## Fixing things
- Reproduce first: `python -m pipeline.produce --test` (sample story, no LLM, stills only, about 5 minutes). Add `--render` for the full sample MP4.
- Bad LLM output: read the `Reply rejected` log lines; fix the prompt in `prompts/*.md` or the validator, not the symptom.
- Visual defects: see `references/pitfalls.md` (framing, flicker, light) and the calibrate sheets.
- Run `python -m pytest` before every push.

## Music
No music ships (licence unknown). Put a royalty-free track at `public/music/` and `music_file()` picks it up; without one the Short is voice + SFX only.

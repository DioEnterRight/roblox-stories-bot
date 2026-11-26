# Dio's Stories bot — the jobless CEO

Makes and posts a 20-30 second comedy Short every 3 hours, alternating **English** and **Hindi (Hinglish)**, fully on
GitHub's free machines, with free AI models only (your FreeLLMAPI keys). No paid service anywhere.

The format (in the spirit of @outrichguy): a box-headed "CEO" in a tie talks like a serious hustle-culture founder,
and slowly reveals he has no company, no job, no money. Word-by-word yellow captions, deadpan voice, a beat of silence
and a record scratch on the twist.

**Set it up:** [SETUP.md](SETUP.md) (about 20 minutes, phone is fine). **Change anything:** [config.yaml](config.yaml).

## How one video is made

| Step | Who | Free? |
|---|---|---|
| 1. Pick the look: places, time of day, his shirt/tie, caption colour, music style (never the same as the last videos) | `variety.py` | code |
| 2. Pitch 8 ideas, drop repeats of anything ever posted, keep the rest for later | writer model | FreeLLMAPI |
| 3. Write the script, a **different** critic model scores it, one rewrite if it scores under 7.5, the better draft wins | writer + critic | FreeLLMAPI |
| 4. Voice: Microsoft edge-tts (Kokoro offline as backup), exact word timings, a pause before the punch line | `voice.py` | free |
| 5. Director turns the timed voice-over into a shot list (place, spot, framing, move, gags) | director model | FreeLLMAPI |
| 6. Compiler checks it against the world, solves every camera so he is never cut off or hidden, fixes timing | `compiler.py` | code |
| 7. Stills of every shot → a vision judge scores them → one revision from its fixes → the better cut wins | judge model | FreeLLMAPI |
| 8. Final 1080×1920 render (3D on CPU, ~40-70 min), music bed + sound effects, loudness to -14 LUFS, quality gate | engine | free |
| 9. Queued as a GitHub Release; the Post run publishes it to Instagram (and YouTube) at its slot | `publish.py` | free |

Every role (writer, critic, director, judge) ranks the models that are ready **and rotates them between videos**,
so consecutive videos are written, directed and judged by different models. If no model can be reached at all, the
video is still made: a hand-written offline script (each used once) and the automatic director.

## What is where

```
config.yaml              the only file you normally edit (schedule, voices, models, publishing)
pipeline/                the Python pipeline (produce.py = make, publish.py = post)
prompts/                 what the models are told (format, ideas, script, critic, director, judge) + offline scripts
engine/remotion/         the 3D video engine (Remotion + three.js): 5 places × 5 moods, the cast, captions, cards
engine/remotion/src/niches/ceo/locations.json   the world as the director sees it (spots, cameras)
engine/scripts/          engine commands: plan check, render, motion QA
data/                    the bot's memory (history, ideas used, model usage, stats) — committed by the bot
tools/                   FreeLLMAPI start-up, state saving, YouTube token helper, preview_world.py (dev)
tests/                   `python -m pytest`
.github/workflows/       Make video (hourly gate), Post video (every 30 min), Clear queue, Test free models, Checks
```

## Credits and licences
- 3D models: KayKit by Kay Lousberg (CC0) and Kenney (CC0) — `engine/remotion/public/assets/`.
- Fonts: Anton and Inter (SIL Open Font License) — `engine/remotion/public/assets/fonts/`.
- Remotion is free for individuals and companies of up to 3 people; bigger companies need a licence (remotion.dev/license).
- Engine based on the "Blocky World" reel skill (adapted: new world, cast, captions, camera solver).

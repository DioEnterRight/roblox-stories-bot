# roblox-stories-bot

GitHub Actions does all the work. Every day it writes an original "In this town, ..." Roblox-style story, voices it
(free Kokoro TTS), renders it in 3D (Remotion, CPU), queues it as a GitHub Release and posts it to
Instagram Reels and YouTube Shorts. No Claude. The only AI is your FreeLLMAPI (model `auto`).

## Setup
Follow **SETUP.md**. Everything runs on GitHub: each run starts its own FreeLLMAPI (Docker) from the `FREELLMAPI_KEYS` secret.

## Settings
Everything normal is in `config.yaml` (length, cut speed, voices, YouTube mode, `paused: true` to stop).
YouTube stays `manual` (you get an issue with the file) until Google approves the API audit.

## Costs and limits
- LLM: about 16k tokens per Short typical (worst ~55k). Real usage per month: `data/usage.json`.
- Render: about 40-100 min per Short on a 2-core runner. Timeout is 300 min.
- Music: none included. Drop a royalty-free track into `public/music/`.

## Local
`pip install -r requirements.txt && npm ci && python -m pipeline.fetch_models`, then `python -m pipeline.produce --test`
(set `CHROME=/path/to/chrome` if Remotion cannot download its own). `python -m pytest` runs the offline tests.
The skill for editing this project is in `skill/roblox-story-director/`.

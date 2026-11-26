# Setup — about 20 minutes, once

You already have the repo `DioEnterRight/roblox-stories-bot` with its secrets, so most of the old setup carries over.
Every step below says exactly where to click or what to paste.

---

## PART 1: Put the new bot into your repo (Windows PowerShell)

1. Download the zip (`dio-stories-bot.zip`) to your **Downloads** folder.
2. Open **PowerShell** and paste these lines one block at a time:

```powershell
cd $HOME
# first time on this computer: clone the repo; otherwise just update it
if (Test-Path roblox-stories-bot) { cd roblox-stories-bot; git pull } else { git clone https://github.com/DioEnterRight/roblox-stories-bot; cd roblox-stories-bot }
```

```powershell
# remove the old Roblox-story bot, KEEP .git and data (your posting history stays, so nothing is posted twice)
Get-ChildItem -Force | Where-Object { $_.Name -notin '.git','data' } | Remove-Item -Recurse -Force
Remove-Item data\usage.json -ErrorAction SilentlyContinue
Expand-Archive -Path "$HOME\Downloads\dio-stories-bot.zip" -DestinationPath . -Force
```

```powershell
git add -A
git commit -m "New format: the jobless CEO (3D, English + Hindi, every 3 hours)"
git push
```

Check: on github.com the repo now shows `config.yaml`, `pipeline/`, `engine/`, `SETUP.md` at the top level.

---

## PART 2: Secrets (most already exist)

github.com/DioEnterRight/roblox-stories-bot > **Settings** > **Secrets and variables** > **Actions**.
You should see these. Add any that are missing (**New repository secret**, name spelled exactly):

| Secret | What | Needed for |
|---|---|---|
| `FREELLMAPI_KEYS` | your free provider keys, one JSON line, e.g. `[{"platform":"google","key":"AIza..."},{"platform":"groq","key":"gsk_..."}]` | writer, critic, director, judge |
| `IG_USER_ID` | your Instagram professional account id | posting Reels |
| `IG_PAGE_TOKEN` | the long-lived Facebook Page token | posting Reels + stats |
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` | only if you want YouTube (see PART 6) | YouTube |

**Strongly recommended:** make sure `FREELLMAPI_KEYS` contains a **Google AI Studio** key (`"platform":"google"`,
aistudio.google.com > Get API key, a project on the *Free tier*, never add billing). Gemini is the only common free
model that can *see* images, so it is what the **judge** uses. Without it the judge is skipped (videos still get made).
More providers (groq, openrouter, nvidia...) = more models to rotate between and fewer rate limits.

---

## PART 3: Let the bot save its memory

**Settings** > **Actions** > **General** > scroll to **Workflow permissions** > choose **Read and write permissions** > **Save**.
(The old bot needed this too, so it is probably already set.) The repo must stay **Public** (free unlimited minutes,
and Instagram downloads the video from it).

---

## PART 4: Test it (nothing is posted)

1. **Actions** tab > **Test free models** > **Run workflow**. Green in ~2 min = your keys work. The log shows which
   models each role will use. Red: the last lines say why (usually a typo in the `FREELLMAPI_KEYS` JSON).
2. **Actions** > **Make video** > **Run workflow** > keep **Test mode** ticked > language **en** > **Run workflow**.
   It takes about 40-70 minutes (the 3D render runs on a CPU). When it is green, open the run, scroll down to
   **Artifacts**, download **test-video** and watch it. **versions** has the contact sheets the judge looked at.
3. Same again with language **hi** for the Hindi version.

Test mode uses no keys and a hand-written script, so it shows the look and the engine, not the free models' jokes.

---

## PART 5: Go live

Nothing to do: the **Make video** run starts every hour and makes a video whenever one of the next 2 upload slots has
none ready; **Post video** runs every 30 minutes and posts each slot at its time. Default: every 3 hours from 01:30
India time (01:30, 04:30, 07:30 ... 22:30), English and Hindi taking turns. The first post goes out 1-3 hours after
the push (the first videos have to be made first).

To make one real video right now: **Make video** > Run workflow > **untick** Test mode > language auto.
To post the oldest ready video right now: **Post video** > Run workflow.

---

## PART 6: Everyday changes (all in `config.yaml`, edit on github.com with the pencil icon)

| You want | Change |
|---|---|
| Stop everything | `paused: true` |
| More / fewer posts | `schedule.every_minutes` (180 = 8 a day, 240 = 6, 360 = 4). Keep it ≥ 120: a video takes ~1 h to make |
| Other times | `schedule.first` |
| Only English or only Hindi | `schedule.languages: [en]` or `[hi]` |
| Another voice | `languages.en.edge_voice` / `languages.hi.edge_voice`, speed with `edge_rate` |
| New joke situations | add lines under `ideas.categories` |
| Different preferred models | `freellm.roles.<writer/critic/director/judge>.prefer` (name fragments, best first) |
| YouTube | `publish.youtube_mode`: `off` (default), `manual` (a GitHub issue per video with the file + title), `api` (auto upload; only after Google approves your API audit, before that uploads stay private) |
| Throw away the ready videos | **Actions** > **Clear queue** > Run workflow |

---

## Troubleshooting

| You see | Do this |
|---|---|
| `FREELLMAPI_KEYS is not valid JSON` | fix the one-line secret (missing quote or a trailing comma) |
| `no free models this run ... offline script bank` | FreeLLMAPI did not start or every key is rate-limited: run **Test free models**. The video is still made, from the offline bank (12 scripts, each used once) |
| `the offline ... script bank is used up` | the models have been down for many runs: fix the keys; nothing repeats meanwhile |
| `judge skipped` | no vision model ready: add a Google AI Studio key (PART 2) |
| `edge-tts failed ... the whole video uses Kokoro` | Microsoft's free voice was busy; the backup voice was used. Normal now and then |
| `Quality check failed` | the video was not queued; the next hourly run makes a new one |
| `No video ready for <slot>` issue | a Make run failed: open the latest **Make video** run, the red step says why |
| `Cannot call API for app ... on behalf of user` | Instagram app not Live or the token changed: make `IG_PAGE_TOKEN` again |
| `Could not push bot state` | PART 3 (Read and write permissions) |

Dev tools (on your own computer, optional; need Python 3.11+, Node 22, ffmpeg and Chrome):
- `python -m pipeline.produce --test --preview` — writes the shot sheet of one video (`out/<id>/versions/v1/sheet.jpg`) in ~2 min, no keys.
- `python -m pipeline.produce --test` — the full offline video (`out/<id>/final.mp4`), about an hour on a laptop CPU.
- `python tools/preview_world.py` — one still of every place and camera into `out/preview_world/`, after changing a set or a camera.

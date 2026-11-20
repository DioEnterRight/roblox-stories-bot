# SETUP: roblox-stories-bot, 100% in the cloud, with FreeLLMAPI

Nothing runs on your PC. Not the app, not a tunnel. Every run, GitHub starts its **own copy of FreeLLMAPI** (the
official Docker image) inside the cloud job, loads your provider keys from one GitHub secret, writes the story with it,
renders the 3D video, and posts it.

```
GitHub Actions job (cloud):  start FreeLLMAPI  ->  write story  ->  voice  ->  3D render  ->  Release  ->  post
                                   ^
                      your provider keys (one GitHub secret)
```

Your desktop FreeLLMAPI app is not used by the bot. Its keys are stored encrypted inside the app, so the cloud copy
gets the same free provider keys from a secret instead. Time needed: about 40 minutes once.

---

## PART 0: What you need

| thing | where | cost |
|---|---|---|
| GitHub account | github.com | free |
| Git for Windows | Part 1 | free |
| 3 or more free provider API keys (Google, Groq, Cerebras, Mistral, NVIDIA, OpenRouter ...) | Part 2 | free |
| Instagram Professional account + Facebook Page + Meta developer app | Part 5 | free |
| YouTube channel | Part 6 (optional at the start) | free |

---

## PART 1: Put the project on GitHub

1. Unzip `roblox-stories-bot.zip`. You get a folder `roblox-stories-bot`, for example
   `C:\Users\Asus\Downloads\roblox-engine\roblox-stories-bot`.
2. Open **PowerShell** (Start menu, type `powershell`, Enter). If `git --version` does not work, run
   `winget install Git.Git`, then close PowerShell and open it again.
3. Open https://github.com/new
   - Repository name: `roblox-stories-bot`
   - Choose **Public** (public repos get free unlimited Actions minutes; the 3D render is slow and needs them).
   - Do NOT tick "Add a README". Click **Create repository**.
4. In PowerShell run these lines one by one. Replace `YOUR-GITHUB-NAME` with your GitHub username:
   ```
   cd C:\Users\Asus\Downloads\roblox-engine\roblox-stories-bot
   git init
   git add .
   git commit -m "first version"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-NAME/roblox-stories-bot.git
   git push -u origin main
   ```
   A browser window may ask you to sign in to GitHub. Do it. Refresh your repo page: you see the files.
5. Let the bot save its memory: repo > **Settings** (top tabs) > **Actions** (left) > **General** > scroll to
   **Workflow permissions** > **Read and write permissions** > **Save**.

---

## PART 2: Get your free provider keys

FreeLLMAPI only routes to free providers; each one needs your own free key. Make **at least 3**, more is better
(when one provider is busy FreeLLMAPI jumps to the next). If you already have keys saved somewhere (a notes file, the
provider's website), use those. Each site: sign up, click the "API keys" page, click "Create key", copy it.

| `platform` name (use exactly this) | where to make the key `[Likely, screens change]` |
|---|---|
| `google` | https://aistudio.google.com/apikey |
| `groq` | https://console.groq.com/keys |
| `cerebras` | https://cloud.cerebras.ai (API Keys) |
| `mistral` | https://console.mistral.ai (API keys) |
| `nvidia` | https://build.nvidia.com (profile > API keys) |
| `openrouter` | https://openrouter.ai/keys |

Other platform names exist (`cohere`, `cloudflare`, `huggingface`, `zhipu`, `kilo`, `llm7` ...). The six above are the
simplest. Copy each key into a private Notepad.

---

## PART 3: Give GitHub your keys (one secret)

1. In Notepad write ONE line like this, with your real keys. Every key needs a different `label`. No line breaks,
   no comma after the last item, straight quotes `"` only:
   ```
   [{"platform":"google","key":"AIza...","label":"google1"},{"platform":"groq","key":"gsk_...","label":"groq1"},{"platform":"cerebras","key":"csk-...","label":"cerebras1"}]
   ```
   Two keys from the same provider: two items with labels `groq1` and `groq2`.
2. Open your repo on GitHub > **Settings** > **Secrets and variables** (left) > **Actions** > **New repository secret**.
3. Name: `FREELLMAPI_KEYS`  (exactly). Secret: paste the whole line. Click **Add secret**.

That is the only secret the AI part needs. You do not need to know or copy the `freellmapi-...` key: the cloud copy
creates its own and the bot reads it automatically.

---

## PART 4: Test it in the cloud

1. Repo > **Actions** tab > left list **Test FreeLLMAPI connection** > **Run workflow** (right) > green **Run workflow**.
2. Wait about 2 minutes, refresh, click the run, click the job **ping**.
3. Good result: the step **Start FreeLLMAPI inside this job** says `FreeLLMAPI is running inside this job with 3 provider
   key(s)` and the last step ends with `FreeLLMAPI answered: {"ok": true}`.
4. Red? Click the red step and read the last lines:
   - `FREELLMAPI_KEYS is not valid JSON`: fix the line in Part 3 (usually a missing quote or a trailing comma), save
     the secret again.
   - `Missing secret FREELLMAPI_KEYS`: the secret name is spelled differently.
   - `did not start in 2 minutes` plus a container log: copy the log and send it to me.
   - `FreeLLMAPI answered 401/403` or `LLM busy (429)` many times: one of the keys is wrong or exhausted; check the
     provider keys.
   I could not run FreeLLMAPI myself while building this, so this test button is the first real proof. If it fails,
   send me the red lines and I fix it.

Free test of the 3D engine (no AI key used): **Make video** > **Run workflow** with "test" ticked.

---

## PART 5: Instagram Reels (Meta). Gives `IG_USER_ID` and `IG_PAGE_TOKEN`

`[Likely]` Meta changes its screens often; the idea stays the same. You did this for the old shorts-bot, so you can
reuse the same Meta app. You need new values for the **new** Roblox Instagram account.

1. Instagram (phone app) for the new Roblox account: Settings > Account type > switch to **Professional** (Creator or
   Business).
2. Create a Facebook **Page** for it (facebook.com/pages/create) and connect it: Instagram app > Edit profile > Page,
   or Facebook Page > Settings > Linked accounts > Instagram.
3. Open https://developers.facebook.com/apps and open your existing app (or **Create app**, type Business). In the
   app add the product **Instagram** if it is not there. Note the **App ID** and **App secret** (App settings > Basic).
4. Open https://developers.facebook.com/tools/explorer. Pick your app on the right. Click **Generate Access Token** and
   tick these permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`,
   `pages_read_engagement`, `business_management`. Log in as the Facebook user who owns the new Page and select the new
   Page when asked. Copy the token it shows (this is a short one-hour token).
5. Make it long-lived. Paste this into your browser address bar with your 3 values, press Enter:
   ```
   https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN
   ```
   Copy the `access_token` from the answer (the long-lived user token).
6. Get the Page token (it does not expire). Open:
   ```
   https://graph.facebook.com/v26.0/me/accounts?access_token=LONG_USER_TOKEN
   ```
   Find your new Page in the list. Copy its `id` (that is `PAGE_ID`) and its `access_token`. **This access_token is
   your `IG_PAGE_TOKEN`.**
7. Get the Instagram ID. Open:
   ```
   https://graph.facebook.com/v26.0/PAGE_ID?fields=instagram_business_account&access_token=PAGE_TOKEN
   ```
   Copy the number inside `instagram_business_account` > `id`. **That number is your `IG_USER_ID`.**
8. In your Meta app: App settings > Basic > set a **Privacy Policy URL** (any page you own), then switch the app from
   Development to **Live** (top bar). Without this you get "Cannot call API for app ... on behalf of user".
9. Add two GitHub secrets (same way as Part 3): `IG_USER_ID` and `IG_PAGE_TOKEN`.

---

## PART 6: YouTube Shorts (optional at the start)

Reality: until Google approves your API project in an audit, videos uploaded by a bot stay **private**. So the bot
starts in `manual` mode (already set in `config.yaml`): after each video it opens a GitHub **issue** with the video
file link, title and description. You download the video and upload it in YouTube Studio by hand (about 2 minutes).
GitHub emails you about the issue. **You need no YouTube secrets for this.** Skip to Part 7.

When you later want the automatic upload:
1. https://console.cloud.google.com > create a project > **APIs & Services** > **Library** > enable **YouTube Data API v3**.
2. **OAuth consent screen**: External, add yourself as a test user.
3. **Credentials** > Create credentials > **OAuth client ID** > type **Desktop app** > download the JSON file as
   `client_secret.json`.
4. In PowerShell inside the project folder:
   ```
   pip install google-auth-oauthlib
   python tools/youtube_auth.py client_secret.json
   ```
   A browser opens: choose the **new Roblox channel**, allow. PowerShell prints three lines.
5. Save them as GitHub secrets `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.
6. Edit `config.yaml` on GitHub: change `youtube_mode: manual` to `youtube_mode: api`. If YouTube keeps the videos
   private, the bot opens an issue and you change it back to `manual`.
Never put `client_secret.json` into GitHub (it is already in `.gitignore`).

---

## PART 7: First real run

1. Free test (no keys used, nothing posted): Actions > **Make video** > **Run workflow** > leave "test" ticked > Run.
   After about 10 minutes open the run, scroll to **Artifacts** at the bottom, download `test-output`, open the
   pictures in `preview`. This proves the 3D engine works on GitHub.
2. Real run: Actions > **Make video** > **Run
   workflow** > **untick** "test" > Run. Takes about 1.5 to 2 hours. When green, your repo's **Releases** (right side of
   the repo main page) shows one video: download `final.mp4` and watch it.
3. Do not like it? Actions > **Throw away ready videos** > Run workflow. Then run Make video again.
4. Post it: Actions > **Post video** > Run workflow. Check Instagram.

From now on it runs by itself.

---

## When something goes red

Open **Actions** > the red run > click the red step > read the last lines.

| message | meaning / fix |
|---|---|
| `Cannot reach FreeLLMAPI` or `did not start` | the "Start FreeLLMAPI inside this job" step failed: open it and read the container log. |
| `FREELLMAPI_KEYS is not valid JSON` | fix the one-line secret (Part 3). |
| `LLM busy (HTTP 429)` repeated | free providers are rate limited. Add more provider keys to `FREELLMAPI_KEYS`. The bot waits and retries by itself. |
| `Reply rejected` (warning) | normal: the AI got a rule wrong, the bot sends the error back and asks again (up to 3 times). |
| `LLM could not produce a valid reply` | 3 bad tries in a row. Re-run once. If it repeats, in FreeLLMAPI put a stronger model first in the Fallback Chain. |
| `Missing secret/env var: X` | add secret X, spelled exactly. |
| `Cannot call API for app ... on behalf of user` | Part 6 step 8 (Privacy Policy URL, app Live) or make `IG_PAGE_TOKEN` again. |
| `Could not push bot state` | Part 1 step 5 (Workflow permissions: Read and write). |
| `No video ready to post` | the last Make video run failed or did not run. Fix, then run Make video. |

## Stop everything / change settings
- Stop: edit `config.yaml` on GitHub, change `paused: false` to `paused: true`, commit.
- Length, cut speed, voices, hashtags: all in `config.yaml`.
- How many tokens were used this month: open `data/usage.json` in the repo.

## Safety
- Never paste a key into a chat, a screenshot, or a file in the repo. If one leaks: make a new key at that provider (or
  Meta), delete the old one, update the GitHub secret.
- You pasted a `freellmapi-...` key in chat earlier: it only belonged to your desktop app. In the app, Keys page >
  regenerate the unified key if you want it fresh. The bot does not use it.
- The cloud FreeLLMAPI listens only inside the job (127.0.0.1) and disappears when the job ends.

## Good to know
- Each run starts FreeLLMAPI fresh, so its per-key usage counters start at zero. One video a day is fine. Do not run
  **Make video** many times in one day, or you may hit the providers' daily limits.
- The bot uses the newest official FreeLLMAPI image. If an update ever breaks it, the test button turns red; tell me.

## Music
No music is included. Put one royalty-free `.mp3` you have the licence for into `public/music/` and commit it.

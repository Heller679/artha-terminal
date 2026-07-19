# Setting up the AI Council

This adds a daily automated process to your `artha-terminal` repo: four AI
models (GPT, Claude, Grok, Kimi K3) each propose one small improvement,
debate each other's proposals, a judge model picks a winner, the winning
model writes the code, a different model reviews it, and — if everyone
agrees — a Pull Request is opened for you to merge with one click.

## What you need to do (one-time setup)

### 1. Get an OpenRouter account and API key
OpenRouter is a single gateway that reaches GPT, Claude, Grok, and Kimi with
one key and one bill, so you don't need four separate developer accounts.

1. Go to https://openrouter.ai and sign up.
2. Add a small amount of credit (a few dollars is enough for weeks of daily
   runs — each run typically costs a few cents to ~$1 depending on model
   pricing that week).
3. Go to https://openrouter.ai/keys and create a new API key. Copy it.

### 2. Add the key to your GitHub repo as a secret
1. Open your repo on GitHub → **Settings** tab → **Secrets and variables**
   → **Actions**.
2. Click **New repository secret**.
3. Name: `OPENROUTER_API_KEY`. Value: paste the key you copied.
4. Save.

### 3. Copy these files into your repo
Copy everything in this kit into the root of your `artha-terminal` repo,
preserving folder structure:

```
.github/workflows/ai-council.yml
scripts/council/config.mjs
scripts/council/openrouter.mjs
scripts/council/run.mjs
ROADMAP.md
council-logs/.gitkeep
```

(Same drag-and-drop upload method you used before — just make sure the
`.github` folder lands at the top level of the repo, not nested.)

### 4. Test it manually before waiting for the daily schedule
1. On GitHub, go to the **Actions** tab.
2. Click **"AI Council — Daily Improvement"** in the left sidebar.
3. Click **"Run workflow"** (this triggers it immediately instead of waiting
   for the 09:00 UTC schedule).
4. Watch the log. It takes a few minutes — the models are literally
   thinking through their proposals, debating, and one of them is writing
   code.
5. If everyone approves a change, check the **Pull Requests** tab — you
   should see a new PR with a summary of what was proposed and why.

## Reading the debate
Every run writes a full transcript to `council-logs/YYYY-MM-DD-summary.md`
in the repo — proposals, the debate, the verdict, and the review. This is
committed alongside the code change in the same Pull Request, so you can
read the whole discussion before you decide whether to merge.

## Adjusting things later
- **Change which models are on the council** → edit `scripts/council/config.mjs`.
  If OpenRouter renames or retires a model, update the slug there.
- **Change the schedule** → edit the `cron` line in
  `.github/workflows/ai-council.yml`. (Cron times are in UTC.)
- **Steer priorities** → edit `ROADMAP.md` any time; the council reads it
  fresh on every run.
- **Widen or narrow scope** → `MAX_FILES_PER_CHANGE` and `PROTECTED_PATHS`
  in `config.mjs` control what the council is allowed to touch.

## Safety notes already built in
- The council can only ever propose changes inside `src/` — it cannot touch
  `package.json`, build config, or its own workflow files.
- Every change goes through an independent reviewer model before it's even
  written to a Pull Request.
- Nothing auto-merges. You always click merge yourself, after reading the
  transcript.
- The workflow runs `npm run build` on the proposed change before opening
  the PR — if the build breaks, no PR is opened.

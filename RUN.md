# RUN: start the app and fix "it's not loading"

The app is **only** available while the server is running. The page itself (frontend/) is served by the Python server, so opening `frontend/index.html` directly as a file, or closing the terminal running the server, gives you a blank or broken page.

## Start it (every time)

1. Open a terminal in the project folder:

```bash
cd /Users/amitchhatbar11/Documents/garbathon/scam-call-shield
```

2. Start the server and **leave this terminal open**:

```bash
.venv/bin/uvicorn backend.main:app --reload --port 8000
```

You should see `Uvicorn running on http://127.0.0.1:8000` and `Application startup complete.`

3. Open **http://localhost:8000** in the browser. Use this exact URL, not a `file://` path and not port 8765.

To stop the server, press `Ctrl+C` in that terminal.

## First-time setup (only once)

1. Create the virtual environment and install packages. Skip this if `.venv/` already exists.

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
```

2. Create `.env` and paste your key from https://aistudio.google.com/apikey into `GEMINI_API_KEY`:

```bash
cp .env.example .env
```

3. Put your demo calls in `demo-calls/` as 16 kHz mono WAV files. Start each name with `scam_` or `genuine_`:

```bash
ffmpeg -i my_recording.m4a -ar 16000 -ac 1 demo-calls/scam_digital_arrest.wav
```

Reload the page after adding files; they appear as call cards.

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| "This site can't be reached" / connection refused | The server isn't running | Run step 2 of "Start it" and keep the terminal open |
| `address already in use` when starting | An old server is still running on port 8000 | Stop it with the `lsof`/`kill` commands below, then start again |
| `No module named backend` | You started uvicorn from inside `backend/` | `cd` to the project root first (step 1) |
| `uvicorn: command not found` / `No such file .venv/bin/uvicorn` | The virtual environment isn't installed | Do first-time setup, step 1 |
| Page loads but says "No .wav files in demo-calls/ yet" | No demo calls added | First-time setup, step 3, then reload |
| Transcript shows `⚠️ KeyError: 'GEMINI_API_KEY'` | `.env` is missing or has no key | First-time setup, step 2, then restart the server |
| `⚠️ ... 404 ... model not found` | The model name in `.env` isn't available to your key | Set `GEMINI_MODEL` to a Flash model listed in AI Studio, then restart |
| `⚠️ ... thinking ...` error | The model doesn't support a thinking budget | Add `GEMINI_THINKING_BUDGET=` (empty) to `.env`, then restart |
| `⚠️ ... 429` / quota errors | Free tier allows 5 requests per minute per model | Run the precompute script (below) once; the app then plays from saved results with no API calls |
| Status shows "Taking a little longer, trying again…" | Gemini is overloaded or out of quota | Nothing to do: that audio is resent with the next chunk, and `GEMINI_FALLBACK_MODELS` is tried first. Precompute retries every 60 s |
| "The microphone did not start" | Permission was blocked, or the page isn't on `localhost` | Click the 🔒/🎙️ icon in the address bar and allow the microphone; open the app at `http://localhost:8000` |
| "This file could not be opened" on upload | ffmpeg can't decode the file | Convert it first: `ffmpeg -i in.xxx out.wav`, then upload the `.wav` |
| Recording finished playing but status says "Checking the last part…" | The last chunk is waiting for the rate-limit gap | Wait up to ~20 s; results are then saved |
| Old version of the page after editing files | Browser cache | Hard reload: `Cmd+Shift+R` |
| Call plays but nothing is analysed | JavaScript error | Open DevTools (`Cmd+Option+I`), Console tab, and read the red error |

Find and stop whatever is using port 8000:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

```bash
kill $(lsof -t -iTCP:8000 -sTCP:LISTEN)
```

## Quick health check

With the server running, each of these should return JSON:

```bash
curl -s localhost:8000/config
```

```bash
curl -s localhost:8000/calls
```

## Three ways to use the app

The whole screen switches between ગુજરાતી, हिंदी and English (top right); the choice is remembered.

| Mode | How | Notes |
|---|---|---|
| 🎙️ **Listen to a call** | Put the phone call on speaker next to the laptop, click **Listen to a call**, and allow the microphone. Click **Stop listening** (or **Hang up**) when done. | Warnings appear during the call. Use Chrome. The microphone works on `http://localhost` without HTTPS. Nothing from a live call is saved. |
| 📁 **Check a recording** | Click **Check a recording** and choose an audio file (wav, mp3, m4a, ogg, aac, amr, opus, webm), or drop one on it. | It's converted, added to Sample calls as "Your recording", played, and checked as it plays. Results are saved when it finishes, so the next play is instant and offline. |
| 📞 **Sample calls** | Click a call. | "Ready" calls replay saved results with no API calls. "New" calls are analysed live the first time. |

**Free-tier timing:** live analysis sends a chunk about every 12 s (`GEMINI_RPM=5`), so a live warning appears roughly 10–25 s after the scammer says the red-flag line. If you enable billing on the Gemini key, set `GEMINI_RPM=30` in `.env` and restart: chunks then go every 5 s and warnings arrive faster.

Uploaded recordings live in `demo-calls/uploads/` and are git-ignored, since they may be real calls. To remove one, delete its `.wav` there and its `demo-calls/cache/uploads_<name>.json`.

## Saved results: analyse once, play many times

The audio files are always local (`demo-calls/*.wav`). Only the **analysis** comes from Gemini, and it's saved to `demo-calls/cache/` (one JSON file per call). Playing a call with saved results shows them at the right moments and never calls Gemini. A call without saved results is analysed live the first time it plays, then saved.

**Download the analysis for every call once** (no server needed, paced to stay under the free-tier limit):

```bash
.venv/bin/python -m backend.precompute
```

- Run it again any time; chunks already saved are skipped.
- After adding or re-recording a WAV, analyse just that file:

```bash
.venv/bin/python -m backend.precompute scam_fake_kyc.wav
```

- To redo everything, for example after changing the prompt:

```bash
.venv/bin/python -m backend.precompute --fresh
```

In the app, tick **"Check again"** under Settings only if you want to show live Gemini calls. Leave it unticked on stage: the demo then runs fully offline from the saved results.

Commit `demo-calls/cache/` so the saved results travel with the project.

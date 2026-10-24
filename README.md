# Call Shield (કૉલ રક્ષક · कॉल रक्षक)

A voice assistant that listens to a phone call and warns the person, **while the call is still going**, when it sounds like a scam. The warning is in simple Gujarati, Hindi or English, and it says exactly which red flags it heard.

Built for **Build · Hack · Garba 2026** by GDG Ahmedabad, problem statement *"Voice AI: Scam Call Shield"*.

## The problem

"Digital arrest", fake KYC and fake courier calls cost Indians thousands of crores a year. Elders and first-time smartphone users are hit hardest, and the scam works because the victim is alone on the call. Call Shield puts a guardian on the call.

## What it does

- **Listen to a call.** Put the phone on speaker next to the laptop. The app listens through the microphone and warns during the call.
- **Check a recording.** Upload a call recording (wav, mp3, m4a, ogg, aac, amr, opus or webm). It plays and is checked as it plays.
- **Sample calls.** Play demo calls. Calls analysed before replay their saved results instantly, with no internet needed.

When it hears a scam, the screen turns red with a plain warning such as *"Police never arrest anyone over a video call. Hang up and call 1930."* It also shows **Hang up** and **Call 1930** buttons, plays a beep, and can read the warning aloud.

It names the red flags it heard, each with the caller's exact words:

| Flag | Example |
|---|---|
| Rushed you to act now | "abhi turant", "aaj hi" |
| Threatened you | arrest warrant, FIR, account block |
| Claimed to be police or a bank | "main CBI se bol raha hoon" |
| Asked for your OTP | "OTP bata dijiye" |
| Asked you to send money | "RBI safe account mein transfer kijiye" |
| Told you to keep it secret | "kisi ko mat batana" |
| Asked you to open an app or link | "AnyDesk download karo" |
| Asked for Aadhaar or bank details | "Aadhaar number bataiye" |
| Talked of "arrest" on video call | "video call par aaiye, aap digital arrest mein hain" |

**It doesn't cry wolf.** A single mention of a bank or the police is not enough. A scam verdict needs a real danger sign, such as a threat, an OTP or money request, or a request to install an app. A genuine bank reminder call stays green.

## Designed for elders

- One big status card in plain words: *Ready → Listening → Nothing wrong so far / Be careful / This is a fraud call. Hang up.*
- Only two choices on the home screen, and one large **Stop** button during a call.
- The whole screen switches between ગુજરાતી, हिंदी and English.
- Large text and buttons, high contrast, and no technical words on screen.
- Works at phone width.

## How it works

```
Microphone or recording ──► browser cuts the audio into short chunks (5 s+, 1 s overlap)
                             │
                             ▼
                    FastAPI  POST /analyze
                             │  audio chunk + transcript so far + previous assessment
                             ▼
                    Gemini Flash (audio in, JSON out)
                             │  transcript · red flags with quotes · risk score · warnings in gu/hi/en
                             ▼
              merge across the call (flags never expire, risk only goes up)
                             │
                             ▼
              browser: status card, red-flag list, beep, spoken warning
```

- **End-to-end audio model.** Gemini hears the audio directly, so the app doesn't depend on the browser's Web Speech API, which struggles with colloquial Gujarati and Hindi.
- **Chunks are paced to the Gemini rate limit** (`GEMINI_RPM`), so live calls keep working on the free tier.
- **Retries.** A chunk that fails (slow model, overload, quota) is resent with the next one, and fallback models are tried first.
- **Saved results.** Every analysed recording is saved to `demo-calls/cache/`, so it replays without calling the API.

More detail: [FLOW.md](FLOW.md) covers the architecture, API and demo script. [SKILLS.md](SKILLS.md) covers the scam patterns, prompt design and evaluation.

## Quick start

You need Python 3.11+, ffmpeg and a Gemini API key from https://aistudio.google.com/apikey.

1. Create the virtual environment and install the backend dependencies:

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
```

2. Create your `.env` file, then put your key in it as `GEMINI_API_KEY`:

```bash
cp .env.example .env
```

3. Start the server:

```bash
.venv/bin/uvicorn backend.main:app --reload --port 8000
```

4. Open **http://localhost:8000** in Chrome.

Optional: analyse all demo calls once, so they replay offline on stage.

```bash
.venv/bin/python -m backend.precompute
```

For the full setup, troubleshooting and demo-day steps, see [RUN.md](RUN.md) and [SETUP.md](SETUP.md).

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | (required) | Your Gemini key |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Main model (must accept audio) |
| `GEMINI_FALLBACK_MODELS` | `gemini-3.1-flash-lite` | Tried when the main model is slow, overloaded or out of quota |
| `GEMINI_TIMEOUT_SECONDS` | `20` | Give up on a model after this long |
| `GEMINI_THINKING_BUDGET` | `0` | `0` = fastest; leave empty for models that don't support it |
| `GEMINI_RPM` | `5` | Requests per minute your plan allows (free tier: 5) |
| `CHUNK_SECONDS` | `5` | Minimum seconds of audio per chunk |
| `ALERT_THRESHOLD` | `70` | Risk score (0–100) for the fraud warning |

## Project structure

```
backend/
  main.py          FastAPI: serves the page and audio; /upload, /analyze, /finish, /saved, /calls, /config
  analyzer.py      Gemini call, fallback models, per-call state, saved timelines
  precompute.py    Analyse all calls once and save results
prompts/
  scam_detector.md The detector prompt (red-flag rules, calibration, warning style)
frontend/
  index.html       Page and styles
  app.js           Mic capture, upload, chunking, rate pacing, UI in gu/hi/en
demo-calls/        Demo .wav files; cache/ holds saved results; uploads/ holds uploaded recordings (git-ignored)
```

## Results on test calls

| Call | Result | Warning |
|---|---|---|
| Fake police / digital arrest (Hindi, 36 s) | Fraud, risk 100, all 7 red flags in the call caught | at 10–15 s (saved results) |
| Bank FD reminder (genuine, 25 s) | Safe the whole way, risk 20 | none |

On the free tier, live analysis sends a chunk about every 12 s, so a live warning arrives roughly 10–25 s after the red-flag line. With billing enabled, set `GEMINI_RPM=30` for 5 s chunks.

## Limitations

- **Microphone mode needs the call on speakerphone.** The app hears the call through the laptop microphone; it doesn't connect to the phone itself.
- **Live speed depends on your Gemini plan's rate limit.**
- **The Hang up and Call 1930 buttons are basic.** "Call 1930" starts a `tel:` link. "Hang up" stops listening; it can't end the phone call.
- **It's a hackathon prototype, not a certified fraud-detection product.** Always verify through official channels.

**If you get a fraud call:** hang up, share nothing, call **1930** (National Cyber Crime Helpline) or report at **https://cybercrime.gov.in**.

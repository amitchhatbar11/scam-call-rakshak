# Setup: Scam Call Shield

Time budget: about 2.5 hours. Setup should take **15 minutes or less**. Everything else is build and demo.

## Stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Audio understanding | **Gemini Flash (audio input)** via `google-genai` | One call does transcription, language detection and scam reasoning for Hindi, Gujarati and Hinglish. No separate STT step. |
| Backend | **Python 3.11 + FastAPI** | One file and one endpoint. Keeps a rolling transcript per call. |
| Frontend | **Plain HTML + JS** (no build step) | Plays the .wav, cuts it into chunks in real time, shows the live risk meter and warning. |
| Audio tooling | **ffmpeg** | Converts recordings to 16 kHz mono WAV. |

Fallback if Gemini quota or latency becomes a problem: Sarvam `saarika` STT plus a text LLM call (see SKILLS.md §6).

## Step 1: Prerequisites (already on this machine)

- Python 3.11 (`python3 --version`)
- ffmpeg (`ffmpeg -version`)
- A Gemini API key from https://aistudio.google.com/apikey

## Step 2: Python environment

```bash
cd /Users/amitchhatbar11/Documents/garbathon/scam-call-shield
```

```bash
python3 -m venv .venv && source .venv/bin/activate
```

```bash
pip install -r backend/requirements.txt
```

## Step 3: Secrets

```bash
cp .env.example .env
```

Put your key in `.env` as `GEMINI_API_KEY`. Never commit `.env`; it's already in `.gitignore`.

## Step 4: Smoke-test Gemini audio (do this before writing any app code)

Record any 5-second clip, convert it, and confirm the model transcribes Hindi or Gujarati:

```bash
ffmpeg -i input.m4a -ar 16000 -ac 1 demo-calls/test.wav
```

```bash
python3 -c "
import os; from dotenv import load_dotenv; from google import genai; from google.genai import types
load_dotenv(); c=genai.Client(api_key=os.environ['GEMINI_API_KEY'])
b=open('demo-calls/test.wav','rb').read()
r=c.models.generate_content(model=os.environ['GEMINI_MODEL'],contents=[types.Part.from_bytes(data=b,mime_type='audio/wav'),'Transcribe this audio verbatim in its original script.'])
print(r.text)"
```

If this prints a sensible transcript, the core risk of the project is gone.

## Step 5: Demo audio (do this in parallel with Step 6)

You need **3 scam calls and 1 genuine call**, each 45–90 seconds long. Script outlines are in FLOW.md §4.

- **Best option:** two teammates read the scripts and record them on a phone. Real voices with natural Hinglish or Gujarati code-mixing make the demo more convincing.
- **Fast option:** generate them with a multi-speaker TTS (Gemini TTS or Sarvam Bulbul).

Normalise every file:

```bash
for f in demo-calls/raw/*; do ffmpeg -y -i "$f" -ar 16000 -ac 1 "demo-calls/$(basename "${f%.*}").wav"; done
```

Name them: `scam_digital_arrest.wav`, `scam_fake_kyc.wav`, `scam_courier.wav`, `genuine_bank_reminder.wav`.

## Step 6: Build (see FLOW.md for the architecture and timeline)

Target layout:

```
scam-call-shield/
├── backend/
│   ├── main.py            # FastAPI: POST /analyze, GET / serves frontend
│   ├── analyzer.py        # Gemini call + rolling session state
│   └── requirements.txt
├── prompts/
│   └── scam_detector.md   # system prompt (copy from SKILLS.md §3)
├── frontend/
│   ├── index.html         # call picker, player, transcript, risk meter, warning card
│   └── app.js             # WAV slicing + chunk upload + UI updates
├── demo-calls/            # *.wav
├── SETUP.md  SKILLS.md  FLOW.md
└── .env.example
```

Run:

```bash
uvicorn backend.main:app --reload --port 8000
```

Open http://localhost:8000.

## Step 7: Version control

```bash
git init && git add -A && git commit -m "Scaffold Scam Call Shield"
```

## Pre-demo checklist

- [ ] All 4 WAVs play and are analysed end to end at least twice
- [ ] The scam warning fires **before** the call ends, by 30–40 seconds at the latest
- [ ] The genuine call stays green the whole way through
- [ ] The warning is in Gujarati **and** Hindi and names the specific red flags
- [ ] `.venv/bin/python -m backend.precompute` has run, so every call plays from saved results and flaky Wi-Fi can't kill the demo
- [ ] The laptop volume is up and the browser tab is already open

# SKILLS: what this project needs to know and do

This is the playbook of knowledge and techniques the build depends on. Each section is a "skill" the system (or a teammate) must have.

---

## 1. Domain skill: recognise Indian phone-scam patterns

### Scam types to cover

| Scam | Typical script | Key tells |
|---|---|---|
| **Digital arrest** | "This is CBI / Mumbai Police / Customs. A parcel in your name has drugs. Stay on video call, you are under digital arrest." | Claims to be police or an agency, threat of arrest, isolation ("don't tell family"), asks for a video call, asks to move money for "verification" |
| **Fake KYC** | "Your bank / Paytm KYC is expiring today, your account will be blocked. Share the OTP / install this app." | Urgency (today, in 2 hours), account-block threat, OTP request, remote-access app (AnyDesk, TeamViewer), link |
| **Fake courier** | "FedEx / DHL: your parcel is held at customs, pay ₹X clearance, or press 1." | Unexpected parcel, small fee, then escalation to police, IVR "press 1" |
| Bonus | Electricity cut-off, fake job or task scam, "wrong UPI transfer, please return" | Same flag set |

### Red-flag taxonomy (the model must output these exact keys)

| Key | Meaning | Example phrases (Hindi / Gujarati / English) |
|---|---|---|
| `URGENCY` | Artificial time pressure | "abhi turant", "aaj hi", "hamna j", "2 ghante mein" |
| `THREAT` | Arrest, legal action, account block, penalty | "arrest warrant", "FIR", "account band", "giraftar" |
| `AUTHORITY_CLAIM` | Claims to be police, CBI, ED, RBI, TRAI, customs, bank | "main CBI se bol raha hoon", "hu bank mathi bolu chu" |
| `OTP_REQUEST` | Asks for an OTP, PIN, CVV or password | "OTP bata dijiye", "OTP kaho" |
| `MONEY_REQUEST` | Asks to pay or transfer, or "verify" funds into a "safe account" | "RBI safe account", "UPI karo", "paisa transfer" |
| `ISOLATION` | Tells the victim to keep it secret or stay on the call | "kisi ko mat batana", "call cut mat karna", "koi ne kehta nahi" |
| `REMOTE_ACCESS` | Asks to install an app, share the screen or click a link | "AnyDesk download karo", "link par click karo" |
| `PERSONAL_DATA` | Asks for Aadhaar, PAN or card number | "Aadhaar number bataiye" |
| `VIDEO_CALL_CUSTODY` | Moves to a video call to "interrogate" or "keep in custody" | "Skype par aaiye", "video call par raho" |

### Facts that power the explanations (keep each to one sentence)

- Police, CBI and ED **never** arrest anyone over a phone or video call. "Digital arrest" does not exist in Indian law.
- No bank, RBI or government agency will **ever** ask for your OTP, PIN or CVV.
- The RBI has no "safe account" or "verification account".
- Real KYC updates happen at a branch or in the official app, never through a link or AnyDesk.
- Customs does not call you to collect money for a parcel.
- **What to do:** hang up, don't share anything, call 1930 (National Cyber Crime Helpline), report at cybercrime.gov.in, and tell a family member.

### Avoiding false alarms (the genuine call)

Real calls mention a bank or a delivery but do **not** ask for an OTP or money over the phone, and they don't threaten. They usually point you to the official app or branch. A good genuine demo call is a bank relationship manager reminding someone about an FD maturity and saying "visit the branch or check the app".

**Rule:** a single mild flag such as AUTHORITY_CLAIM on its own should never trip the alert. You need a **combination** (authority + threat, or any OTP or money request with urgency).

---

## 2. Audio skill: chunked near-real-time processing

- Normalise all audio to **16 kHz, mono, 16-bit PCM WAV** (about 32 KB/s, so a 5 s chunk is about 160 KB).
- Chunk size: **5 s**, with a **1 s overlap** so words at the boundary aren't lost.
- The browser plays the file normally. At the same time it slices the decoded PCM from the Web Audio `AudioBuffer` and posts each chunk **as playback reaches it**, so the analysis is tied to what the audience hears.
- Re-encode each slice to a WAV blob in JS (44-byte header + Int16 samples). There's no library for this; the helper is about 20 lines.
- Requests run sequentially per session. If one is still in flight, queue the next. Never drop a chunk.
- Expected latency is about 1.5–3 s per chunk on Flash, so the warning lands about 5–8 s after the red-flag sentence is spoken. That's fine.

---

## 3. LLM skill: the detector prompt + structured output

Save as `prompts/scam_detector.md`. Each request sends **the new audio chunk, the rolling transcript so far, and the previous risk state**.

```
You are Scam Call Shield, a guardian listening to a live phone call in India on behalf of
an elderly or first-time smartphone user. Calls may be in Hindi, Gujarati, English or a mix.

You receive: (1) the transcript so far, (2) your previous assessment, (3) a new ~5 second
audio chunk of the call.

Do:
1. Transcribe ONLY the new chunk verbatim in its original script (Devanagari / Gujarati / Latin).
2. Re-assess the WHOLE call so far for scam risk. Risk should only fall if the caller clearly
   says something reassuring and legitimate; flags never "expire".
3. List red flags heard so far using ONLY these keys: URGENCY, THREAT, AUTHORITY_CLAIM,
   OTP_REQUEST, MONEY_REQUEST, ISOLATION, REMOTE_ACCESS, PERSONAL_DATA, VIDEO_CALL_CUSTODY.
   For each, quote the exact words that triggered it.
4. Write a warning a 70-year-old can understand in 2 short sentences, in BOTH simple Gujarati
   and simple Hindi: what is happening + what to do now (hang up, don't share OTP, call 1930).
   Use the facts: police never arrest over video call; banks never ask for OTP; RBI has no safe account.

Do NOT raise risk above 40 for a single authority mention with no threat, money or OTP ask.
A genuine bank/courier call that directs the user to the official app or branch is SAFE.
```

Force JSON with `response_mime_type="application/json"` and a `response_schema`:

```json
{
  "chunk_transcript": "string",
  "language": "hi | gu | en | mixed",
  "risk_score": 0,
  "verdict": "SAFE | SUSPICIOUS | SCAM",
  "red_flags": [{ "type": "OTP_REQUEST", "evidence": "OTP bata dijiye" }],
  "warning_gu": "string",
  "warning_hi": "string",
  "warning_en": "string"
}
```

Score bands: 0–39 SAFE (green), 40–69 SUSPICIOUS (amber), 70–100 SCAM (red, full-screen warning plus an alert sound).

Server-side rule: keep `max(risk)` across chunks for the banner (it latches), and merge red flags across chunks, de-duplicated by `type`.

---

## 4. Gemini API skill

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
resp = client.models.generate_content(
    model=os.environ["GEMINI_MODEL"],
    contents=[
        types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
        f"TRANSCRIPT SO FAR:\n{transcript}\n\nPREVIOUS ASSESSMENT:\n{prev_json}",
    ],
    config=types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=Assessment,   # a pydantic model mirroring §3
        temperature=0.2,
    ),
)
result = resp.parsed
```

- Use a **Flash**-tier model for latency. Pro is too slow for 5 s chunks.
- Turn thinking off or keep it minimal (`thinking_config=types.ThinkingConfig(thinking_budget=0)` where supported) to cut latency.
- Inline audio bytes are fine at this size. No file upload API is needed.
- Optional stretch: the Gemini **Live API** for true streaming. Only try it if the chunked version is done by the 1:30 mark.

---

## 5. Frontend / UX skill: design for an elder under stress

- One giant **risk meter** (green → amber → red) and the **live transcript** below it.
- On SCAM: a full-width red card that's impossible to miss, with a big icon and the Gujarati and Hindi warning in a large font (≥ 24 px). The red flags appear as chips (🚨 OTP માંગ્યો / OTP माँगा), each with its quoted evidence. Play a short beep, then use `speechSynthesis` to read the Hindi warning aloud (`hi-IN` voice).
- A language toggle chooses which warning is shown first: ગુજરાતી / हिंदी / EN.
- Big buttons: **"Hang up"** and **"Call 1930"**. These are mock actions for the demo.
- Show the call picker: 4 cards (3 scam, 1 genuine).

---

## 6. Fallback skill: if Gemini audio misbehaves

1. **Sarvam** `speech-to-text` (saarika) for Hindi/Gujarati STT, then send the text-only transcript to an LLM with the same prompt and schema. Two calls, but robust.
2. **Bhashini** ASR. More setup; avoid it unless you already have credentials.
3. **Demo insurance:** cache every `/analyze` response by `(file, chunk_index)` to `demo-calls/cache/*.json` on the first run. `/analyze` uses a saved result whenever one exists (send `fresh=true` to force a Gemini call), and `backend/precompute.py` fills the cache for all calls in one go. The demo then works offline.

---

## 7. Evaluation skill: prove it doesn't cry wolf

For each of the 4 calls, record:

| Call | Expected | Seconds into call when the alert fired | Flags caught | Max risk on the genuine call |
|---|---|---|---|---|

Show this table on the last slide or screen. It's the judges' "does it work" answer.

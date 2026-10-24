# FLOW: how Scam Call Shield works and how to build it

## 1. System flow

Three ways in, one analysis pipeline:

| Mode | Audio source | When Gemini is called |
|---|---|---|
| 🎙️ **Live call** | Microphone (call on speakerphone) | Always, while the call is going on. Nothing is saved. |
| 📁 **Upload a recording** | Any audio file → `POST /upload` → 16 kHz WAV in `demo-calls/uploads/` | While it plays the first time; results are saved, so later plays use them |
| 📞 **Calls list** | `demo-calls/*.wav` and earlier uploads | Only if the call has no saved results (or "Fresh analysis" is ticked) |

```
┌──────────────────────────── Browser (frontend/) ──────────────────────────────┐
│ Mic (getUserMedia → ScriptProcessor → PCM buffer)    ┐                        │
│ File (<audio> plays; decodeAudioData → PCM at 16 kHz) ┘→ PCM so far           │
│                                                                               │
│ Every 250 ms: if ≥ CHUNK_SECONDS of new audio AND ≥ 60/GEMINI_RPM s since the │
│ last request AND none in flight → slice [lastEnd − 1 s, now] → WAV blob       │
│ POST /analyze {session_id, start, end, audio}                                 │
│   ok    → transcript ↑, risk meter, flag chips; SCAM → red card, beep, speech │
│   error → keep that audio; it goes out with the next chunk ("retrying")       │
│ Call ends → POST /finish {session_id, call_name} (saves results for files)    │
│                                                                               │
│ Saved results: GET /saved/<call> → show each result when playback reaches     │
│ its end time. No Gemini calls.                                                │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │ multipart/form-data
┌──────────────────────────────────────▼──── FastAPI (backend/) ────────────────┐
│ Session state {transcript, flags, max_risk, last assessment, timeline}        │
│ Gemini Flash(audio chunk + transcript so far + previous assessment)           │
│   → JSON {chunk_transcript, risk_score, verdict, red_flags, warning_gu/hi/en} │
│   20 s timeout per model; on timeout/429/503 try GEMINI_FALLBACK_MODELS       │
│ merge: transcript += chunk; flags ∪= new; max_risk = max(...);                │
│        no SCAM without a hard flag (threat, OTP, money, remote access, video) │
│ timeline += {start, end, merged result}; /finish writes                       │
│        demo-calls/cache/<call>.json                                           │
└───────────────────────────────────────────────────────────────────────────────┘
```

Chunks are paced so the app stays under the Gemini rate limit. On the free tier (`GEMINI_RPM=5`) live chunks are about 12 s apart, so a warning lands roughly 10–25 s after the red-flag sentence. With billing enabled, raise `GEMINI_RPM` (e.g. 30) and chunks drop to `CHUNK_SECONDS` (5 s). Saved results always replay with the 5 s precompute timing.

**API**

| Endpoint | Purpose |
|---|---|
| `GET /config` | `chunk_seconds`, `overlap_seconds`, `alert_threshold`, `rpm` |
| `GET /calls` | Calls in `demo-calls/` and `demo-calls/uploads/`, with `saved` and `uploaded` flags |
| `GET /saved/<call>` | Saved timeline `{call, entries: [{start, end, result}]}`, or 404 |
| `POST /upload` | `file` (any format ffmpeg reads) → converted WAV, returns its call entry |
| `POST /analyze` | `session_id`, `start`, `end`, `audio` (wav) → merged call state (below) |
| `POST /finish` | `session_id`, optional `call_name` → ends the session; saves its timeline when `call_name` is given |

`POST /analyze` returns:

```json
{
  "chunk_transcript": "…",
  "full_transcript": "…",
  "risk_score": 82,
  "max_risk": 82,
  "verdict": "SCAM",
  "red_flags": [{"type": "AUTHORITY_CLAIM", "evidence": "main Mumbai Police se bol raha hoon"},
                {"type": "THREAT", "evidence": "aapke naam par arrest warrant hai"}],
  "warning_gu": "આ ફ્રોડ કૉલ છે. પોલીસ ક્યારેય વીડિયો કૉલ પર ધરપકડ કરતી નથી — ફોન કાપી નાખો અને 1930 પર કૉલ કરો.",
  "warning_hi": "यह धोखाधड़ी वाली कॉल है। पुलिस कभी वीडियो कॉल पर गिरफ़्तार नहीं करती — फ़ोन काटें और 1930 पर कॉल करें।",
  "warning_en": "…"
}
```

`backend/precompute.py` creates saved results for every call ahead of time, using fixed 5 s chunks paced to the rate limit.

## 2. Per-chunk decision flow

```
new chunk ─► transcribe ─► any flags in whole call so far?
                               │
                ┌──── no ──────┴────── yes ────┐
                ▼                              ▼
          SAFE (green)           combination check:
                                 AUTHORITY + THREAT, or
                                 OTP/MONEY/REMOTE_ACCESS + any other flag?
                                   │                 │
                                  no                yes
                                   ▼                 ▼
                         SUSPICIOUS (amber)    SCAM (red) ─► latch banner,
                         keep listening                      beep + speak warning
```

## 3. Demo flow (3 minutes on stage)

1. **Hook (20 s):** "Thousands of crores lost to digital-arrest scams. They work because the victim is alone on the call. We put a guardian on the call."
2. **Scam call #1, digital arrest (60 s):** play it. The audience watches the transcript scroll and the meter climb. The red card fires mid-call, and the Gujarati and Hindi warning is read aloud. Point at the flag chips and their quoted evidence.
3. **Genuine call (40 s):** play the bank FD reminder. The meter stays green. "It doesn't cry wolf."
4. **Scam call #2, fake KYC (30 s):** start it and stop once the OTP request is flagged.
5. **Close (30 s):** the eval table (SKILLS.md §7) and "next: on-device Android call-screening app plus a family alert via WhatsApp".

## 4. Demo call scripts (outlines; ad-lib in natural Hinglish/Gujarati)

**A. `scam_digital_arrest.wav` (Hindi, about 75 s)**
- 0–10 s: "Namaste, main Mumbai Police Cyber Cell se Inspector Sharma bol raha hoon." *(AUTHORITY)*
- 10–25 s: "Aapke Aadhaar se ek parcel bheja gaya hai jisme drugs mile hain. Aapke naam par arrest warrant hai." *(THREAT, PERSONAL_DATA)*
- 25–40 s: "Abhi video call par aaiye, aap digital arrest mein hain. Kisi ko mat batana, call mat kaatna." *(VIDEO_CALL_CUSTODY, ISOLATION)*
- 40–60 s: "Verification ke liye apne account ka paisa RBI safe account mein turant transfer kijiye." *(MONEY, URGENCY)* → **should be red by here**
- 60–75 s: The victim hesitates and the caller escalates.

**B. `scam_fake_kyc.wav` (Gujarati, about 60 s)**
- "Hu SBI KYC department mathi bolu chu. Tamaru KYC aaje expire thai jashe, account block thai jashe." *(AUTHORITY, URGENCY, THREAT)*
- "Tamara phone par ek OTP aavyo hashe, e mane kaho." *(OTP)*
- "Nahi to AnyDesk app download karo, hu madad karish." *(REMOTE_ACCESS)*

**C. `scam_courier.wav` (Hinglish, about 60 s)**
- An IVR-style opening: "Your FedEx parcel is on hold, press 1." Then a "customs officer" asks for a ₹1,999 clearance fee by UPI, then threatens police involvement.

**D. `genuine_bank_reminder.wav` (Gujarati/Hindi, about 45 s)**
- "Namaste, hu HDFC branch mathi Priya bolu chu, tamari FD aavta mahine mature thay chhe. Renewal mate branch par aavjo athva app ma joi lo. Koi OTP ke details phone par na aapsho." → **must stay green**

## 5. Build timeline (2.5 h, 2–3 people)

| Time | Person A: backend + AI | Person B: frontend | Person C (or A/B): content |
|---|---|---|---|
| 0:00–0:15 | SETUP.md steps 1–4, Gemini smoke test | Static `index.html` layout | Finalise the 4 scripts |
| 0:15–0:50 | `analyzer.py`: prompt, schema, session merge | WAV decode + chunk slicer + queue | Record or TTS the 4 calls, run ffmpeg |
| 0:50–1:20 | `/analyze` endpoint, run it on the real WAVs, tune the prompt | Risk meter, transcript, flag chips | Gujarati and Hindi copy for the UI labels |
| 1:20–1:45 | **Integration**: run all 4 calls end to end and tune the thresholds so the genuine call stays green | Warning card, beep, `speechSynthesis` | Fill in the eval table |
| 1:45–2:05 | Response cache + `backend/precompute.py` | Polish: big fonts, language toggle, mock buttons | Pitch slides (3 max) |
| 2:05–2:30 | **Freeze code.** Rehearse the demo 2× from the cache and 1× live. | | |

**Cut list if behind (in order):** language toggle → speech readout → courier call → overlap between chunks. **Never cut:** the genuine call or the mid-call warning.

## 6. Failure modes and mitigations

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi slow or down | Run precompute beforehand; the app plays from saved results; phone hotspot as a backup |
| Gemini latency > 5 s | Shorter chunks (4 s), thinking off, Flash-Lite model, show a "listening…" pulse |
| Genuine call flagged | Tighten the "combination" rule in the prompt and add a server-side floor: no SCAM without an OTP, MONEY, REMOTE_ACCESS or THREAT flag |
| Gujarati transcript poor | The verdict still works on flags; show the Hindi or English transcript; swap to the Sarvam STT fallback |
| Rate limit (429) / overload (503) | 20 s timeout per model, then `GEMINI_FALLBACK_MODELS`; precompute paces itself to `GEMINI_RPM` |

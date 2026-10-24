"""FastAPI app: serves the frontend and calls, accepts uploads, and analyses audio chunks."""

import asyncio
import os
import re
import subprocess
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from backend.analyzer import analyze_chunk, finish_session, load_timeline  # noqa: E402  (needs env loaded)

CALLS_DIR = ROOT / "demo-calls"
UPLOADS_DIR = CALLS_DIR / "uploads"

app = FastAPI(title="Scam Call Shield")


def _call_entry(path: Path) -> dict:
    name = path.relative_to(CALLS_DIR).as_posix()  # "scam_kyc.wav" or "uploads/my_call.wav"
    return {
        "name": name,
        "url": f"/audio/{name}",
        "genuine": path.stem.startswith("genuine"),
        "uploaded": path.parent == UPLOADS_DIR,
        "saved": load_timeline(name) is not None,
    }


@app.get("/config")
def config() -> dict:
    return {
        "chunk_seconds": float(os.getenv("CHUNK_SECONDS", "5")),
        "overlap_seconds": 1.0,
        "alert_threshold": int(os.getenv("ALERT_THRESHOLD", "70")),
        "rpm": float(os.getenv("GEMINI_RPM", "5")),
    }


@app.get("/calls")
def calls() -> list[dict]:
    paths = sorted(CALLS_DIR.glob("*.wav")) + sorted(UPLOADS_DIR.glob("*.wav"), key=lambda p: -p.stat().st_mtime)
    return [_call_entry(p) for p in paths]


@app.get("/saved/{call_name:path}")
def saved(call_name: str) -> dict:
    timeline = load_timeline(call_name)
    if timeline is None:
        raise HTTPException(status_code=404, detail="No saved results for this call")
    return timeline


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    """Save an uploaded recording (any format ffmpeg reads) as 16 kHz mono WAV in demo-calls/uploads/."""
    stem = re.sub(r"[^A-Za-z0-9_-]", "_", Path(file.filename or "recording").stem)[:50] or "recording"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    out = UPLOADS_DIR / f"{stem}.wav"
    n = 2
    while out.exists():
        out = UPLOADS_DIR / f"{stem}_{n}.wav"
        n += 1

    with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "").suffix) as tmp:
        tmp.write(await file.read())
        tmp.flush()
        proc = await asyncio.to_thread(
            subprocess.run,
            ["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-ar", "16000", "-ac", "1", str(out)],
            capture_output=True, text=True,
        )
    if proc.returncode != 0:
        out.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Couldn't read that audio file: {proc.stderr.strip()[:200]}")
    return _call_entry(out)


@app.post("/analyze")
async def analyze(
    session_id: str = Form(...),
    start: float = Form(...),
    end: float = Form(...),
    audio: UploadFile = File(...),
) -> dict:
    wav_bytes = await audio.read()
    try:
        return await analyze_chunk(session_id, start, end, wav_bytes)
    except Exception as e:  # surface model/API errors to the UI instead of a bare 500
        raise HTTPException(status_code=502, detail=f"{type(e).__name__}: {e}") from e


@app.post("/finish")
def finish(session_id: str = Form(...), call_name: str = Form("")) -> dict:
    """End a session; with call_name, save its results so the call replays without Gemini."""
    return {"saved": finish_session(session_id, call_name or None)}


UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/audio", StaticFiles(directory=CALLS_DIR), name="audio")
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")

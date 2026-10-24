"""Analyse every demo call once and save the results to demo-calls/cache/.

The app then plays from these saved results and doesn't call Gemini again.
Chunks are CHUNK_SECONDS long with a 1 s overlap, and requests are paced to
stay under GEMINI_RPM.

    .venv/bin/python -m backend.precompute               # all calls not saved yet
    .venv/bin/python -m backend.precompute scam_kyc.wav  # one call (also uploads/<name>.wav)
    .venv/bin/python -m backend.precompute --fresh       # redo everything
"""

import asyncio
import io
import os
import subprocess
import sys
import time
import uuid
import wave
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from backend.analyzer import analyze_chunk, finish_session, load_timeline  # noqa: E402  (needs env loaded)

CALLS_DIR = ROOT / "demo-calls"
RATE = 16000
OVERLAP = 1.0
MAX_ATTEMPTS = 4


def load_pcm(path: Path) -> bytes:
    """Decode any audio file to 16 kHz mono 16-bit PCM, matching the browser's decode."""
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-"],
        check=True, capture_output=True,
    ).stdout


def to_wav(pcm: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)
    return buf.getvalue()


async def process(path: Path, fresh: bool, chunk_s: float, gap: float) -> None:
    name = path.relative_to(CALLS_DIR).as_posix()
    if not fresh and load_timeline(name) is not None:
        print(f"\n== {name}: already saved, skipping (use --fresh to redo)")
        return
    pcm = load_pcm(path)
    duration = len(pcm) / 2 / RATE
    session_id = str(uuid.uuid4())
    print(f"\n== {name} ({duration:.1f}s)")

    i = 0
    while i * chunk_s < duration:
        start = max(0.0, i * chunk_s - OVERLAP)
        end = min(duration, (i + 1) * chunk_s)
        wav = to_wav(pcm[int(start * RATE) * 2 : int(end * RATE) * 2])

        for attempt in range(1, MAX_ATTEMPTS + 1):
            t = time.time()
            try:
                r = await analyze_chunk(session_id, start, end, wav)
                break
            except Exception as e:
                if attempt == MAX_ATTEMPTS:
                    raise
                print(f"  chunk {i}: {type(e).__name__}: {str(e)[:120]}  (waiting 60s, retry {attempt})")
                await asyncio.sleep(60)

        flags = ",".join(f["type"] for f in r["red_flags"]) or "-"
        print(f"  chunk {i} [{start:4.0f}-{end:4.0f}s] {r['verdict']:<10} {r['max_risk']:>3}  {time.time() - t:5.1f}s  {flags}")
        i += 1
        if i * chunk_s < duration:
            await asyncio.sleep(gap)

    print(f"  saved {finish_session(session_id, name)} results")


async def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    fresh = "--fresh" in sys.argv
    chunk_s = float(os.getenv("CHUNK_SECONDS", "5"))
    gap = 60 / float(os.getenv("GEMINI_RPM", "5"))
    paths = [CALLS_DIR / a for a in args] if args else sorted(CALLS_DIR.glob("*.wav")) + sorted(CALLS_DIR.glob("uploads/*.wav"))
    if not paths:
        sys.exit("No .wav files in demo-calls/")
    for p in paths:
        await process(p, fresh, chunk_s, gap)
    print("\nDone. Results saved in demo-calls/cache/")


if __name__ == "__main__":
    asyncio.run(main())

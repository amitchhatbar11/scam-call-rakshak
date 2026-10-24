"""Gemini-backed scam analysis with rolling per-call session state.

Each analysed call can be saved as a timeline (demo-calls/cache/<call>.json): the merged
result after every chunk, with the chunk's start/end time. Replaying a call shows those
results at the same playback times without calling Gemini again.
"""

import asyncio
import json
import os
import re
from enum import Enum
from pathlib import Path

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
PROMPT_PATH = ROOT / "prompts" / "scam_detector.md"
CACHE_DIR = ROOT / "demo-calls" / "cache"

# Flags strong enough to justify a SCAM verdict. Without one of these the
# server caps risk at SUSPICIOUS so a genuine call can't trip the red banner.
HARD_FLAGS = {"THREAT", "OTP_REQUEST", "MONEY_REQUEST", "REMOTE_ACCESS", "VIDEO_CALL_CUSTODY"}


class FlagType(str, Enum):
    URGENCY = "URGENCY"
    THREAT = "THREAT"
    AUTHORITY_CLAIM = "AUTHORITY_CLAIM"
    OTP_REQUEST = "OTP_REQUEST"
    MONEY_REQUEST = "MONEY_REQUEST"
    ISOLATION = "ISOLATION"
    REMOTE_ACCESS = "REMOTE_ACCESS"
    PERSONAL_DATA = "PERSONAL_DATA"
    VIDEO_CALL_CUSTODY = "VIDEO_CALL_CUSTODY"


class Verdict(str, Enum):
    SAFE = "SAFE"
    SUSPICIOUS = "SUSPICIOUS"
    SCAM = "SCAM"


class RedFlag(BaseModel):
    type: FlagType
    evidence: str


class Assessment(BaseModel):
    chunk_transcript: str
    language: str
    risk_score: int
    verdict: Verdict
    red_flags: list[RedFlag]
    warning_gu: str
    warning_hi: str
    warning_en: str


class Session:
    def __init__(self) -> None:
        self.transcript: list[str] = []
        self.flags: dict[str, str] = {}  # type -> first evidence heard
        self.max_risk = 0
        self.last: Assessment | None = None
        self.warnings = {"gu": "", "hi": "", "en": ""}
        self.timeline: list[dict] = []  # [{start, end, result}] in the order analysed


_sessions: dict[str, Session] = {}
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


def _config() -> types.GenerateContentConfig:
    kwargs = {}
    budget = os.getenv("GEMINI_THINKING_BUDGET", "0").strip()
    if budget:
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=int(budget))
    return types.GenerateContentConfig(
        system_instruction=PROMPT_PATH.read_text(encoding="utf-8"),
        response_mime_type="application/json",
        response_schema=Assessment,
        temperature=0.2,
        **kwargs,
    )


def _cache_path(call_name: str) -> Path:
    key = re.sub(r"[^A-Za-z0-9_-]", "_", call_name.removesuffix(".wav"))
    return CACHE_DIR / f"{key}.json"


async def _call_gemini(session: Session, wav_bytes: bytes) -> Assessment:
    context = (
        f"TRANSCRIPT SO FAR:\n{' '.join(session.transcript) or '(start of call)'}\n\n"
        f"PREVIOUS ASSESSMENT:\n{session.last.model_dump_json() if session.last else '(none)'}"
    )
    contents = [types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"), context]
    timeout = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "20"))
    models = [os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")] + [
        m.strip() for m in os.getenv("GEMINI_FALLBACK_MODELS", "").split(",") if m.strip()
    ]
    # Try each model once; move on when one is slow, overloaded or out of quota.
    last_error: Exception | None = None
    for model in models:
        try:
            resp = await asyncio.wait_for(
                _get_client().aio.models.generate_content(model=model, contents=contents, config=_config()),
                timeout,
            )
            if resp.parsed is not None:
                return resp.parsed
            return Assessment.model_validate_json(resp.text)
        except asyncio.TimeoutError:
            last_error = TimeoutError(f"{model} took longer than {timeout:.0f}s")
        except errors.APIError as e:
            if e.code not in (429, 500, 503, 504):
                raise
            last_error = e
    raise last_error or RuntimeError("no Gemini model configured")


def _merge(session: Session, a: Assessment) -> None:
    if a.chunk_transcript.strip():
        session.transcript.append(a.chunk_transcript.strip())
    for f in a.red_flags:
        session.flags.setdefault(f.type.value, f.evidence)

    risk = max(0, min(100, a.risk_score))
    if not HARD_FLAGS & session.flags.keys():
        risk = min(risk, 69)
    if risk >= session.max_risk or not session.warnings["en"]:
        session.warnings = {"gu": a.warning_gu, "hi": a.warning_hi, "en": a.warning_en}
    session.max_risk = max(session.max_risk, risk)
    session.last = a


def _verdict(risk: int) -> str:
    threshold = int(os.getenv("ALERT_THRESHOLD", "70"))
    if risk >= threshold:
        return "SCAM"
    if risk >= 40:
        return "SUSPICIOUS"
    return "SAFE"


async def analyze_chunk(session_id: str, start: float, end: float, wav_bytes: bytes) -> dict:
    """Analyse one audio chunk (seconds start-end of the call) and return the merged call state."""
    session = _sessions.setdefault(session_id, Session())
    assessment = await _call_gemini(session, wav_bytes)
    _merge(session, assessment)
    result = {
        "language": assessment.language,
        "chunk_transcript": assessment.chunk_transcript,
        "full_transcript": " ".join(session.transcript),
        "risk_score": assessment.risk_score,
        "max_risk": session.max_risk,
        "verdict": _verdict(session.max_risk),
        "red_flags": [{"type": t, "evidence": e} for t, e in session.flags.items()],
        "warning_gu": session.warnings["gu"],
        "warning_hi": session.warnings["hi"],
        "warning_en": session.warnings["en"],
    }
    session.timeline.append({"start": round(start, 2), "end": round(end, 2), "result": result})
    return result


def finish_session(session_id: str, call_name: str | None) -> int:
    """End a session. With a call_name, save its timeline for replay; returns entries saved."""
    session = _sessions.pop(session_id, None)
    if not session or not call_name or not session.timeline:
        return 0
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    data = {"call": call_name, "entries": session.timeline}
    _cache_path(call_name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(session.timeline)


def load_timeline(call_name: str) -> dict | None:
    path = _cache_path(call_name)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

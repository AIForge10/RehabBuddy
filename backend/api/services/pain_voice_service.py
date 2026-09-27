"""Spoken pain check-in: the patient answers out loud instead of tapping.

ElevenLabs Scribe writes down what they said, then Gemini picks out the score,
the symptoms and a short note. If Gemini is missing, failing or slow, a simple
number-word parser (English and Spanish) finds the score instead. Nothing here
is saved: the patient sees the result on the pain-check screen, fixes it if
needed, and sends it with the usual POST /pain-check.

The audio is never stored. It is read from the request body into memory, sent
to ElevenLabs, and dropped when the request ends.
"""
import asyncio
import logging
import math
import re
import unicodedata
from functools import lru_cache
from typing import Optional

from fastapi import HTTPException, Request, status
from google import genai
from google.genai.types import AutomaticFunctionCallingConfig, GenerateContentConfig, ThinkingConfig

from api.core.config import settings
from api.prompts import pain_voice as pain_voice_prompt
from api.schemas.pain_check import PainVoiceExtract, PainVoiceResponse
from api.services.stt_service import stt_service

log = logging.getLogger(__name__)

# Scribe's share of the frontend's 10-second timeout is STT_TIMEOUT_S; this is Gemini's.
GEMINI_TIMEOUT_S = 3

# The recorder stops at 15 s: about 60 KB of Opus from Chrome, 250 KB of AAC from Safari.
MAX_AUDIO_BYTES = 2 * 1024 * 1024

# What MediaRecorder produces (webm in Chrome and Firefox, mp4 in Safari), plus
# the usual file types, with the extension Scribe gets in the file name.
AUDIO_TYPES = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "video/mp4": "mp4",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
}


async def read_audio(request: Request) -> tuple[bytes, str, str]:
    """The recorded answer from the raw request body, with its media type and a
    file name for Scribe. Raises 415 for a type that isn't audio, 413 past the
    size limit and 400 for an empty body."""
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    ext = AUDIO_TYPES.get(content_type)
    if not ext:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Send the recording as audio: webm, mp4, ogg, mp3 or wav.")
    too_big = HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "The recording is too long.")
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_AUDIO_BYTES:
        raise too_big
    # Read in chunks so a body without an honest Content-Length can't grow past the limit either.
    audio = bytearray()
    async for chunk in request.stream():
        audio += chunk
        if len(audio) > MAX_AUDIO_BYTES:
            raise too_big
    if not audio:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No audio in the request.")
    return bytes(audio), content_type, f"answer.{ext}"


async def answer(audio: bytes, filename: str, content_type: str, language: str) -> PainVoiceResponse:
    """What the patient said and what it reports. Raises STTUnavailable or STTFailed
    when there's no transcript, so the screen can ask them to tap instead."""
    transcript = await stt_service.transcribe(audio, filename, content_type, language)
    if not transcript:
        return PainVoiceResponse(transcript="")
    try:
        found = await asyncio.wait_for(extract(transcript, language), GEMINI_TIMEOUT_S)
    except Exception:
        log.warning("Gemini couldn't read the spoken pain answer; using the number-word parser", exc_info=True)
        found = parse_answer(transcript)
    return PainVoiceResponse(
        transcript=transcript,
        pain_score=on_scale(found.pain_score),
        symptoms=list(dict.fromkeys(found.symptoms)),
        notes=found.notes.strip(),
    )


def on_scale(score: Optional[int]) -> Optional[int]:
    """A score the 0-10 buttons can show. Anything past 10 was never a pain
    score (degrees, reps), so it's dropped, not capped."""
    if score is None or score < 0 or score > 10:
        return None
    return score


# --- Gemini ------------------------------------------------------------------

# Its own client, created once like the one in routers/deps.py, so this module
# doesn't have to change the shared GeminiService.
@lru_cache
def _gemini() -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


async def extract(transcript: str, language: str) -> PainVoiceExtract:
    """Gemini's read of the answer, as structured output. Raises on any failure; the caller falls back."""
    cfg = GenerateContentConfig(
        system_instruction=pain_voice_prompt.SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=PainVoiceExtract,
        temperature=0,
        max_output_tokens=1024,  # counts any thinking tokens too; the answer itself is ~50
        thinking_config=ThinkingConfig(thinking_level=settings.GEMINI_THINKING_LEVEL.upper()),
        automatic_function_calling=AutomaticFunctionCallingConfig(disable=True),
    )
    models_to_try = [settings.GEMINI_MODEL]
    if settings.GEMINI_MODEL != "gemini-3.5-flash-lite":
        models_to_try.append("gemini-3.5-flash-lite")

    last_exc = None
    for m in models_to_try:
        try:
            response = await _gemini().aio.models.generate_content(
                model=m,
                contents=pain_voice_prompt.build_pain_voice_prompt(transcript, language),
                config=cfg,
            )
            if response.text:
                return PainVoiceExtract.model_validate_json(response.text)
        except Exception as e:
            last_exc = e
            continue

    if last_exc:
        raise last_exc
    raise ValueError("Empty response received from Gemini API.")


# --- Fallback parser -----------------------------------------------------------

NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    # "un" and "una" are left out: they're far more often "a" than "one".
    "cero": 0, "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
}
_NUM = r"(?:\d+|" + "|".join(NUMBER_WORDS) + r")"

# The scale itself isn't a score: "out of 10", "from 0 to 10", "del 1 al 10", "6/10".
SCALE = re.compile(
    rf"\b(?:out of|of|over|sobre|de)\s+(?:10|ten|diez)\b"
    rf"|\b(?:0|1|zero|one|cero|uno)\s+(?:to|through|al?)\s+(?:10|ten|diez)\b"
    rf"|\bentre\s+(?:0|1|cero|uno)\s+y\s+(?:10|diez)\b"
    rf"|/\s*10\b"
)
# A number that counts something else ("10 reps", "90 degrees", "tres días"),
# or "one" that isn't a number ("one of those days").
NOT_A_SCORE = re.compile(
    rf"\b{_NUM}\s+(?:reps?|repetitions?|repeticiones|degrees?|grados?|days?|dias?|times?|veces|"
    rf"minutes?|minutos?|seconds?|segundos?|hours?|horas?|weeks?|semanas?)\b"
    rf"|\bone\s+of\b"
)
NUMBER = re.compile(rf"\b({_NUM})(?:[.,](\d))?(\s+(?:and a half|y medio|y media))?\b")

# Conservative: "felt good" is left to the patient's tap, since "not good" is too easy to misread.
SYMPTOM_WORDS = {
    "sharp": ("sharp", "stabbing", "shooting", "agud", "punzante", "punzada"),
    "swelling": ("swell", "swollen", "puffy", "hinchad", "hinchazon", "inflamad"),
    "stiffness": ("stiff", "tight", "rigid", "tiesa", "tieso"),
    "clicking": ("click", "pop", "crack", "chasquid", "cruji", "cruje"),
}


def _plain(text: str) -> str:
    """Lowercase without accents, so "hinchazón" and "hinchazon" match alike."""
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


def parse_score(transcript: str) -> Optional[int]:
    """The pain score in an English or Spanish answer, or None. A half or a range
    rounds up to the higher number, as the Gemini prompt asks."""
    text = NOT_A_SCORE.sub(" ", SCALE.sub(" ", _plain(transcript)))
    scores = []
    for word, tenth, half in NUMBER.findall(text):
        n = int(word) if word.isdigit() else NUMBER_WORDS[word]
        scores.append(math.ceil(n + (int(tenth) / 10 if tenth else 0) + (0.5 if half else 0)))
    scores = [n for n in scores if 0 <= n <= 10]
    return on_scale(max(scores)) if scores else None


def parse_answer(transcript: str) -> PainVoiceExtract:
    text = _plain(transcript)
    return PainVoiceExtract(
        pain_score=parse_score(transcript),
        symptoms=[s for s, words in SYMPTOM_WORDS.items() if any(w in text for w in words)],
        notes=transcript.strip(),
    )

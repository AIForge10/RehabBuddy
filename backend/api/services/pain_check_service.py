"""Pain check-in: Gemini writes the coach's reply, then ElevenLabs starts voicing it.

Each step falls back so the patient always gets an answer: if Gemini is missing,
failing or slow, a template reply is used (the same one the frontend falls back
to); if ElevenLabs isn't configured, audio_url is null and the browser reads the
reply with its own speech.
"""
import asyncio
import logging
from typing import Optional

from api.core.config import settings
from api.routers.deps import get_gemini_service
from api.schemas.pain_check import PainCheckRequest, PainCheckResponse
from api.services.tts_service import tts_service

log = logging.getLogger(__name__)

GEMINI_TIMEOUT_S = 6

# Same words and threshold as fallbackPainCheck in frontend/src/api/mock.ts.
RED_FLAG_WORDS = ["sharp", "swelling", "swollen", "pop", "numb", "agudo", "hinchado", "hinchazón"]

FALLBACK_REPLIES = {
    ("en", True): "Thanks for telling me. I've let your therapist know. Rest now and skip any more exercises today.",
    ("es", True): "Gracias por decírmelo. He avisado a tu terapeuta. Descansa y no hagas más ejercicios hoy.",
    ("en", False): "Great work! A little soreness is normal. See you next session.",
    ("es", False): "¡Buen trabajo! Un poco de molestia es normal. Nos vemos en la próxima sesión.",
}


def red_flag(data: PainCheckRequest) -> Optional[str]:
    """Why the safety rule flags this check-in, or None. Runs without the AI, so a
    high score or a red-flag word is always flagged."""
    word = next((w for w in RED_FLAG_WORDS if w in data.notes.lower()), None)
    if word:
        return f"Mentioned “{word}”"
    if data.pain_score >= 7:
        return f"Pain score {data.pain_score}/10"
    return None


async def check_in(data: PainCheckRequest) -> PainCheckResponse:
    rule = red_flag(data)
    try:
        ai = await asyncio.wait_for(get_gemini_service().generate_pain_reply(data, rule), GEMINI_TIMEOUT_S)
        if not ai.reply.strip():
            raise ValueError("Gemini returned an empty reply.")
        flagged = ai.flagged or rule is not None
        reply = ai.reply.strip()
        reason = (ai.flag_reason or rule) if flagged else None
    except Exception:
        log.warning("Gemini pain-check reply failed; using the template reply", exc_info=True)
        flagged = rule is not None
        reply = FALLBACK_REPLIES[(data.language, flagged)]
        reason = rule

    clip_id = tts_service.start(reply, data.language)
    return PainCheckResponse(
        flagged=flagged,
        reply=reply,
        flag_reason=reason,
        audio_url=f"{settings.API_V1_STR}/tts/{clip_id}" if clip_id else None,
    )

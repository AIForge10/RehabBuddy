"""ElevenLabs Scribe: the patient's spoken pain check-in, as text.

The audio is passed straight through. It lives in memory for this one request
and is never written to disk or the database; only the words come back.
"""
import asyncio
import logging
from typing import Optional

from elevenlabs.client import AsyncElevenLabs
from elevenlabs.core.api_error import ApiError

from api.core.config import settings

log = logging.getLogger(__name__)

# A 15-second answer transcribes in about a second. Kept short so the whole
# request (plus Gemini's read of it) fits in the frontend's 10-second timeout.
STT_TIMEOUT_S = 6


class STTUnavailable(Exception):
    """ElevenLabs isn't configured for speech-to-text, so there's nothing to transcribe with."""


class STTFailed(Exception):
    """ElevenLabs was asked and failed or was too slow."""


class STTService:
    def __init__(self) -> None:
        self._client: Optional[AsyncElevenLabs] = None

    async def transcribe(self, audio: bytes, filename: str, content_type: str, language: str) -> str:
        """What was said in `audio`; an empty string when nothing was."""
        if not settings.ELEVENLABS_API_KEY:
            raise STTUnavailable()
        if self._client is None:
            self._client = AsyncElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
        try:
            res = await asyncio.wait_for(
                self._client.speech_to_text.convert(
                    model_id=settings.ELEVENLABS_STT_MODEL,
                    file=(filename, audio, content_type),
                    # The patient answers the question the coach just asked in
                    # this language; saying so beats detecting it from a few words.
                    language_code=language,
                    tag_audio_events=False,  # no "(sigh)" or "(laughter)" in the note
                ),
                STT_TIMEOUT_S,
            )
        except ApiError as e:
            if e.status_code in (401, 403):
                # Not a bad clip: the key can't transcribe at all (in the ElevenLabs
                # dashboard it needs the "Speech to Text" permission), so every try fails.
                log.error("The ElevenLabs API key can't use speech-to-text: %s", e.body)
                raise STTUnavailable() from e
            log.warning("ElevenLabs speech-to-text failed", exc_info=True)
            raise STTFailed() from e
        except Exception as e:
            log.warning("ElevenLabs speech-to-text failed", exc_info=True)
            raise STTFailed() from e
        return (getattr(res, "text", None) or "").strip()


stt_service = STTService()

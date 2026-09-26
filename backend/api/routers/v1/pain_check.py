from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from api.auth import CurrentUser, require_patient, require_session_owner
from api.core.config import settings
from api.schemas.pain_check import (CoachLineRequest, CoachLineResponse, PainCheckRequest, PainCheckResponse,
                                    PainVoiceResponse)
from api.services import pain_voice_service
from api.services.pain_check_service import check_in, save_check_in
from api.services.stt_service import STTFailed, STTUnavailable
from api.services.tts_service import tts_service

router = APIRouter()


@router.post(
    "",
    response_model=PainCheckResponse,
    status_code=status.HTTP_200_OK,
    summary="Coach's reply to a post-session pain check-in, with a URL that streams it as speech",
)
async def create_pain_check(
    payload: PainCheckRequest, user: CurrentUser = Depends(require_patient)
) -> PainCheckResponse:
    await run_in_threadpool(require_session_owner, payload.session_id, user)
    res = await check_in(payload)
    await run_in_threadpool(save_check_in, payload, res)
    return res


@router.post(
    "/transcribe",
    response_model=PainVoiceResponse,
    status_code=status.HTTP_200_OK,
    summary="A spoken answer to the pain check (raw audio body) → what the patient said, and the score in it",
    openapi_extra={"requestBody": {"required": True, "content": {"audio/webm": {}, "audio/mp4": {}}}},
)
async def transcribe_pain_answer(
    request: Request,
    session_id: str,
    language: Literal["en", "es"] = "en",
    user: CurrentUser = Depends(require_patient),
) -> PainVoiceResponse:
    # The recording is the raw body (MediaRecorder's own type in Content-Type),
    # not a form upload. It's never stored: the patient reviews what came back
    # and sends it with POST /pain-check, and nothing is saved until then.
    await run_in_threadpool(require_session_owner, session_id, user)
    audio, content_type, filename = await pain_voice_service.read_audio(request)
    try:
        return await pain_voice_service.answer(audio, filename, content_type, language)
    except STTUnavailable:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Speech-to-text isn't available.")
    except STTFailed:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't transcribe the recording.")


@router.post(
    "/speak",
    response_model=CoachLineResponse,
    status_code=status.HTTP_200_OK,
    summary="Voice one of the pain check's own lines (its question) in the coach's voice",
)
async def speak_coach_line(payload: CoachLineRequest, user: CurrentUser = Depends(require_patient)) -> CoachLineResponse:
    # The question is the same few words every time, so after the first patient
    # asks for it, it's replayed from tts_service's cache without spending credits.
    clip_id = tts_service.start(payload.text.strip(), payload.language)
    return CoachLineResponse(audio_url=f"{settings.API_V1_STR}/tts/{clip_id}" if clip_id else None)

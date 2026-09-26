import asyncio

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from api.services.tts_service import tts_service

router = APIRouter()

FIRST_AUDIO_TIMEOUT_S = 10


@router.get(
    "/{clip_id}",
    response_class=StreamingResponse,
    summary="Stream a line the backend is voicing (audio/mpeg), starting before it has finished generating",
)
async def stream_clip(clip_id: str) -> StreamingResponse:
    clip = tts_service.get(clip_id)
    if clip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown or expired clip.")
    # Hold the response until audio exists, so a failed synthesis is an error
    # status (the browser falls back to its own speech) rather than an empty 200.
    try:
        await asyncio.wait_for(clip.started(), FIRST_AUDIO_TIMEOUT_S)
    except TimeoutError:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Voice took too long to start.")
    if not clip.chunks:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Voice generation failed.")
    return StreamingResponse(
        clip.stream(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store", "Accept-Ranges": "none"},
    )

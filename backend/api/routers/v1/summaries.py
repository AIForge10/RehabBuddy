from fastapi import APIRouter, Depends, status
from api.schemas.summary import SessionSummaryRequest, SessionSummaryResponse
from api.services.gemini_service import GeminiService
from api.routers.deps import get_gemini_service

router = APIRouter()

@router.post(
    "/session",
    response_model=SessionSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate AI summary from rehabilitation session data",
)
async def create_session_summary(
    payload: SessionSummaryRequest,
    service: GeminiService = Depends(get_gemini_service),
) -> SessionSummaryResponse:
    return await service.generate_session_summary(payload)

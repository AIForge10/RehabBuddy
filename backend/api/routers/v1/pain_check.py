from fastapi import APIRouter, status
from api.schemas.pain_check import PainCheckRequest, PainCheckResponse
from api.services.pain_check_service import check_in

router = APIRouter()


@router.post(
    "",
    response_model=PainCheckResponse,
    status_code=status.HTTP_200_OK,
    summary="Coach's reply to a post-session pain check-in, with a URL that streams it as speech",
)
async def create_pain_check(payload: PainCheckRequest) -> PainCheckResponse:
    return await check_in(payload)

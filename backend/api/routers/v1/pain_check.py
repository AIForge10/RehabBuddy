from fastapi import APIRouter, Depends, status
from fastapi.concurrency import run_in_threadpool
from api.auth import CurrentUser, require_patient, require_session_owner
from api.schemas.pain_check import PainCheckRequest, PainCheckResponse
from api.services.pain_check_service import check_in, save_check_in

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

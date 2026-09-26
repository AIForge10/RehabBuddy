from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from api.auth import CurrentUser, require_patient_access
from api.schemas.weekly_recap import WeeklyRecapResponse
from api.services.weekly_recap_service import load_overview, weekly_recap

router = APIRouter()


@router.get(
    "/{patient_id}/weekly-recap",
    response_model=WeeklyRecapResponse,
    status_code=status.HTTP_200_OK,
    summary="The coach's recap of the patient's last 7 days, with a URL that streams it as speech",
)
async def get_weekly_recap(
    patient_id: str,
    language: Optional[Literal["en", "es"]] = None,
    user: CurrentUser = Depends(require_patient_access),
) -> WeeklyRecapResponse:
    o = await run_in_threadpool(load_overview, patient_id)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No data for patient {patient_id}")
    # The app sends its UI language; without one, the patient's own.
    if language is None:
        language = "es" if o["patient"]["language"] == "es" else "en"
    return await weekly_recap(o, language)

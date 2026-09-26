"""POST /patients/{patient_id}/plan-suggestion: the therapist's copilot proposes the next step
for a patient's plan (api/services/plan_suggestion_service.py). It only reads: approving sends
the proposed plan with PATCH /assignments/{id}, like the plan editor."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from api.auth import CurrentUser, require_therapist
from api.auth.deps import can_view_patient
from api.schemas.plan_suggestion import PlanSuggestionResponse
from api.services import plan_suggestion_service as service

router = APIRouter(tags=["ai"])


def require_patients_therapist(patient_id: str, user: CurrentUser = Depends(require_therapist)) -> CurrentUser:
    """The patient's own therapist only: a patient doesn't get suggestions about their own plan."""
    if not can_view_patient(user.id, patient_id):
        raise HTTPException(403, "You can't view this patient's data")
    return user


@router.post("/patients/{patient_id}/plan-suggestion", response_model=PlanSuggestionResponse)
async def plan_suggestion(patient_id: str, user: CurrentUser = Depends(require_patients_therapist)):
    facts = await run_in_threadpool(service.load_facts, patient_id)
    if not facts:
        raise HTTPException(404, f"No plan for patient {patient_id}")
    return await service.suggest(facts)

"""GET /patients/{id}/assignment, GET /patients/{id}/overview, GET /therapist/{id}/dashboard,
PATCH /assignments/{id}"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import CurrentUser, require_patient_access, require_therapist, require_therapist_self
from api.auth.deps import can_view_patient

from . import queries as q

router = APIRouter(tags=["patients"])


@router.get("/patients/{patient_id}/assignment")
def get_assignment(patient_id: str, user: CurrentUser = Depends(require_patient_access)):
    with q.connect() as conn:
        a = q.assignment(conn, patient_id)
    if not a:
        raise HTTPException(404, f"No assignment for patient {patient_id}")
    return a


@router.get("/patients/{patient_id}/overview")
def get_overview(patient_id: str, user: CurrentUser = Depends(require_patient_access)):
    with q.connect() as conn:
        o = q.overview(conn, patient_id)
    if not o:
        raise HTTPException(404, f"No data for patient {patient_id}")
    return o


@router.get("/therapist/{therapist_id}/dashboard")
def get_dashboard(therapist_id: str, user: CurrentUser = Depends(require_therapist_self)):
    with q.connect() as conn:
        ids = [r["patient_id"] for r in conn.execute(
            "SELECT patient_id FROM therapist_patients WHERE therapist_id = %s ORDER BY patient_id",
            (therapist_id,)).fetchall()]
        patients = [o for o in (q.overview(conn, pid) for pid in ids) if o]
    return {"therapist_id": therapist_id, "patients": patients,
            "generated_at": datetime.now(timezone.utc).isoformat()}


class UpdateAssignmentRequest(BaseModel):
    """Every field is sent, changed or not. Limits match the therapist's plan editor."""
    joint: Literal["knee", "hip", "shoulder", "elbow", "wrist"]
    target_angle: float = Field(gt=0, le=180)
    reps: int = Field(ge=1, le=30)
    times_per_week: int = Field(ge=1, le=7)


@router.patch("/assignments/{assignment_id}")
def update_assignment(assignment_id: str, body: UpdateAssignmentRequest, user: CurrentUser = Depends(require_therapist)):
    """The therapist edits a patient's plan. A new joint switches the plan to that joint's exercise."""
    with q.connect() as conn:
        a = q.assignment_by_id(conn, assignment_id)
        if not a:
            raise HTTPException(404, "Assignment not found")
        if not can_view_patient(user.id, a["patient_id"]):
            raise HTTPException(403, "You can't view this patient's data")
        ex = conn.execute("SELECT id FROM exercises WHERE joint = %s ORDER BY id LIMIT 1", (body.joint,)).fetchone()
        if not ex:
            raise HTTPException(422, f"The exercise library has no {body.joint} exercise")
        conn.execute("""UPDATE assignments SET exercise_id = %s, target_angle = %s, reps = %s, times_per_week = %s
                        WHERE id = %s""", (ex["id"], body.target_angle, body.reps, body.times_per_week, assignment_id))
        return q.assignment_by_id(conn, assignment_id)

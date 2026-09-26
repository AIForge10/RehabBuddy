"""GET /patients/{id}/assignment, GET /patients/{id}/overview, GET /therapist/{id}/dashboard"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from api.auth import CurrentUser, require_patient_access, require_therapist_self

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

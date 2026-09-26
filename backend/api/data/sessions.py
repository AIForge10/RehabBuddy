"""POST /sessions: saves a finished session + every angle sample into the hypertable.
GET /sessions/{id}/samples: reads that trace back for the therapist's replay."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import CurrentUser, get_current_user, require_patient
from api.auth.deps import can_view_patient

from . import queries as q

router = APIRouter(tags=["sessions"])


class AngleSample(BaseModel):
    time: datetime
    angle: float


class CreateSessionRequest(BaseModel):
    patient_id: str
    started_at: datetime
    reps_done: int = Field(ge=0)
    max_angle: float
    form_warnings: list[str] = []
    duration_sec: int = Field(ge=0)
    assignment_id: str | None = None
    joint: str | None = None
    angle_samples: list[AngleSample] = []


@router.post("/sessions")
def create_session(body: CreateSessionRequest, user: CurrentUser = Depends(require_patient)):
    if body.patient_id != user.id:
        raise HTTPException(403, "You can only save your own sessions")
    session_id = f"s-{uuid.uuid4()}"
    with q.connect() as conn:
        a = q.assignment(conn, user.id)
        assignment_id = body.assignment_id or (a["id"] if a else None)
        joint = body.joint or (a["exercise"]["joint"] if a else "knee")
        conn.execute(
            """INSERT INTO sessions (id, assignment_id, patient_id, joint, started_at, reps_done,
                                     max_angle, form_warnings, duration_sec)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (session_id, assignment_id, user.id, joint, body.started_at, body.reps_done,
             body.max_angle, body.form_warnings, body.duration_sec))
        if body.angle_samples:
            with conn.cursor() as cur, cur.copy("COPY angle_samples (time, session_id, angle) FROM STDIN") as cp:
                for s in body.angle_samples:
                    cp.write_row((s.time, session_id, s.angle))
    return {"session_id": session_id, "angle_samples_saved": len(body.angle_samples)}


@router.get("/sessions/{session_id}/samples")
def get_samples(session_id: str, user: CurrentUser = Depends(get_current_user)):
    with q.connect() as conn:
        s = conn.execute("SELECT patient_id, started_at FROM sessions WHERE id = %s", (session_id,)).fetchone()
        if not s:
            raise HTTPException(404, "Session not found")
        if not can_view_patient(user.id, s["patient_id"]):
            raise HTTPException(403, "You can't view this patient's data")
        return q.session_samples(conn, session_id, s["started_at"])

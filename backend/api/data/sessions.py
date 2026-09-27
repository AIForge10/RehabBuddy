"""POST /sessions saves a finished session + every angle sample into the hypertable;
GET /sessions/{id}/samples reads its trace back for the therapist's replay."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import CurrentUser, require_patient, require_session_access

from . import queries as q
from .patients import Joint

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
    joint: Joint | None = None  # a joint no screen can open would save a session nobody can see
    angle_samples: list[AngleSample] = []


@router.post("/sessions")
def create_session(body: CreateSessionRequest, user: CurrentUser = Depends(require_patient)):
    if body.patient_id != user.id:
        raise HTTPException(403, "You can only save your own sessions")
    session_id = f"s-{uuid.uuid4()}"
    with q.connect() as conn:
        # The app retries a save whose reply it didn't get (a timeout on slow wifi can
        # land after the save did). A patient starts one session at a time, so the same
        # start time is the same session: return it rather than saving it twice.
        same = conn.execute("""SELECT id, (SELECT count(*) FROM angle_samples a WHERE a.session_id = s.id) AS n
                               FROM sessions s WHERE s.patient_id = %s AND s.started_at = %s""",
                            (user.id, body.started_at)).fetchone()
        if same:
            return {"session_id": same["id"], "angle_samples_saved": same["n"]}
        a = q.assignment(conn, user.id)
        assignment_id = body.assignment_id or (a["id"] if a else None)
        # Only one of this patient's own plans: another's would link the session to
        # someone else's plan, and an unknown id would fail the foreign key (a 500).
        if assignment_id and not (a and assignment_id == a["id"]) and not conn.execute(
            "SELECT 1 FROM assignments WHERE id = %s AND patient_id = %s", (assignment_id, user.id)
        ).fetchone():
            assignment_id = a["id"] if a else None
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
def get_session_samples(session_id: str, user: CurrentUser = Depends(require_session_access)):
    """The session's angle trace, oldest first, downsampled in SQL to the replay's 10 Hz."""
    with q.connect() as conn:
        return q.session_samples(conn, session_id)

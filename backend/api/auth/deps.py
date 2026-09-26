"""FastAPI dependencies that enforce who can see what.

Usage in any router:
    @router.get("/patients/{patient_id}/overview")
    def overview(patient_id: str, user: CurrentUser = Depends(require_patient_access)): ...
"""
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import connect
from .security import decode_token

_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    role: str          # 'patient' | 'therapist'
    full_name: str
    language: str


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> CurrentUser:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(creds.credentials)
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})
    with connect() as conn:
        row = conn.execute("SELECT id, role, full_name, language FROM profiles WHERE id = %s",
                           (payload.get("sub"),)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return CurrentUser(**row)


def require_patient(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "patient":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Patients only")
    return user


def require_therapist(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "therapist":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Therapists only")
    return user


def can_view_patient(viewer_id: str, patient_id: str) -> bool:
    with connect() as conn:
        return bool(conn.execute("SELECT can_view_patient(%s, %s) AS ok",
                                 (viewer_id, patient_id)).fetchone()["ok"])


def require_patient_access(patient_id: str, user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """For /patients/{patient_id}/...: the patient themself, or their assigned therapist."""
    if not can_view_patient(user.id, patient_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't view this patient's data")
    return user


def require_therapist_self(therapist_id: str, user: CurrentUser = Depends(require_therapist)) -> CurrentUser:
    """For /therapist/{therapist_id}/...: only that therapist."""
    if user.id != therapist_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own dashboard")
    return user


def require_session_access(session_id: str, user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """For /sessions/{session_id}/...: whoever may see that session's patient (can_view_patient)."""
    with connect() as conn:
        row = conn.execute("SELECT can_view_patient(%s, patient_id) AS ok FROM sessions WHERE id = %s",
                           (user.id, session_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if not row["ok"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't view this patient's data")
    return user


def require_session_owner(session_id: str, user: CurrentUser) -> None:
    """Call inside POST /pain-check: the session must belong to the logged-in patient."""
    with connect() as conn:
        row = conn.execute("SELECT patient_id FROM sessions WHERE id = %s", (session_id,)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if user.role != "patient" or row["patient_id"] != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your session")

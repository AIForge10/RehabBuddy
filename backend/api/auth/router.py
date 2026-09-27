"""POST /auth/login, POST /auth/signup and GET /auth/me."""
import os
import re
import uuid
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .db import connect
from .deps import CurrentUser, get_current_user
from .security import create_token, hash_password, verify_password
from .otp import otp_router, start_verification   # OTP

router = APIRouter(prefix="/auth", tags=["auth"])
router.include_router(otp_router)   # OTP: /auth/verify-otp, /auth/resend-otp

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# A new patient joins this therapist's caseload, so the clinic sees their sessions
# and pain flags. Empty: no therapist, and only the patient sees their data.
SIGNUP_THERAPIST_ID = os.getenv("SIGNUP_THERAPIST_ID", "t-lee")
# Until the therapist edits it: seated knee bends, the demo's default plan.
STARTER_PLAN = {"joint": "knee", "target_angle": 90, "reps": 10, "times_per_week": 5}


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    full_name: str = Field(max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["patient", "therapist"]
    language: Literal["en", "es"] = "en"


class UserOut(BaseModel):
    id: str
    full_name: str
    role: str
    language: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    with connect() as conn:
        row = conn.execute(
            "SELECT id, full_name, role, language, password_hash, email_verified FROM profiles WHERE lower(email) = lower(%s)",
            (body.email.strip(),)).fetchone()
        if not row or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
        if not row["email_verified"]:                                              # OTP
            start_verification(conn, body.email)                                   # OTP
            conn.commit()   # keep the new code even though we raise an error      # OTP
            raise HTTPException(status.HTTP_403_FORBIDDEN, "email_not_verified")   # OTP
    user = UserOut(**{k: row[k] for k in ("id", "full_name", "role", "language")})
    return LoginResponse(access_token=create_token(user.id, user.role), user=user)


@router.post("/signup", status_code=status.HTTP_202_ACCEPTED)   # OTP: no token until the code is verified
def signup(body: SignupRequest):
    """Creates the account and signs it in. A patient starts on STARTER_PLAN."""
    name, email = body.full_name.strip(), body.email.strip().lower()
    if not name or not EMAIL_RE.match(email):
        raise HTTPException(422, "A name and a valid email are required")
    prefix = "p" if body.role == "patient" else "t"
    user = UserOut(id=f"{prefix}-{uuid.uuid4().hex[:12]}", full_name=name, role=body.role, language=body.language)
    taken = HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    try:
        with connect() as conn:
            if conn.execute("SELECT 1 FROM profiles WHERE lower(email) = %s", (email,)).fetchone():
                raise taken
            conn.execute("""INSERT INTO profiles (id, full_name, role, language, email, password_hash, email_verified)
                            VALUES (%s, %s, %s, %s, %s, %s, FALSE)""",
                         (user.id, name, user.role, user.language, email, hash_password(body.password)))
            if user.role == "patient":
                _start_plan(conn, user.id)
            start_verification(conn, email, respect_cooldown=False)   # OTP: email the code
    except psycopg.errors.UniqueViolation:  # the same email signing up twice at once
        raise taken
    return {"status": "verification_required", "email": email}   # OTP


def _start_plan(conn, patient_id: str) -> None:
    therapist = SIGNUP_THERAPIST_ID and conn.execute(
        "SELECT id FROM profiles WHERE id = %s AND role = 'therapist'", (SIGNUP_THERAPIST_ID,)).fetchone()
    therapist_id = therapist["id"] if therapist else None
    if therapist_id:
        conn.execute("""INSERT INTO therapist_patients (therapist_id, patient_id, start_date)
                        VALUES (%s, %s, CURRENT_DATE)""", (therapist_id, patient_id))
    exercise = conn.execute("SELECT id FROM exercises WHERE joint = %s ORDER BY id LIMIT 1",
                            (STARTER_PLAN["joint"],)).fetchone()
    if exercise:
        conn.execute("""INSERT INTO assignments (id, patient_id, therapist_id, exercise_id, target_angle, reps, times_per_week)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                     (f"a-{patient_id}", patient_id, therapist_id, exercise["id"], STARTER_PLAN["target_angle"],
                      STARTER_PLAN["reps"], STARTER_PLAN["times_per_week"]))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser = Depends(get_current_user)):
    return UserOut(**user.__dict__)

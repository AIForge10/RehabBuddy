"""Email one-time-code verification.

Flow:  POST /auth/signup  -> account created unverified, 6-digit code emailed  (202)
       POST /auth/verify-otp {email, code} -> account verified, logged in      (200, same body as /auth/login)
       POST /auth/resend-otp {email}      -> new code (max 1 per 60 s)        (200)
       POST /auth/login on an unverified account -> 403 "email_not_verified" + a code is sent

Security: codes are random (secrets), stored only as an HMAC hash, expire after 10 minutes,
allow 5 wrong attempts, and a new code replaces the old one.
"""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from .db import connect
from .email_sender import EmailNotConfigured, send_otp_email
from .security import create_token

CODE_TTL = timedelta(minutes=10)
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_ATTEMPTS = 5

otp_router = APIRouter()   # included into the /auth router


def otp_required() -> bool:
    """OTP_REQUIRED=true turns the email code step on. Off (the default): sign-up logs in at once,
    exactly as before OTP existed, so a server without an email provider keeps working."""
    return os.getenv("OTP_REQUIRED", "").lower() == "true"


def _pepper() -> bytes:
    return (os.getenv("JWT_SECRET") or "dev-pepper").encode()


def _hash(email: str, code: str) -> str:
    return hmac.new(_pepper(), f"{email.lower()}:{code}".encode(), hashlib.sha256).hexdigest()


def start_verification(conn, email: str, *, respect_cooldown: bool = True) -> bool:
    """Create a new code and email it. Returns False if still in the resend cooldown."""
    email = email.strip().lower()
    now = datetime.now(timezone.utc)
    if respect_cooldown:
        row = conn.execute("SELECT last_sent_at FROM email_otps WHERE email = %s", (email,)).fetchone()
        if row and now - row["last_sent_at"] < RESEND_COOLDOWN:
            return False
    code = f"{secrets.randbelow(1_000_000):06d}"
    conn.execute(
        """INSERT INTO email_otps (email, code_hash, expires_at, attempts, last_sent_at)
           VALUES (%s, %s, %s, 0, %s)
           ON CONFLICT (email) DO UPDATE
             SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
                 attempts = 0, last_sent_at = EXCLUDED.last_sent_at""",
        (email, _hash(email, code), now + CODE_TTL, now))
    try:
        send_otp_email(email, code)
    except EmailNotConfigured:
        raise HTTPException(503, "Email sending is not configured on the server")
    except Exception:  # noqa: BLE001
        raise HTTPException(502, "Couldn't send the verification email, try again in a minute")
    return True


class VerifyRequest(BaseModel):
    email: str
    code: str


class ResendRequest(BaseModel):
    email: str


def _require_otp() -> None:
    # Switched off, these routes don't exist: the database may not even have email_otps.
    if not otp_required():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")


@otp_router.post("/verify-otp")
def verify_otp(body: VerifyRequest):
    from .router import LoginResponse, UserOut   # local import avoids a circular import
    _require_otp()
    email = body.email.strip().lower()
    code = body.code.strip()
    bad = HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")
    if not (len(code) == 6 and code.isdigit()):
        raise bad
    with connect() as conn:
        row = conn.execute("SELECT code_hash, expires_at, attempts FROM email_otps WHERE email = %s",
                           (email,)).fetchone()
        if not row or row["expires_at"] < datetime.now(timezone.utc):
            raise bad
        if row["attempts"] >= MAX_ATTEMPTS:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts, request a new code")
        if not hmac.compare_digest(row["code_hash"], _hash(email, code)):
            conn.execute("UPDATE email_otps SET attempts = attempts + 1 WHERE email = %s", (email,))
            conn.commit()   # keep the failed attempt even though we raise an error
            raise bad
        conn.execute("DELETE FROM email_otps WHERE email = %s", (email,))
        user = conn.execute(
            """UPDATE profiles SET email_verified = TRUE WHERE lower(email) = %s
               RETURNING id, full_name, role, language""", (email,)).fetchone()
    if not user:
        raise bad
    u = UserOut(**user)
    return LoginResponse(access_token=create_token(u.id, u.role), user=u)


@otp_router.post("/resend-otp")
def resend_otp(body: ResendRequest):
    _require_otp()
    email = body.email.strip().lower()
    with connect() as conn:
        row = conn.execute("SELECT email_verified FROM profiles WHERE lower(email) = %s", (email,)).fetchone()
        # Same answer whether or not the account exists, so this can't be used to probe emails.
        if row and not row["email_verified"]:
            if not start_verification(conn, email):
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Please wait a minute before asking for a new code")
    return {"status": "sent_if_pending"}

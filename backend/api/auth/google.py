"""POST /auth/google: sign in (or sign up) with a Google account.

The frontend's "Sign in with Google" button hands us Google's ID token (a signed JWT).
We check its signature, audience (GOOGLE_CLIENT_ID, or GOOGLE_IOS_CLIENT_ID from the iPhone app)
and expiry with Google's library, and trust the email only if Google says it is verified, so no
OTP is needed.

Existing email -> logged in (and marked verified when OTP_REQUIRED is on). New email ->
account created with the role picked on the sign-up screen (patient by default) and no
usable password.
"""
import os
import secrets
import uuid
from typing import Literal

import psycopg
from fastapi import APIRouter, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel

from .db import connect
from .otp import otp_required
from .security import create_token, hash_password

google_router = APIRouter()   # included into the /auth router

_transport = google_requests.Request()   # caches Google's signing keys between calls


class GoogleRequest(BaseModel):
    credential: str
    role: Literal["patient", "therapist"] = "patient"
    language: Literal["en", "es"] = "en"


def _client_ids() -> list[str]:
    # The web client (the website, and the Android app, which asks Google for a token for it)
    # plus the iOS client: on iPhone the token is issued to the iOS app's own client id.
    ids = [os.getenv("GOOGLE_CLIENT_ID", ""), os.getenv("GOOGLE_IOS_CLIENT_ID", "")]
    return [i.strip() for i in ids if i.strip()]


def _verify(credential: str) -> dict:
    client_ids = _client_ids()
    if not os.getenv("GOOGLE_CLIENT_ID", "").strip():
        raise HTTPException(503, "Google sign-in is not configured on the server")
    try:
        claims = id_token.verify_oauth2_token(credential, _transport, client_ids)
    except ValueError:   # bad signature, wrong audience, expired, wrong issuer
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google sign-in")
    if not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account has no verified email")
    return claims


@google_router.post("/google")
def google_sign_in(body: GoogleRequest):
    from .router import LoginResponse, UserOut, _start_plan   # local import avoids a circular import
    claims = _verify(body.credential)
    email = claims["email"].strip().lower()
    try:
        with connect() as conn:
            # With OTP on, Google's check also verifies an account that never entered its code.
            query = ("UPDATE profiles SET email_verified = TRUE WHERE lower(email) = %s RETURNING id, full_name, role, language"
                     if otp_required() else
                     "SELECT id, full_name, role, language FROM profiles WHERE lower(email) = %s")
            row = conn.execute(query, (email,)).fetchone()
            if row:
                user = UserOut(**row)
            else:
                name = (claims.get("name") or email.split("@")[0]).strip()[:100]
                prefix = "p" if body.role == "patient" else "t"
                user = UserOut(id=f"{prefix}-{uuid.uuid4().hex[:12]}", full_name=name,
                               role=body.role, language=body.language)
                # Random password nobody knows: this account signs in with Google only.
                # email_verified is left to its column default (TRUE), so this works without the OTP migration.
                conn.execute("""INSERT INTO profiles (id, full_name, role, language, email, password_hash)
                                VALUES (%s, %s, %s, %s, %s, %s)""",
                             (user.id, name, user.role, user.language, email, hash_password(secrets.token_urlsafe(32))))
                if user.role == "patient":
                    _start_plan(conn, user.id)
    except psycopg.errors.UniqueViolation:   # the same Google account signing in twice at once
        raise HTTPException(status.HTTP_409_CONFLICT, "Please try again")
    return LoginResponse(access_token=create_token(user.id, user.role), user=user)

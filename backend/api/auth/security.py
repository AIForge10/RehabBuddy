"""Password hashing (PBKDF2-SHA256, stdlib) + JWT tokens (PyJWT)."""
import base64
import hashlib
import hmac
import os
import pathlib
import secrets
import warnings
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv

# Load the repo-root .env no matter where uvicorn is started from.
load_dotenv(pathlib.Path(__file__).resolve().parents[3] / ".env")

ALGORITHM = "HS256"
TOKEN_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "12"))
_SECRET = os.getenv("JWT_SECRET")
if not _SECRET:
    _SECRET = secrets.token_urlsafe(32)
    warnings.warn("JWT_SECRET not set in .env: using a temporary secret (logins reset on restart)")


def hash_password(password: str, iterations: int = 200_000) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(iterations))
        return hmac.compare_digest(dk, base64.b64decode(hash_b64))
    except (ValueError, TypeError):
        return False


def create_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "role": role, "iat": now, "exp": now + timedelta(hours=TOKEN_HOURS)}
    return jwt.encode(payload, _SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises jwt.InvalidTokenError if invalid or expired."""
    return jwt.decode(token, _SECRET, algorithms=[ALGORITHM])

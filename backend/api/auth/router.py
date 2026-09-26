"""POST /auth/login and GET /auth/me."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from .db import connect
from .deps import CurrentUser, get_current_user
from .security import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


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
            "SELECT id, full_name, role, language, password_hash FROM profiles WHERE lower(email) = lower(%s)",
            (body.email.strip(),)).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    user = UserOut(**{k: row[k] for k in ("id", "full_name", "role", "language")})
    return LoginResponse(access_token=create_token(user.id, user.role), user=user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser = Depends(get_current_user)):
    return UserOut(**user.__dict__)

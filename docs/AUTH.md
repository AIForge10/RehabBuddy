# Authentication & access rules

**Rule:** a patient sees only their own data. A therapist sees only the patients assigned to them
(`therapist_patients`). The rule lives in one place, the SQL function `can_view_patient(viewer, patient)`,
and the backend enforces it on every request.

## Demo accounts (password for all: `demo1234`)
| Email | Role | Sees |
|---|---|---|
| lee@bendwith.us | therapist | Maria, James, Aisha + own dashboard |
| maria@bendwith.us | patient (es) | only Maria |
| james@bendwith.us | patient | only James |
| aisha@bendwith.us | patient | only Aisha |

## Sign-up
`POST /auth/signup {full_name, email, password, role, language}` creates the account and returns the same
shape as login (201; 409 if the email is taken). A new patient joins `SIGNUP_THERAPIST_ID`'s caseload
(`.env`, default `t-lee`, empty = none) on a starter plan: seated knee bends, 10 × 90°, 5×/week.
A new therapist starts with an empty caseload.

**Email code step (optional).** With `OTP_REQUIRED=true`, sign-up answers 202 and emails a 6-digit code
instead of logging in; `POST /auth/verify-otp` then logs in, and logging in before that answers 403
`email_not_verified` (the login screen shows the code step). It needs an email provider (Resend or SMTP)
or `OTP_DEV_MODE=true`, which prints the code in the server log. Off (the default, and the live site),
the code routes answer 404 and sign-up logs in at once. Details: [OTP.md](OTP.md).

## Sign in with Google
`POST /auth/google {credential, role, language}` takes the ID token from the "Continue with Google"
button, verifies it with Google's library against `GOOGLE_CLIENT_ID`, and returns the same shape as
login. Google has already verified the email, so there is no code step. An existing email logs in; a
new one becomes an account with `role` (a patient gets the starter plan above).

- Backend `.env`: `GOOGLE_CLIENT_ID=<web OAuth client id>.apps.googleusercontent.com` (not a secret).
  Unset: the route answers 503.
- Frontend `.env`: `VITE_GOOGLE_CLIENT_ID=` the same id, needed at build time. Unset, in mock mode, or
  in the iOS/Android app (Google blocks sign-in inside app web views) the button is hidden.
- The OAuth client's "Authorized JavaScript origins" must list every site that shows the button
  (`http://localhost:5173`, `http://localhost`, `https://bendwith.us`, `https://www.bendwith.us`).

## Setup
1. `.env` (root) needs `DATABASE_URL=...` and a long random `JWT_SECRET`:
   `python -c "import secrets; print('JWT_SECRET=' + secrets.token_urlsafe(48))" >> .env`
2. `pip install -r backend/requirements.txt` (includes `pyjwt` and `google-auth`).
3. Load the database (creates login columns + `can_view_patient`):
   `python database/sample_data/load_to_tiger.py --reset`

## Backend (FastAPI): 3 lines per route
Package: `backend/api/auth/` (self-contained, imports as `from api.auth import ...`).

```python
# backend/api/main.py
from api.auth import auth_router
app.include_router(auth_router)              # /auth/login, /auth/signup, /auth/google, /auth/me (add the same prefix as other routes)

# any router
from fastapi import Depends
from api.auth import (CurrentUser, require_patient, require_patient_access,
                      require_therapist_self, require_session_access, require_session_owner)

@router.get("/patients/{patient_id}/overview")
def overview(patient_id: str, user: CurrentUser = Depends(require_patient_access)): ...

@router.get("/patients/{patient_id}/assignment")
def assignment(patient_id: str, user: CurrentUser = Depends(require_patient_access)): ...

@router.get("/therapist/{therapist_id}/dashboard")
def dashboard(therapist_id: str, user: CurrentUser = Depends(require_therapist_self)): ...

@router.get("/sessions/{session_id}/samples")    # the session's patient, or their therapist; 404 if unknown
def samples(session_id: str, user: CurrentUser = Depends(require_session_access)): ...

@router.post("/sessions")
def create_session(body: CreateSessionRequest, user: CurrentUser = Depends(require_patient)):
    if body.patient_id != user.id: raise HTTPException(403, "Not your session")
    ...

@router.post("/pain-check")
def pain_check(body: PainCheckRequest, user: CurrentUser = Depends(require_patient)):
    require_session_owner(body.session_id, user)
    ...
```

| Situation | Status |
|---|---|
| No / bad / expired token | 401 |
| Logged in but not allowed | 403 |
| Wrong email or password | 401 "Wrong email or password" |

Test: `cd backend && RUN_DB_TESTS=1 pytest tests/test_auth_access.py` (reads the demo accounts from DATABASE_URL; it only logs in and doesn't write).

## Frontend (React)
1. Login screen → `POST /auth/login {email, password}` (sign-up screen → `POST /auth/signup`) → store
   `access_token` + `user` (in memory + `sessionStorage`).
2. `client.ts` `request()`: add `Authorization: Bearer <token>` to every call.
3. Use `user.id` instead of `DEMO_PATIENT_ID` / `DEMO_THERAPIST_ID`.
4. Route by `user.role`: patient → `/` (own home), therapist → `/therapist`.
   Hide therapist routes from patients (UI only; the backend is the real guard).
5. On a 401 → clear token, go to login. On a 403 → "You don't have access to this".
6. Mock mode (`VITE_USE_MOCKS=true`) keeps working without login for offline demos.

## Pitch line
"Access control lives in the database: one rule, `can_view_patient`, decides who sees what. Patients see
only their own recovery; therapists see only their own caseload. No video is ever stored, only angles."
(A real launch would add HIPAA-eligible hosting, audit logs and MFA.)

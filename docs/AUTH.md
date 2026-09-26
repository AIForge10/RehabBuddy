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

## Setup
1. `.env` (root) needs `DATABASE_URL=...` and a long random `JWT_SECRET`:
   `python -c "import secrets; print('JWT_SECRET=' + secrets.token_urlsafe(48))" >> .env`
2. Add `pyjwt` to `requirements.in`, then `pip-compile` and `pip install -r requirements.txt`.
3. Load the database (creates login columns + `can_view_patient`):
   `python database/sample_data/load_to_tiger.py --reset`

## Backend (FastAPI): 3 lines per route
Package: `backend/api/auth/` (self-contained, imports as `from api.auth import ...`).

```python
# backend/api/main.py
from api.auth import router as auth_router
app.include_router(auth_router)              # POST /auth/login, GET /auth/me (add the same prefix as other routes)

# any router
from fastapi import Depends
from api.auth import (CurrentUser, require_patient, require_patient_access,
                      require_therapist_self, require_session_owner)

@router.get("/patients/{patient_id}/overview")
def overview(patient_id: str, user: CurrentUser = Depends(require_patient_access)): ...

@router.get("/patients/{patient_id}/assignment")
def assignment(patient_id: str, user: CurrentUser = Depends(require_patient_access)): ...

@router.get("/therapist/{therapist_id}/dashboard")
def dashboard(therapist_id: str, user: CurrentUser = Depends(require_therapist_self)): ...

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

Test: `cd backend && pytest tests/test_auth_access.py` (needs DATABASE_URL + demo data loaded).

## Frontend (React)
1. Login screen → `POST /auth/login {email, password}` → store `access_token` + `user`
   (in memory + `sessionStorage`).
2. `client.ts` `request()`: add `Authorization: Bearer <token>` to every call.
3. Use `user.id` instead of `DEMO_PATIENT_ID` / `DEMO_THERAPIST_ID`.
4. Route by `user.role`: patient → `/` (own home), therapist → `/dashboard`.
   Hide therapist routes from patients (UI only; the backend is the real guard).
5. On a 401 → clear token, go to login. On a 403 → "You don't have access to this".
6. Mock mode (`VITE_USE_MOCKS=true`) keeps working without login for offline demos.

## Pitch line
"Access control lives in the database: one rule, `can_view_patient`, decides who sees what. Patients see
only their own recovery; therapists see only their own caseload. No video is ever stored, only angles."
(A real launch would add HIPAA-eligible hosting, audit logs and MFA.)

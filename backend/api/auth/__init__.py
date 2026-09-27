"""Authentication + role-based access for RehabBuddy.

Patients see only their own data. Therapists see only the patients assigned to them
(therapist_patients). The rule lives in the database function can_view_patient().
"""
from .deps import (CurrentUser, get_current_user, require_patient, require_therapist,
                   require_patient_access, require_therapist_self, require_session_access,
                   require_session_owner)
# Exported as auth_router: re-exporting it as `router` would replace the api.auth.router module
# on this package, so `from api.auth import router` gave the APIRouter instead of the module.
from .router import router as auth_router

__all__ = ["auth_router", "CurrentUser", "get_current_user", "require_patient", "require_therapist",
           "require_patient_access", "require_therapist_self", "require_session_access", "require_session_owner"]

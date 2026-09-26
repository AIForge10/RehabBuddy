"""Authentication + role-based access for RehabBuddy.

Patients see only their own data. Therapists see only the patients assigned to them
(therapist_patients). The rule lives in the database function can_view_patient().
"""
from .deps import (CurrentUser, get_current_user, require_patient, require_therapist,
                   require_patient_access, require_therapist_self, require_session_owner)
from .router import router

__all__ = ["router", "CurrentUser", "get_current_user", "require_patient", "require_therapist",
           "require_patient_access", "require_therapist_self", "require_session_owner"]

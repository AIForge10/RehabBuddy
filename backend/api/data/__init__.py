"""Data + AI routes used by the frontend (frontend/src/api/client.ts).

Every route is protected by the auth rules in api.auth:
patients see only their own data, therapists only their assigned patients.
Include in main.py:  app.include_router(data_router, prefix=settings.API_V1_STR)
"""
from fastapi import APIRouter

from .ai_routes import router as ai_router
from .patients import router as patients_router
from .sessions import router as sessions_router

router = APIRouter()
router.include_router(patients_router)
router.include_router(sessions_router)
router.include_router(ai_router)

__all__ = ["router"]

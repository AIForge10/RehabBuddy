from fastapi import Depends
from api.auth import get_current_user
from fastapi import APIRouter
from api.routers.v1 import exercises, pain_check, summaries, tts, weekly_recap

api_router = APIRouter()

api_router.include_router(exercises.router, prefix="/exercises", tags=["exercises"])
api_router.include_router(summaries.router, prefix="/summaries", tags=["summaries"],
                          dependencies=[Depends(get_current_user)])
api_router.include_router(pain_check.router, prefix="/pain-check", tags=["voice coach"])
api_router.include_router(tts.router, prefix="/tts", tags=["voice coach"])
api_router.include_router(weekly_recap.router, prefix="/patients", tags=["voice coach"])

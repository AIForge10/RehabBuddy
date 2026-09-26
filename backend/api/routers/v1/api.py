from fastapi import APIRouter
from api.routers.v1 import exercises, pain_check, summaries, tts

api_router = APIRouter()

api_router.include_router(exercises.router, prefix="/exercises", tags=["exercises"])
api_router.include_router(summaries.router, prefix="/summaries", tags=["summaries"])
api_router.include_router(pain_check.router, prefix="/pain-check", tags=["voice coach"])
api_router.include_router(tts.router, prefix="/tts", tags=["voice coach"])

from fastapi import APIRouter
from api.routers.v1 import exercises, summaries

api_router = APIRouter()

api_router.include_router(exercises.router, prefix="/exercises", tags=["exercises"])
api_router.include_router(summaries.router, prefix="/summaries", tags=["summaries"])
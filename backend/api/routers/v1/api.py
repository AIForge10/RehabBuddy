from fastapi import APIRouter
from api.routers.v1 import exercises

api_router = APIRouter()

api_router.include_router(exercises.router, prefix="/exercises", tags=["exercises"])
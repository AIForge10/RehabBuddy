from fastapi import APIRouter, status

router = APIRouter()

@router.get("", status_code=status.HTTP_200_OK)
async def get_exercises():
    return [
        {
            "name": "Knee Hinge",
            "reps": 10
        }
    ]
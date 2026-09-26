from typing import List, Optional
from pydantic import BaseModel, Field


class ExercisePerformance(BaseModel):
    exercise_name: str
    target_reps: int
    completed_reps: int
    form_accuracy_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    user_feedback: Optional[str] = None


class SessionSummaryRequest(BaseModel):
    patient_id: Optional[str] = "guest"
    session_id: Optional[str] = None
    pain_level_pre: int = Field(..., ge=0, le=10, description="Pain score 0-10 before session")
    pain_level_post: int = Field(..., ge=0, le=10, description="Pain score 0-10 after session")
    exercises: List[ExercisePerformance]
    notes: Optional[str] = None


class SessionSummaryResponse(BaseModel):
    patient_summary: str = Field(description="Encouraging, patient-friendly summary of the session")
    clinical_observations: List[str] = Field(description="Key observations for physical therapists")
    recommendations: List[str] = Field(description="Actionable next steps or modifications")
    flagged_for_review: bool = Field(description="Whether sudden pain increase requires therapist attention")

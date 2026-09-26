from typing import Literal, Optional
from pydantic import BaseModel, Field


class PainCheckRequest(BaseModel):
    session_id: str
    pain_score: int = Field(..., ge=1, le=10, description="Pain score 1-10 after the session")
    notes: str = ""
    language: Literal["en", "es"] = "en"


class PainCheckReply(BaseModel):
    """What Gemini returns for a check-in."""
    reply: str = Field(description="One or two short sentences the coach says aloud, in the patient's language")
    flagged: bool = Field(description="Whether the therapist should review this before the next session")
    flag_reason: Optional[str] = Field(None, description="Short note for the therapist, in English; null if not flagged")


class PainCheckResponse(BaseModel):
    flagged: bool
    reply: str
    flag_reason: Optional[str] = None
    audio_url: Optional[str] = Field(
        None,
        description="Path (from the API origin) that streams `reply` as audio/mpeg; null when voice is unavailable",
    )

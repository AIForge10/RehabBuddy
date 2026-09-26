from typing import Literal, Optional
from pydantic import BaseModel, Field


class PainCheckRequest(BaseModel):
    session_id: str
    pain_score: int = Field(..., ge=1, le=10, description="Pain score 1-10 after the session")
    notes: str = ""
    language: Literal["en", "es"] = "en"
    stopped_for_pain: bool = Field(
        False, description="The patient stopped the session mid-way because it hurt; always flagged for the therapist"
    )


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


# The symptom chips on the pain-check screen, in the same order as s.painChips.
Symptom = Literal["sharp", "swelling", "stiffness", "clicking", "felt_good"]


class PainVoiceExtract(BaseModel):
    """What Gemini pulls out of the patient's spoken answer."""
    pain_score: Optional[int] = Field(
        None, description="The pain score the patient said, 1 to 10; null if they didn't say a number for it"
    )
    symptoms: list[Symptom] = Field(description="Each symptom from the list that the patient described; empty if none")
    notes: str = Field(
        description="What they said about how it feels, besides the number, as a short note in their own words and language"
    )


class PainVoiceResponse(BaseModel):
    """A spoken answer to the pain check, for the patient to review before they send it."""
    transcript: str = Field(description="What the patient said, as speech-to-text heard it; empty when they said nothing")
    pain_score: Optional[int] = Field(None, ge=1, le=10, description="null when no score was heard; the patient taps one")
    symptoms: list[Symptom] = []
    notes: str = ""


class CoachLineRequest(BaseModel):
    # Short fixed lines (the question, "tap a number"), so a cap keeps this from voicing anything longer.
    text: str = Field(..., min_length=1, max_length=200)
    language: Literal["en", "es"] = "en"


class CoachLineResponse(BaseModel):
    audio_url: Optional[str] = Field(
        None, description="Path (from the API origin) that streams the line as audio/mpeg; null when voice is unavailable"
    )

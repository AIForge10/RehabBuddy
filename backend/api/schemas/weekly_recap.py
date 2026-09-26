from dataclasses import dataclass
from typing import Literal, Optional
from pydantic import BaseModel, Field


@dataclass
class RecapFacts:
    """The patient's last 7 days: all the recap may talk about. Angles are whole degrees."""
    first_name: str
    joint: str
    exercise: str
    times_per_week: int
    target: int
    sessions_7d: int
    angles_7d: list[int]  # deepest angle of each session in the last 7 days, oldest first
    previous_angle: Optional[int]  # the session just before those 7 days, if any
    latest_angle: Optional[int]  # the most recent session ever; None before the first session
    red_flags_7d: list[str]  # pain check-ins flagged in the last 7 days, newest first


class WeeklyRecapReply(BaseModel):
    """What Gemini returns for a recap."""
    recap: str = Field(description="Two or three short sentences the coach says aloud, in the patient's language")


class WeeklyRecapResponse(BaseModel):
    text: str = Field(description="The patient's last 7 days in two or three plain sentences")
    language: Literal["en", "es"]
    audio_url: Optional[str] = Field(
        None,
        description="Path (from the API origin) that streams `text` as audio/mpeg; null when voice is unavailable",
    )
    is_fallback: bool = Field(description="true when Gemini failed or was slow and the template was used")

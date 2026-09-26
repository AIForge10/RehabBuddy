from dataclasses import dataclass, field
from typing import Literal, Optional
from pydantic import BaseModel, Field

Action = Literal["progress", "hold", "regress"]
Confidence = Literal["low", "medium", "high"]


@dataclass
class SessionFacts:
    """One recent session on the plan's joint. Angles are whole degrees."""
    date: str  # "Sep 25"
    peak: int
    reps_done: int
    rep_peaks: list[int]  # each complete rep's peak; empty without a trace
    reps_reached: Optional[int]  # reps within 2° of the target; None without a trace
    fade: Optional[int]  # first 3 reps' average peak minus the last 3's; None under 6 reps
    end_range_sec: Optional[float]
    longest_hold_sec: Optional[float]
    # From the session_angle_1m continuous aggregate: the peak and average angle
    # in each full minute of the session (the partial minute at the end is left out).
    minute_peaks: list[int]
    minute_avgs: list[int]
    form_warnings: list[str]  # codes, one per occurrence
    pain: Optional[int]
    flagged: bool


@dataclass
class PlanFacts:
    """Everything the suggestion is worked out from, by Gemini or by the rules."""
    first_name: str
    injury: Optional[str]
    rehab_day: Optional[int]
    joint: str
    exercise: str
    measure: str  # what the angle is, in English: "deepest bend", "highest raise"...
    target: float
    reps: int
    times_per_week: int
    target_min: int  # the exercise's sane range, as the therapist's plan editor allows
    target_max: int
    sessions_total: int  # every session on this joint
    sessions_7d: int
    recent: list[SessionFacts]  # the last few sessions on this joint, oldest first
    red_flags: list[str] = field(default_factory=list)  # in the window, newest first
    max_pain: Optional[int] = None  # highest pain score in the window


class PlanProposal(BaseModel):
    """What Gemini returns: the next plan, whole, with unchanged fields repeated."""
    action: Action = Field(description="progress (harder), hold (keep the plan) or regress (ease off)")
    target_angle: int = Field(description="Proposed target angle in degrees; the current one if unchanged")
    reps: int = Field(description="Proposed reps per session; the current number if unchanged")
    times_per_week: int = Field(description="Proposed sessions a week; the current number if unchanged")
    rationale: str = Field(description="One or two sentences for the therapist that cite the numbers behind the step")
    confidence: Confidence = Field(description="How clearly the data supports this step")


class PlanFields(BaseModel):
    """The editable part of an assignment, as PATCH /assignments/{id} takes it."""
    joint: str
    target_angle: float
    reps: int
    times_per_week: int


class PlanSuggestionResponse(BaseModel):
    action: Action
    current: PlanFields = Field(description="The plan the suggestion was worked out from")
    proposed: PlanFields = Field(description="The plan to send if approved; same joint, equal to `current` on hold")
    rationale: str
    confidence: Confidence
    evidence: list[str] = Field(description="Short facts from the data behind the suggestion, worked out in code")
    guardrails: list[str] = Field(description="Why the rules overrode Gemini, if they did")
    is_fallback: bool = Field(description="true when the rules wrote this suggestion, not Gemini")

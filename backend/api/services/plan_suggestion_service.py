"""Plan suggestion: the therapist's copilot proposes the next step for a patient's plan.

Gemini reads the facts (the plan, the last few sessions on its joint with each
rep's peak and each minute's peak from Tiger Data, adherence, pain and red
flags) and proposes to progress, hold or regress. The therapist decides: this
only reads, and approving sends the plan with the same PATCH /assignments/{id}
the plan editor uses.

The safety rules are here in code, not only in the prompt. A proposal that
breaks one is replaced by the rule-based suggestion, which is also what the
therapist gets when Gemini is missing, failing or slow, or there's too little
data to reason over. Every answer has the same shape; is_fallback says whether
Gemini wrote it, as the weekly summary credits Gemini only for text it wrote.
The rules are mirrored for mock mode by suggestPlan() in frontend/src/lib/plan.ts.
"""
import asyncio
import hashlib
import json
import logging
import math
from collections import OrderedDict
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from typing import Optional

from google import genai
from google.genai.types import AutomaticFunctionCallingConfig, GenerateContentConfig, ThinkingConfig

from api.core.config import settings
from api.data import queries as q
from api.prompts import plan_suggestion as prompt
from api.schemas.plan_suggestion import PlanFacts, PlanFields, PlanProposal, PlanSuggestionResponse, SessionFacts

log = logging.getLogger(__name__)

GEMINI_TIMEOUT_S = 7  # both models together: the browser gives up at 10 s and uses its own rules
PRIMARY_TIMEOUT_S = 5  # leaves the fallback model time to answer
FALLBACK_MODEL = "gemini-3.5-flash-lite"
MAX_CACHED = 200

WINDOW = 6  # the recent sessions the suggestion is worked out from
MIN_SESSIONS = 3  # fewer on this exercise is too little to change a plan on
REACHED_WITHIN = 2  # a peak this close to the target reaches it, as in frontend/src/lib/replay.ts
FADE_FLAG = 5  # as in frontend/src/lib/replay.ts
ANGLE_STEP = 5  # the plan editor's step
MAX_TARGET_STEP = 10
MAX_REPS_STEP = 5
MAX_WEEKLY_STEP = 2
RAISE_WITHIN = 5  # the target only goes up once the latest peak is this close to it
PAIN_HOLD = 6  # from here on, nothing gets harder
PAIN_EASE = 7  # the pain check's red-flag score: ease off
PAIN_PROGRESS = 4  # the most pain a progression allows
ADHERENCE_MIN = 0.6
FLAG_DAYS = 7  # a red flag this recent counts even if it came from another exercise's session
REPS = (1, 30)  # the plan editor's limits, as PATCH /assignments/{id} checks them
WEEKLY = (1, 7)

# The targets the therapist's plan editor allows: from 5° past the exercise's
# resting angle up to the top of its gauge (frontend/src/lib/exercises.ts).
TARGET_RANGE = {"knee": (5, 120), "hip": (91, 130), "shoulder": (5, 180), "elbow": (5, 150), "wrist": (20, 90)}
# The angle's name mid-sentence, as `best` in frontend/src/lib/exercises.ts. (weekly_recap_service
# has the same list, but importing it from here would be circular: it imports api.data.)
MEASURE = {"knee": "deepest bend", "elbow": "deepest bend", "hip": "highest lift", "wrist": "highest lift",
           "shoulder": "highest raise"}
STOCK_REASON = "Pain score at or above 7"  # a red flag's reason when the patient wrote nothing (queries.red_flags)

_cache: OrderedDict[str, PlanSuggestionResponse] = OrderedDict()


def _at(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def _day(iso: str) -> str:
    d = _at(iso)
    return f"{d:%b} {d.day}"


def _deg(x: float) -> int:
    """Whole degrees, rounding halves up like the frontend's Math.round (Python's round(86.5) is 86)."""
    return math.floor(x + 0.5)


def _full_minutes(minutes: list[dict]) -> list[dict]:
    """The minutes the patient spent exercising: a session rarely starts or ends on the minute,
    and the part-minute at either end is mostly sitting still."""
    if not minutes:
        return []
    most = max(m["samples"] for m in minutes)
    return [m for m in minutes if m["samples"] >= most * 0.8]


def _flag_line(f: dict) -> str:
    # The patient's own words say more than the score; the stock text for a bare high score adds nothing.
    reason = f" ({f['reason']})" if f["reason"] and f["reason"] != STOCK_REASON else ""
    return f"pain {f['pain_score']}/10 on {_day(f['created_at'])}{reason}"


def plan_facts(o: dict, minutes: dict[str, list[dict]], now: datetime) -> PlanFacts:
    """The facts from a patient overview (api/data/queries.py) and each recent session's minutes."""
    a, p = o["assignment"], o["patient"]
    joint, target = a["exercise"]["joint"], a["target_angle"]
    window = o["sessions"][:WINDOW]  # newest first
    ids = {s["id"] for s in window}
    since = now - timedelta(days=FLAG_DAYS)
    flags = sorted((f for f in o["red_flags"] if f["session_id"] in ids or _at(f["created_at"]) >= since),
                   key=lambda f: _at(f["created_at"]), reverse=True)
    recent = []
    for s in reversed(window):
        st = s.get("stats")
        peaks = st["rep_peaks"] if st else []
        full = _full_minutes(minutes.get(s["id"], []))
        recent.append(SessionFacts(
            date=_day(s["started_at"]), peak=_deg(s["max_angle"]), reps_done=s["reps_done"],
            rep_peaks=peaks, reps_reached=sum(r >= target - REACHED_WITHIN for r in peaks) if st else None,
            fade=st["fade"] if st else None,
            end_range_sec=st["end_range_sec"] if st else None,
            longest_hold_sec=st["longest_hold_sec"] if st else None,
            minute_peaks=[_deg(m["max_angle"]) for m in full], minute_avgs=[_deg(m["avg_angle"]) for m in full],
            form_warnings=s["form_warnings"], pain=s["pain_score"], flagged=s["flagged"]))
    pains = [s["pain_score"] for s in window if s["pain_score"] is not None] + [f["pain_score"] for f in flags]
    low, high = TARGET_RANGE.get(joint, TARGET_RANGE["knee"])
    return PlanFacts(
        first_name=p["full_name"].split()[0],
        injury=p["injury"],
        rehab_day=max(1, (now.date() - date.fromisoformat(p["start_date"])).days) if p["start_date"] else None,
        joint=joint,
        exercise=a["exercise"]["name"],
        measure=MEASURE.get(joint, MEASURE["knee"]),
        target=target,
        reps=a["reps"],
        times_per_week=a["times_per_week"],
        target_min=low,
        target_max=high,
        sessions_total=len(o["sessions"]),
        sessions_7d=round(o["adherence_7d"] * a["times_per_week"]),
        recent=recent,
        red_flags=[_flag_line(f) for f in flags],
        max_pain=max(pains) if pains else None,
    )


def load_facts(patient_id: str, now: Optional[datetime] = None) -> Optional[PlanFacts]:
    """Reads the patient's facts; None when they have no plan."""
    with q.connect() as conn:
        o = q.overview(conn, patient_id)
        if not o:
            return None
        minutes = q.session_minutes(conn, [s["id"] for s in o["sessions"][:WINDOW]])
    return plan_facts(o, minutes, now or datetime.now(timezone.utc))


def trend(recent: list[SessionFacts]) -> Optional[float]:
    """Degrees gained per session over the recent sessions (least squares); None under 3 sessions."""
    n = len(recent)
    if n < 3:
        return None
    mid, mean = (n - 1) / 2, sum(s.peak for s in recent) / n
    return sum((i - mid) * (s.peak - mean) for i, s in enumerate(recent)) / sum((i - mid) ** 2 for i in range(n))


def evidence(f: PlanFacts) -> list[str]:
    """A few facts behind the suggestion, for the therapist to check it against at a glance."""
    out = []
    target = _deg(f.target)
    if f.recent:
        n, first, latest = len(f.recent), f.recent[0], f.recent[-1]
        out.append(f"Peak {first.peak}° → {latest.peak}° over {n} sessions" if n > 1 else f"Peak {latest.peak}°")
        if len(latest.minute_peaks) >= 2:
            out.append(f"≥ {min(latest.minute_peaks)}° every minute last session")
        traced = [s for s in f.recent[-3:] if s.rep_peaks]
        if traced:
            reached = sum(s.reps_reached or 0 for s in traced)
            last = "last session" if len(traced) == 1 else f"last {len(traced)} sessions"
            out.append(f"{reached} of {sum(len(s.rep_peaks) for s in traced)} reps reached {target}°, {last}")
    out.append(f"{f.sessions_7d} of {f.times_per_week} sessions, past 7 days")
    if f.red_flags:
        out.append("Red flag" if len(f.red_flags) == 1 else f"{len(f.red_flags)} red flags")
    elif f.max_pain is not None:
        out.append(f"Pain ≤ {f.max_pain}/10")
    return out


def _s(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def rule_suggestion(f: PlanFacts) -> PlanSuggestionResponse:
    """The suggestion without the AI: the most cautious rule that applies wins."""
    action, changes, rationale, confidence = _rules(f)
    current = PlanFields(joint=f.joint, target_angle=f.target, reps=f.reps, times_per_week=f.times_per_week)
    return PlanSuggestionResponse(
        action=action, current=current, proposed=current.model_copy(update=changes), rationale=rationale,
        confidence=confidence, evidence=evidence(f), guardrails=[], is_fallback=True)


def _rules(f: PlanFacts) -> tuple[str, dict, str, str]:
    name, target, pain = f.first_name, _deg(f.target), f.max_pain or 0
    pain_said = f"pain at most {f.max_pain}/10" if f.max_pain is not None else "no pain reported"

    # Safety first, even on thin data: after a red flag the plan only gets easier.
    if f.red_flags or pain >= PAIN_EASE:
        why = f"{name} reported {f.red_flags[0]}" if f.red_flags else f"{name} reported pain of {pain}/10 recently"
        eased = max(f.target_min, target - ANGLE_STEP)
        if eased < target:
            return ("regress", {"target_angle": eased},
                    f"{why}. Ease the target from {target}° to {eased}° and check in before the next session.", "high")
        return "hold", {}, f"{why}. Keep the plan and check in before the next session.", "high"
    if f.sessions_total < MIN_SESSIONS:
        return ("hold", {}, f"Not enough data yet: {name} has {_s(f.sessions_total, 'session')} on this exercise. "
                f"Keep the plan and suggest again after {MIN_SESSIONS}.", "low")
    if pain >= PAIN_HOLD:
        return ("hold", {}, f"{name}'s pain reached {pain}/10 in a recent session. "
                f"Keep the plan until it's back to {PAIN_PROGRESS}/10 or below.", "medium")
    if f.sessions_7d < ADHERENCE_MIN * f.times_per_week:
        return ("hold", {}, f"{name} did {f.sessions_7d} of {f.times_per_week} planned sessions in the past 7 days. "
                "Keep the plan until the routine is steady, then review.", "medium")

    last3, latest, first = f.recent[-3:], f.recent[-1], f.recent[0]
    reached = [s for s in last3 if s.peak >= target - REACHED_WITHIN]
    if len(reached) >= 2:
        tiring = [s for s in last3 if s.fade is not None and s.fade >= FADE_FLAG]
        if len(tiring) >= 2:
            return ("hold", {}, f"{name} reaches the {target}° target, but the last 3 reps fell up to "
                    f"{max(s.fade for s in tiring)}° short of the first 3 in {len(tiring)} of the last 3 sessions. "
                    "Keep the plan until the reps stay even.", "medium")
        if pain > PAIN_PROGRESS:
            return ("hold", {}, f"{name} reaches the {target}° target, but pain reached {pain}/10 recently. "
                    f"Keep the plan until it's back to {PAIN_PROGRESS}/10 or below.", "medium")
        raised = min(f.target_max, target + ANGLE_STEP)
        if raised == target:
            return "hold", {}, f"{name} reaches the {target}° target, the top of this exercise's range. Keep the plan.", "medium"
        return ("progress", {"target_angle": raised},
                f"{name} reached the {target}° target in {len(reached)} of the last 3 sessions "
                f"({', '.join(f'{s.peak}°' for s in last3)}), with {pain_said} and {f.sessions_7d} of "
                f"{f.times_per_week} sessions in the past 7 days. Raise the target to {raised}°.", "high")

    gap = target - latest.peak
    last4 = [s.peak for s in f.recent[-4:]]
    if len(last4) == 4 and max(last4) - min(last4) <= 3 and gap > REACHED_WITHIN and pain <= PAIN_PROGRESS \
            and f.reps < REPS[1]:
        more = min(REPS[1], f.reps + 2)
        return ("progress", {"reps": more},
                f"{name}'s {f.measure} has stayed between {min(last4)}° and {max(last4)}° over the last 4 sessions, "
                f"{gap}° short of the {target}° target, with {pain_said}. "
                f"Add {more - f.reps} reps a session for more time near end range.", "medium")
    if gap <= REACHED_WITHIN:
        return ("hold", {}, f"{name} reached the {target}° target last session ({latest.peak}°), but not in the "
                "2 before it. Keep the plan one more session to confirm, then raise it.", "medium")
    t = trend(f.recent)
    if t is not None and t >= 0.5:
        k = math.ceil(gap / t)
        return ("hold", {}, f"{name}'s {f.measure} rose from {first.peak}° to {latest.peak}° over the last "
                f"{len(f.recent)} sessions (about {t:+.1f}° a session), with {pain_said}. At this rate the "
                f"{target}° target is about {_s(k, 'session')} away; keep the plan until it's reached.", "medium")
    return ("hold", {}, f"{name}'s {f.measure} was {latest.peak}° last session, {gap}° short of the {target}° target, "
            f"with no clear gain over the last {len(f.recent)} sessions. Keep the plan and review after the next few.",
            "low")


def broken_rule(p: PlanProposal, f: PlanFacts) -> Optional[str]:
    """Which safety rule Gemini's proposal breaks, or None. A hold keeps the plan, so only a change is checked."""
    if p.action == "hold":
        return None
    target, latest = _deg(f.target), f.recent[-1].peak if f.recent else None
    harder = p.target_angle > target or p.reps > f.reps or p.times_per_week > f.times_per_week
    if harder and (f.red_flags or (f.max_pain or 0) >= PAIN_HOLD):
        why = "a pain red flag" if f.red_flags else f"pain of {f.max_pain}/10"
        return f"Gemini proposed a harder plan despite {why}."
    if abs(p.target_angle - target) > MAX_TARGET_STEP:
        return f"Gemini proposed a {p.target_angle}° target, more than {MAX_TARGET_STEP}° from {target}° in one step."
    if not f.target_min <= p.target_angle <= f.target_max:
        return f"Gemini proposed a {p.target_angle}° target, outside this exercise's {f.target_min}–{f.target_max}° range."
    if p.target_angle > target and (latest is None or latest < target - RAISE_WITHIN):
        return f"Gemini proposed raising the target to {p.target_angle}° while the latest peak is {latest}°."
    if abs(p.reps - f.reps) > MAX_REPS_STEP or not REPS[0] <= p.reps <= REPS[1]:
        return f"Gemini proposed {p.reps} reps, more than {MAX_REPS_STEP} from {f.reps} or outside {REPS[0]}–{REPS[1]}."
    if abs(p.times_per_week - f.times_per_week) > MAX_WEEKLY_STEP or not WEEKLY[0] <= p.times_per_week <= WEEKLY[1]:
        return (f"Gemini proposed {p.times_per_week} sessions a week, more than {MAX_WEEKLY_STEP} from "
                f"{f.times_per_week} or outside {WEEKLY[0]}–{WEEKLY[1]}.")
    if (p.target_angle, p.reps, p.times_per_week) == (target, f.reps, f.times_per_week):
        return f"Gemini proposed to {p.action} without changing the plan."
    return None


def from_gemini(p: PlanProposal, f: PlanFacts) -> PlanSuggestionResponse:
    """Gemini's proposal, once it has passed broken_rule. The joint always stays the plan's."""
    current = PlanFields(joint=f.joint, target_angle=f.target, reps=f.reps, times_per_week=f.times_per_week)
    proposed = current if p.action == "hold" else PlanFields(
        joint=f.joint,
        # An unchanged target keeps its exact value, so the frontend sees no change.
        target_angle=f.target if p.target_angle == _deg(f.target) else float(p.target_angle),
        reps=p.reps, times_per_week=p.times_per_week)
    return PlanSuggestionResponse(
        action=p.action, current=current, proposed=proposed, rationale=p.rationale.strip(),
        confidence=p.confidence, evidence=evidence(f), guardrails=[], is_fallback=False)


@lru_cache
def _client() -> genai.Client:
    # One client for the app's lifetime, like get_gemini_service, so requests reuse its connection.
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured in backend settings.")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


async def _ask_gemini(f: PlanFacts) -> PlanProposal:
    """Gemini's proposal, from the fallback model if the first one fails. Raises on any failure."""
    cfg = GenerateContentConfig(
        system_instruction=prompt.SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=PlanProposal,
        temperature=0.2,  # the same data should get the same step
        max_output_tokens=1024,  # counts any thinking tokens too; the proposal itself is ~100
        thinking_config=ThinkingConfig(thinking_level=settings.GEMINI_THINKING_LEVEL.upper()),
        automatic_function_calling=AutomaticFunctionCallingConfig(disable=True),
    )
    contents = prompt.build_plan_suggestion_prompt(f, trend(f.recent))
    models = [settings.GEMINI_MODEL]
    if settings.GEMINI_MODEL != FALLBACK_MODEL:
        models.append(FALLBACK_MODEL)

    loop = asyncio.get_running_loop()
    deadline = loop.time() + GEMINI_TIMEOUT_S
    last_exc: Exception = ValueError("Empty response received from Gemini API.")
    for i, m in enumerate(models):
        left = deadline - loop.time()
        if left <= 0:
            break
        # A slow first model mustn't use up the time the fallback needs.
        budget = min(left, PRIMARY_TIMEOUT_S) if i < len(models) - 1 else left
        try:
            response = await asyncio.wait_for(
                _client().aio.models.generate_content(model=m, contents=contents, config=cfg), budget)
            if response.text:
                return PlanProposal.model_validate_json(response.text)
        except Exception as e:
            log.warning("Gemini model %s failed on the plan suggestion: %r", m, e)
            last_exc = e
    raise last_exc


def _cache_key(f: PlanFacts) -> str:
    # Any new session, pain check-in, flag or plan change changes the facts, and so the key.
    return hashlib.sha256(json.dumps(asdict(f), sort_keys=True).encode()).hexdigest()


async def suggest(f: PlanFacts) -> PlanSuggestionResponse:
    rules = rule_suggestion(f)
    if f.sessions_total < MIN_SESSIONS:
        # Too little for Gemini to reason over: the rules hold (or ease off after a red flag).
        return rules
    key = _cache_key(f)
    if key in _cache:
        # Asking again about the same data gets the same answer, without paying for it twice.
        _cache.move_to_end(key)
        return _cache[key]
    try:
        p = await _ask_gemini(f)
        if not p.rationale.strip():
            raise ValueError("Gemini returned an empty rationale.")
    except Exception:
        log.warning("Gemini plan suggestion failed; using the rules", exc_info=True)
        return rules
    broken = broken_rule(p, f)
    if broken:
        log.warning("Gemini's plan suggestion broke a rule: %s", broken)
        res = rules.model_copy(update={"guardrails": [f"{broken} The rule-based suggestion is shown instead."]})
    else:
        res = from_gemini(p, f)
    _cache[key] = res
    while len(_cache) > MAX_CACHED:
        _cache.popitem(last=False)
    return res

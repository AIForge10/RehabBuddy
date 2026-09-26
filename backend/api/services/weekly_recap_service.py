"""Weekly recap: Gemini sums up the patient's last 7 days, then ElevenLabs voices it.

Same fallbacks as the pain check: if Gemini is missing, failing or slow, a
template recap is used (the same one the frontend falls back to); if ElevenLabs
isn't configured, audio_url is null and the browser reads the recap.

Gemini's recaps stay in memory until something the recap depends on changes,
so reopening the home screen doesn't call Gemini again, and tts_service
replays the same text without spending ElevenLabs credits.
"""
import asyncio
import logging
import re
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from api.core.config import settings
from api.data import queries as q
from api.routers.deps import get_gemini_service
from api.schemas.weekly_recap import RecapFacts, WeeklyRecapResponse
from api.services.tts_service import tts_service

log = logging.getLogger(__name__)

GEMINI_TIMEOUT_S = 6
MAX_RECAPS = 500  # a few hundred bytes each

# The best angle's name mid-sentence, as `best` in frontend/src/lib/exercises.ts.
BEST = {
    "knee": ("deepest bend", "flexión máxima"),
    "elbow": ("deepest bend", "flexión máxima"),
    "hip": ("highest lift", "elevación máxima"),
    "wrist": ("highest lift", "elevación máxima"),
    "shoulder": ("highest raise", "elevación máxima"),
}

# Same wording as fallbackWeeklyRecap in frontend/src/api/mock.ts.
TEMPLATE = {
    "en": {
        "first": "Your first session is waiting. Once it’s done, I’ll recap your week here.",
        "none": lambda plan: f"You haven’t done any of your {plan} planned sessions in the past 7 days.",
        "done": lambda n, plan: f"You did {n} of {plan} planned sessions in the past 7 days.",
        "extra": lambda n, plan: f"You did {n} sessions in the past 7 days, more than the {plan} planned.",
        "went": lambda best, a, b: f"Your {best} went from {a}° to {b}°",
        "was": lambda best, b: f"Your {best} was {b}°",
        "last": lambda best, b: f"Your {best} last time was {b}°",
        "hit": lambda target: f", reaching your {target}° goal.",
        "gap": lambda gap, target: f", {gap}° from your {target}° goal.",
        "flag": "You reported pain after a recent session, so please talk to your therapist before your next one.",
        "restart": "A short session today is a good way to get back on track.",
        "keep": "Keep the same rhythm over the next 7 days.",
        "aim": lambda plan: f"Aim for {plan} sessions over the next 7 days to keep building.",
    },
    "es": {
        "first": "Tu primera sesión te espera. Cuando la termines, aquí te haré un resumen de tu semana.",
        "none": lambda plan: f"En los últimos 7 días no has hecho ninguna de tus {plan} sesiones previstas.",
        "done": lambda n, plan: f"Hiciste {n} de {plan} sesiones previstas en los últimos 7 días.",
        "extra": lambda n, plan: f"Hiciste {n} sesiones en los últimos 7 días, más de las {plan} previstas.",
        "went": lambda best, a, b: f"Tu {best} pasó de {a}° a {b}°",
        "was": lambda best, b: f"Tu {best} fue de {b}°",
        "last": lambda best, b: f"Tu {best} la última vez fue de {b}°",
        "hit": lambda target: f", así que alcanzaste tu meta de {target}°.",
        "gap": lambda gap, target: f", a {gap}° de tu meta de {target}°.",
        "flag": "Me contaste que sentiste dolor después de una sesión reciente, así que habla con tu terapeuta antes de la próxima.",
        "restart": "Una sesión corta hoy es una buena forma de retomar el ritmo.",
        "keep": "Mantén el mismo ritmo los próximos 7 días.",
        "aim": lambda plan: f"Intenta hacer {plan} sesiones en los próximos 7 días para seguir avanzando.",
    },
}

# After a red flag the recap has to send the patient to their therapist, so a
# Gemini recap that doesn't is swapped for the template, which always does.
MENTIONS_THERAPIST = re.compile(r"therap|terapeut", re.IGNORECASE)

_recaps: OrderedDict[tuple, str] = OrderedDict()
# Recaps Gemini is writing right now. A second request for the same recap
# (the patient's phone and laptop, say) waits for it instead of paying for another.
_writing: dict[tuple, asyncio.Task] = {}


def _at(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def load_overview(patient_id: str) -> Optional[dict]:
    with q.connect() as conn:
        return q.overview(conn, patient_id)


def recap_facts(o: dict, now: datetime) -> RecapFacts:
    """The facts from a patient overview (api/data/queries.py) that the recap is written from."""
    # The past 7 days are today and the 6 before it, as adherence_7d counts them.
    since = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    ordered = sorted(o["sessions"], key=lambda s: _at(s["started_at"]))
    recent = [s for s in ordered if _at(s["started_at"]) >= since]
    before = [s for s in ordered if _at(s["started_at"]) < since]
    flags = sorted((f for f in o["red_flags"] if _at(f["created_at"]) >= since),
                   key=lambda f: _at(f["created_at"]), reverse=True)
    a = o["assignment"]
    return RecapFacts(
        first_name=o["patient"]["full_name"].split()[0],
        joint=a["exercise"]["joint"],
        exercise=a["exercise"]["name"],
        times_per_week=a["times_per_week"],
        target=round(a["target_angle"]),
        sessions_7d=len(recent),
        angles_7d=[round(s["max_angle"]) for s in recent],
        previous_angle=round(before[-1]["max_angle"]) if before else None,
        latest_angle=round(ordered[-1]["max_angle"]) if ordered else None,
        red_flags_7d=[f"pain {f['pain_score']}/10, {f['reason']}" for f in flags],
    )


def template_recap(f: RecapFacts, language: str) -> str:
    """The recap without the AI: sessions against the plan, the trend against the target, one next step."""
    t = TEMPLATE[language]
    if f.latest_angle is None:
        return t["first"]
    n, plan, target = f.sessions_7d, f.times_per_week, f.target
    best = BEST.get(f.joint, BEST["knee"])[1 if language == "es" else 0]

    if n == 0:
        sessions = t["none"](plan)
    elif n <= plan:
        sessions = t["done"](n, plan)
    else:
        sessions = t["extra"](n, plan)

    # From the first session of the 7 days (or the one before, if there was only
    # one) to the latest. With no session in the 7 days, just the last one.
    if n == 0:
        trend, latest = t["last"](best, f.latest_angle), f.latest_angle
    else:
        start = f.angles_7d[0] if n > 1 else f.previous_angle
        latest = f.angles_7d[-1]
        trend = t["was"](best, latest) if start in (None, latest) else t["went"](best, start, latest)
    trend += t["hit"](target) if latest >= target else t["gap"](target - latest, target)

    if f.red_flags_7d:
        step = t["flag"]
    elif n == 0:
        step = t["restart"]
    elif n >= plan:
        step = t["keep"]
    else:
        step = t["aim"](plan)
    return f"{sessions} {trend} {step}"


def _cache_key(o: dict, language: str, today: date) -> tuple:
    # A new session means a new recap. So does a new red flag: a pain check-in
    # is saved just after its session, and a recap written in between would
    # keep cheering. The date keeps "the past 7 days" true days later.
    latest = max(o["sessions"], key=lambda s: _at(s["started_at"]))["id"] if o["sessions"] else None
    return (o["patient"]["id"], language, latest, len(o["red_flags"]), today)


async def _ask_gemini(key: tuple, facts: RecapFacts, language: str) -> Optional[str]:
    """Gemini's recap, cached under `key`; None when Gemini fails, is slow, or skips a red flag."""
    try:
        ai = await asyncio.wait_for(get_gemini_service().generate_weekly_recap(facts, language), GEMINI_TIMEOUT_S)
        text = ai.recap.strip()
        if not text:
            raise ValueError("Gemini returned an empty recap.")
        if facts.red_flags_7d and not MENTIONS_THERAPIST.search(text):
            raise ValueError("Gemini's recap didn't send the patient to their therapist after a red flag.")
    except Exception:
        log.warning("Gemini weekly recap failed; using the template recap", exc_info=True)
        return None
    _recaps[key] = text
    while len(_recaps) > MAX_RECAPS:
        _recaps.popitem(last=False)
    return text


async def _gemini_recap(o: dict, facts: RecapFacts, language: str, today: date) -> Optional[str]:
    """Gemini's recap, from memory when nothing has changed since it was written; None when Gemini fails."""
    key = _cache_key(o, language, today)
    if key in _recaps:
        _recaps.move_to_end(key)
        return _recaps[key]
    task = _writing.get(key)
    if task is None:
        task = _writing[key] = asyncio.create_task(_ask_gemini(key, facts, language))
        task.add_done_callback(lambda _: _writing.pop(key, None))
    # Shielded, so a patient who leaves mid-request doesn't cancel it for anyone else waiting.
    return await asyncio.shield(task)


async def weekly_recap(o: dict, language: str) -> WeeklyRecapResponse:
    now = datetime.now(timezone.utc)
    facts = recap_facts(o, now)
    if facts.latest_angle is None:
        # Before the first session there's nothing for Gemini to sum up.
        text, is_fallback = template_recap(facts, language), False
    else:
        ai = await _gemini_recap(o, facts, language, now.date())
        text, is_fallback = ai or template_recap(facts, language), ai is None

    clip_id = tts_service.start(text, language)
    return WeeklyRecapResponse(
        text=text,
        language=language,
        audio_url=f"{settings.API_V1_STR}/tts/{clip_id}" if clip_id else None,
        is_fallback=is_fallback,
    )

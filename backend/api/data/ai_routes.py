"""POST /summary, POST /translate (Gemini + template fallback).

POST /pain-check lives in api/routers/v1/pain_check.py, since its reply is voiced.
"""
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import CurrentUser, get_current_user
from api.auth.deps import can_view_patient

from . import gemini
from . import queries as q

router = APIRouter(tags=["ai"])

class SummaryRequest(BaseModel):
    patient_id: str


def _template_summary(o: dict) -> str:
    s = sorted(o["sessions"], key=lambda x: x["started_at"])
    if not s:
        return "No sessions recorded yet."
    name = o["patient"]["full_name"].split()[0]
    week = round(o["adherence_7d"] * o["assignment"]["times_per_week"])
    text = (f"{name} completed {week} of {o['assignment']['times_per_week']} planned sessions this week. "
            f"Peak flexion {s[0]['max_angle']:.0f}° → {s[-1]['max_angle']:.0f}° (target {o['assignment']['target_angle']:.0f}°).")
    if o["red_flags"]:
        f = o["red_flags"][0]
        text += f" ⚠ Reported pain {f['pain_score']}/10 ({f['reason']}); recommend a check-in call before progressing."
    else:
        text += " No concerning pain reports."
    return text


@router.post("/summary")
def summary(body: SummaryRequest, user: CurrentUser = Depends(get_current_user)):
    from fastapi import HTTPException
    if not can_view_patient(user.id, body.patient_id):
        raise HTTPException(403, "You can't view this patient's data")
    week_start = date.today() - timedelta(days=6)
    with q.connect() as conn:
        o = q.overview(conn, body.patient_id)
        if not o:
            raise HTTPException(404, "No data for this patient")
        facts = {
            "patient": o["patient"]["full_name"], "injury": o["patient"]["injury"],
            "target_angle": o["assignment"]["target_angle"], "times_per_week": o["assignment"]["times_per_week"],
            "adherence_7d": o["adherence_7d"],
            "sessions": [{k: s[k] for k in ("started_at", "reps_done", "max_angle", "form_warnings", "pain_score")}
                         for s in sorted(o["sessions"], key=lambda x: x["started_at"])[-10:]],
            "red_flags": o["red_flags"],
        }
        ai = gemini.generate(
            "Write a 3-sentence progress note for the patient's physical therapist. Mention adherence this week, "
            "the range-of-motion trend in degrees versus target, form warnings, and any pain red flags with a "
            f"recommended action. Be factual; use only this data: {facts}",
            system="You are a concise clinical assistant for physical therapists.", max_tokens=220)
        text = ai or _template_summary(o)
        conn.execute("""INSERT INTO ai_summaries (id, patient_id, week_start, summary_text, source)
                        VALUES (%s, %s, %s, %s, %s)""",
                     (f"sum-{uuid.uuid4()}", body.patient_id, week_start, text, "gemini" if ai else "template"))
    return {"summary_text": text, "week_start": week_start.isoformat(), "is_fallback": ai is None}


class TranslateRequest(BaseModel):
    text: str
    target_language: str


@router.post("/translate")
def translate(body: TranslateRequest, user: CurrentUser = Depends(get_current_user)):
    if body.target_language == "en":
        return {"text": body.text}
    lang = {"es": "Spanish"}.get(body.target_language, body.target_language)
    ai = gemini.generate(f"Translate to {lang}. Return only the translation, nothing else:\n{body.text}",
                         max_tokens=200)
    return {"text": ai or body.text}

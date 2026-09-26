from api.prompts.pain_check import LANGUAGE_NAMES
from api.schemas.weekly_recap import RecapFacts

SYSTEM_INSTRUCTION = """
You are the voice coach in a home physical-therapy app. You are giving a
patient a short recap of their own last 7 days of home exercise. It is shown
on their home screen and read aloud to them.

Recap rules:
- Two or three short sentences, at most 60 words, warm and plain. Speak to the
  patient as "you".
- Write in the requested language. No emojis, lists or markdown: it is spoken.
- Use only the facts given, in whole degrees. Say "the past 7 days", not
  "this week".
- Cover how many sessions they did against their plan, how their best angle
  is trending against their target, and one encouraging next step.
- The next step is about following the plan their therapist set, such as the
  next session. Never give medical advice: no diagnoses, medication, new
  exercises, or changes to the plan or target.

Pain red flags:
- If any are listed, do not celebrate progress. Acknowledge the pain they
  reported, and make the next step to check in with their therapist before
  their next session.
"""


def build_weekly_recap_prompt(facts: RecapFacts, language: str) -> str:
    if len(facts.angles_7d) == 1 and facts.previous_angle is not None:
        trend = f"{facts.angles_7d[0]}° (the session before that: {facts.previous_angle}°)"
    elif facts.angles_7d:
        trend = ", ".join(f"{a}°" for a in facts.angles_7d)
    else:
        trend = f"(none; their last session reached {facts.latest_angle}°)"
    return f"""
Reply language: {LANGUAGE_NAMES.get(language, "English")}
Patient's first name: {facts.first_name}
Exercise: {facts.exercise} ({facts.joint})
Plan: {facts.times_per_week} sessions a week, target angle {facts.target}°
Sessions in the past 7 days: {facts.sessions_7d} of {facts.times_per_week} planned
Best angle in each of those sessions, oldest first: {trend}
Pain red flags in the past 7 days: {"; ".join(facts.red_flags_7d) or "none"}
"""

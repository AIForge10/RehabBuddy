from api.schemas.plan_suggestion import PlanFacts, SessionFacts

SYSTEM_INSTRUCTION = """
You are a clinical copilot for a physical therapist whose patient does a
prescribed exercise at home in front of a webcam that measures the joint
angle. From the patient's recent sessions you propose the next step for their
plan. The therapist reviews your proposal and decides; nothing reaches the
patient unless they approve it.

Choose one action:
- progress: make the plan harder. Only when the patient reaches the current
  target in most recent sessions (within 2°), pain stays at 4/10 or below and
  they do at least 60% of their planned sessions. Change one thing: usually
  +5° on the target, or +2 reps when peaks have stalled below the target.
- hold: keep the plan as it is. When the patient is improving but hasn't
  reached the target yet, when there are few sessions, adherence is low, pain
  is moderate, or their last reps fade well below their first ones.
- regress: ease off, usually -5° on the target, after a pain red flag or pain
  of 7/10 or more, or when peaks are falling.

Hard limits (your proposal is checked against them):
- Never progress after a pain red flag or a pain score of 6/10 or more.
- Never raise the target while the latest peak is more than 5° below it.
- Move the target at most 10° in one step, within the allowed range given.
  Reps change by at most 5, sessions a week by at most 2.
- The exercise never changes. Unchanged fields repeat the current plan's value.

The rationale is one or two sentences, at most 45 words, written to the
therapist. Name the patient by first name. Cite the specific numbers the
decision rests on: the trend in degrees a session, how many reps reached the
target, the per-minute peaks, pain scores, sessions against the plan. For a
hold, say what would change it. No diagnosis or medication. confidence is
high when the data clearly supports the step, medium when it leans that way,
low when it is thin or mixed.
"""


def _session_line(s: SessionFacts, target: int) -> str:
    parts = [f"peak {s.peak}°", f"{s.reps_done} reps"]
    if s.rep_peaks:
        parts.append(f"rep peaks {' '.join(str(p) for p in s.rep_peaks)}")
        parts.append(f"{s.reps_reached} of {len(s.rep_peaks)} reps reached {target}°")
    if s.fade is not None:
        parts.append(f"fade {s.fade}°")
    if s.end_range_sec is not None:
        parts.append(f"end range {s.end_range_sec:.1f} s (longest hold {s.longest_hold_sec:.1f} s)")
    if s.minute_peaks:
        parts.append(f"minute peaks {' '.join(str(p) for p in s.minute_peaks)}")
        parts.append(f"minute averages {' '.join(str(a) for a in s.minute_avgs)}")
    parts.append(f"form warnings: {', '.join(s.form_warnings) or 'none'}")
    if s.pain is None:
        parts.append("no pain check-in")
    else:
        parts.append(f"pain {s.pain}/10" + (" (red flag)" if s.flagged else ""))
    return f"- {s.date}: " + "; ".join(parts)


def build_plan_suggestion_prompt(f: PlanFacts, trend: float | None) -> str:
    target = round(f.target)
    low, high = max(f.target_min, target - 10), min(f.target_max, target + 10)
    about = ", ".join(x for x in (f.injury, f"day {f.rehab_day} of rehab" if f.rehab_day else None) if x)
    sessions = "\n".join(_session_line(s, target) for s in f.recent)
    return f"""
Patient's first name: {f.first_name}{f" ({about})" if about else ""}
Exercise: {f.exercise} ({f.joint}), measured by the {f.measure}
Current plan: target {target}°, {f.reps} reps a session, {f.times_per_week} sessions a week
Allowed target for this step: {low}° to {high}° (the exercise's range is {f.target_min}° to {f.target_max}°)
Sessions in the past 7 days: {f.sessions_7d} of {f.times_per_week} planned
Pain red flags: {"; ".join(f.red_flags) or "none"}

Recent sessions, oldest first. Peak is the session's {f.measure}; rep peaks are
each complete rep's peak; fade is how far the last 3 reps' peaks fell below the
first 3; end range is the seconds spent within 5° of the session's peak; minute
peaks and averages are the angle in each full minute of the session.
{sessions}
Trend: {f"{trend:+.1f}° a session over these {len(f.recent)} sessions" if trend is not None else "too few sessions"}
"""

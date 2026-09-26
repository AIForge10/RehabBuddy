"""SQL used by the routes. Shapes match frontend/src/types/session.ts."""
from api.auth.db import connect


def _f(x):
    return float(x) if x is not None else None


def assignment(conn, patient_id: str) -> dict | None:
    row = conn.execute(
        """SELECT a.id, a.patient_id, a.therapist_id, a.target_angle, a.reps, a.times_per_week,
                  e.id AS ex_id, e.name AS ex_name, e.joint AS ex_joint, e.instructions AS ex_instructions
           FROM assignments a JOIN exercises e ON e.id = a.exercise_id
           WHERE a.patient_id = %s ORDER BY a.id LIMIT 1""", (patient_id,)).fetchone()
    if not row:
        return None
    return {
        "id": row["id"], "patient_id": row["patient_id"], "therapist_id": row["therapist_id"],
        "exercise": {"id": row["ex_id"], "name": row["ex_name"], "joint": row["ex_joint"],
                     "instructions": row["ex_instructions"]},
        "target_angle": _f(row["target_angle"]), "reps": row["reps"], "times_per_week": row["times_per_week"],
    }


def patient(conn, patient_id: str) -> dict | None:
    row = conn.execute(
        """SELECT p.id, p.full_name, p.language, tp.injury, tp.start_date
           FROM profiles p LEFT JOIN therapist_patients tp ON tp.patient_id = p.id
           WHERE p.id = %s AND p.role = 'patient' LIMIT 1""", (patient_id,)).fetchone()
    if not row:
        return None
    return {"id": row["id"], "full_name": row["full_name"], "language": row["language"],
            "injury": row["injury"], "start_date": row["start_date"].isoformat() if row["start_date"] else None}


def sessions(conn, patient_id: str) -> list[dict]:
    rows = conn.execute(
        """SELECT s.id, s.patient_id, s.started_at, s.reps_done, s.max_angle, s.form_warnings, s.duration_sec,
                  pc.pain_score, COALESCE(pc.flagged, false) AS flagged
           FROM sessions s
           LEFT JOIN LATERAL (SELECT pain_score, flagged FROM pain_checkins
                              WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) pc ON true
           WHERE s.patient_id = %s ORDER BY s.started_at DESC""", (patient_id,)).fetchall()
    return [{**r, "started_at": r["started_at"].isoformat(), "max_angle": _f(r["max_angle"]),
             "form_warnings": list(r["form_warnings"] or [])} for r in rows]


def red_flags(conn, patient_id: str) -> list[dict]:
    rows = conn.execute(
        """SELECT pc.session_id, s.patient_id, pc.created_at, pc.pain_score, pc.notes
           FROM pain_checkins pc JOIN sessions s ON s.id = pc.session_id
           WHERE s.patient_id = %s AND pc.flagged ORDER BY pc.created_at DESC""", (patient_id,)).fetchall()
    return [{"session_id": r["session_id"], "patient_id": r["patient_id"],
             "created_at": r["created_at"].isoformat(), "pain_score": r["pain_score"],
             "reason": f"“{r['notes']}”" if r["notes"] else "Pain score at or above 7"} for r in rows]


def adherence_7d(conn, patient_id: str, times_per_week: int) -> float:
    n = conn.execute(
        """SELECT count(*) AS n FROM sessions
           WHERE patient_id = %s AND started_at >= date_trunc('day', now()) - interval '6 days'""",
        (patient_id,)).fetchone()["n"]
    return round(n / times_per_week, 2) if times_per_week else 0.0


def latest_summary(conn, patient_id: str) -> str | None:
    row = conn.execute("""SELECT summary_text FROM ai_summaries WHERE patient_id = %s
                          ORDER BY week_start DESC, id DESC LIMIT 1""", (patient_id,)).fetchone()
    return row["summary_text"] if row else None


# ★ Tiger Data: reading the angle_samples hypertable back.
# A session's trace at the replay's resolution. The live screen samples its trace every
# 100 ms, and the replay (frontend/src/lib/replay.ts) spots half-second stalls and breaks
# its line at one-second gaps, so 10 Hz keeps all of that while a 30 fps session comes
# back with a third of the rows. The stats below read this same trace, so the numbers on
# the dashboard match what the replay draws.
TRACE = """SELECT session_id, time_bucket('100 milliseconds', time) AS time, round(avg(angle), 1) AS angle
           FROM angle_samples WHERE session_id = ANY(%(ids)s) GROUP BY 1, 2"""


def session_samples(conn, session_id: str) -> list[dict]:
    rows = conn.execute(f"SELECT time, angle FROM ({TRACE}) trace ORDER BY time",
                        {"ids": [session_id]}).fetchall()
    return [{"time": r["time"].isoformat(), "angle": float(r["angle"])} for r in rows]


# Per-session numbers a therapist can act on, worked out over every sample in SQL so the
# dashboard never has to download a trace:
#   rep_peaks         each complete rep's peak, found with the replay's thresholds: a rep
#                     starts once the reading passes halfway from rest to the target (or to
#                     the session's peak, if lower) and ends when it drops back into the
#                     bottom sixth, rest being the session's 10th-percentile reading.
#                     Uneven peaks or a slide in the later reps shows up here.
#   fade              first 3 reps' average peak minus the last 3's (6+ reps): tiring out.
#   end_range_sec     seconds within 5° of the session's deepest bend. Time held at end
#                     range is what regains motion after surgery, which one peak frame can't show.
#   longest_hold_sec  the longest unbroken stretch of it.
# A gap of more than a second is the tracker losing the patient: it counts as no time and
# ends a hold. Mirrored for mock mode by sessionStats() in frontend/src/lib/replay.ts.
SESSION_STATS = f"""
WITH trace AS ({TRACE}),
levels AS (
  SELECT session_id, max(angle) AS peak,
         (array_agg(angle ORDER BY angle))[floor(count(*) * 0.1)::int + 1] AS rest
  FROM trace GROUP BY session_id
),
marked AS (
  SELECT t.session_id, t.time, t.angle, l.peak,
         l.rest + (greatest(l.rest + 15, least(%(target)s::numeric, l.peak)) - l.rest) / 2 AS bent,
         l.rest + (greatest(l.rest + 15, least(%(target)s::numeric, l.peak)) - l.rest) / 6 AS straight,
         CASE WHEN lead(t.time) OVER w - t.time <= interval '1 second'
              THEN extract(epoch FROM lead(t.time) OVER w - t.time) ELSE 0 END AS dt,
         coalesce(t.time - lag(t.time) OVER w > interval '1 second', false) AS after_gap
  FROM trace t JOIN levels l USING (session_id)
  WINDOW w AS (PARTITION BY t.session_id ORDER BY t.time)
),
runs AS (
  -- Every reading back near rest opens a new excursion; one that got past halfway is a rep.
  -- Every reading out of end range (or after a gap) ends a hold.
  SELECT *, count(*) FILTER (WHERE angle < straight) OVER w AS excursion,
            count(*) FILTER (WHERE angle < peak - 5 OR after_gap) OVER w AS hold
  FROM marked
  WINDOW w AS (PARTITION BY session_id ORDER BY time)
),
excursions AS (
  SELECT session_id, min(time) AS start, max(angle) AS peak, max(bent) AS bent,
         -- Still bent when the session ended: the live counter didn't count it either.
         excursion = max(excursion) OVER (PARTITION BY session_id) AS unfinished
  FROM runs GROUP BY session_id, excursion
),
reps AS (
  SELECT session_id, round(peak)::int AS peak,
         row_number() OVER (PARTITION BY session_id ORDER BY start) AS n,
         count(*) OVER (PARTITION BY session_id) AS total
  FROM excursions WHERE peak > bent AND NOT unfinished
),
rep_stats AS (
  SELECT session_id, array_agg(peak ORDER BY n) AS rep_peaks,
         CASE WHEN max(total) >= 6 THEN round(avg(peak) FILTER (WHERE n <= 3)
                                              - avg(peak) FILTER (WHERE n > total - 3))::int END AS fade
  FROM reps GROUP BY session_id
),
holds AS (
  SELECT session_id, sum(dt) AS sec FROM runs WHERE angle >= peak - 5 GROUP BY session_id, hold
),
end_range AS (
  SELECT session_id, round(sum(sec), 1)::float AS end_range_sec, round(max(sec), 1)::float AS longest_hold_sec
  FROM holds GROUP BY session_id
)
SELECT l.session_id, r.rep_peaks, r.fade, e.end_range_sec, e.longest_hold_sec
FROM levels l LEFT JOIN rep_stats r USING (session_id) LEFT JOIN end_range e USING (session_id)"""


# POST /sessions writes a session and its samples in one transaction and nothing changes them
# afterwards, so each session's numbers are worked out once per target and kept. The dashboard
# polls every few seconds; without this it would re-read every sample of every session each time.
_stats_cache: dict[tuple[str, float], dict | None] = {}


def session_stats(conn, session_ids: list[str], target: float) -> dict[str, dict | None]:
    """{session_id: stats, or None when it has no angle samples}; `target` sets the rep thresholds."""
    missing = [sid for sid in session_ids if (sid, target) not in _stats_cache]
    if missing:
        rows = conn.execute(SESSION_STATS, {"ids": missing, "target": target}).fetchall()
        found = {r["session_id"]: {"rep_peaks": list(r["rep_peaks"] or []), "fade": r["fade"],
                                   "end_range_sec": r["end_range_sec"] or 0.0,
                                   "longest_hold_sec": r["longest_hold_sec"] or 0.0} for r in rows}
        if len(_stats_cache) > 10_000:
            _stats_cache.clear()
        _stats_cache.update({(sid, target): found.get(sid) for sid in missing})
    return {sid: _stats_cache[(sid, target)] for sid in session_ids}


def overview(conn, patient_id: str) -> dict | None:
    p = patient(conn, patient_id)
    a = assignment(conn, patient_id)
    if not p or not a:
        return None
    ss = sessions(conn, patient_id)
    stats = session_stats(conn, [s["id"] for s in ss], a["target_angle"])
    for s in ss:
        s["stats"] = stats[s["id"]]
    return {"patient": p, "assignment": a,
            "adherence_7d": adherence_7d(conn, patient_id, a["times_per_week"]),
            "sessions": ss, "red_flags": red_flags(conn, patient_id),
            "latest_summary": latest_summary(conn, patient_id)}


__all__ = ["connect", "assignment", "patient", "sessions", "red_flags", "overview", "latest_summary",
           "session_samples", "session_stats"]

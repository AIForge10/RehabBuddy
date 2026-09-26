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
# back with a third of the rows.
TRACE = """SELECT session_id, time_bucket('100 milliseconds', time) AS time, round(avg(angle), 1) AS angle
           FROM angle_samples WHERE session_id = ANY(%(ids)s) GROUP BY 1, 2"""


def session_samples(conn, session_id: str) -> list[dict]:
    rows = conn.execute(f"SELECT time, angle FROM ({TRACE}) trace ORDER BY time",
                        {"ids": [session_id]}).fetchall()
    return [{"time": r["time"].isoformat(), "angle": float(r["angle"])} for r in rows]


def overview(conn, patient_id: str) -> dict | None:
    p = patient(conn, patient_id)
    a = assignment(conn, patient_id)
    if not p or not a:
        return None
    return {"patient": p, "assignment": a,
            "adherence_7d": adherence_7d(conn, patient_id, a["times_per_week"]),
            "sessions": sessions(conn, patient_id), "red_flags": red_flags(conn, patient_id),
            "latest_summary": latest_summary(conn, patient_id)}


__all__ = ["connect", "assignment", "patient", "sessions", "red_flags", "overview", "latest_summary",
           "session_samples"]

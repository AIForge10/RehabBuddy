"""Generate RehabBuddy sample data: DB table CSVs + API request/response examples.
Shapes match frontend/src/api/client.ts + mock.ts so backend == frontend."""
import base64, csv, hashlib, json, math, random, os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

random.seed(42)
DEMO_PASSWORD = "demo1234"   # demo accounts only — change for anything real


def hash_password(pw: str, salt: bytes, iterations: int = 200_000) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


OUT = "sample_data"
os.makedirs(f"{OUT}/tables", exist_ok=True)
NOW = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)
TODAY = NOW.replace(hour=0, minute=0)
iso = lambda d: d.isoformat().replace("+00:00", "Z")

therapist = {"id": "t-lee", "full_name": "Dr. Sarah Lee", "role": "therapist", "language": "en",
             "email": "lee@bendwith.us", "password_hash": hash_password(DEMO_PASSWORD, b"t-lee-demo-salt!")}
patients = [
    {"id": "p-maria", "full_name": "Maria Lopez",  "language": "es", "injury": "ACL reconstruction",  "start_days": 10, "skip": [6, 3],          "from": 72, "to": 86},
    {"id": "p-james", "full_name": "James Carter", "language": "en", "injury": "Grade II MCL sprain", "start_days": 8,  "skip": [7, 6, 5, 3, 2], "from": 70, "to": 79},
    {"id": "p-aisha", "full_name": "Aisha Khan",   "language": "en", "injury": "Meniscus repair",     "start_days": 9,  "skip": [5, 2],          "from": 74, "to": 88},
]
exercises = [
    {"id": "ex-knee-bend",      "name": "Seated knee bends",   "joint": "knee",     "instructions": "Sit tall at the edge of a chair, side-on to the camera. Slowly bend your knee as far as is comfortable, then straighten it fully."},
    {"id": "ex-hip-flexion",    "name": "Standing hip flexion","joint": "hip",      "instructions": "Stand side-on, hold a chair for balance, lift your knee towards your chest, then lower it."},
    {"id": "ex-elbow-flexion",  "name": "Elbow curls",         "joint": "elbow",    "instructions": "Sit side-on with your arm straight down, curl your forearm up, then lower it slowly."},
    {"id": "ex-shoulder-abduct","name": "Shoulder raises",     "joint": "shoulder", "instructions": "Face the camera, arm at your side, raise it out sideways to shoulder height, then lower it."},
]

rows = {k: [] for k in ["profiles", "therapist_patients", "exercises", "assignments", "sessions",
                        "angle_samples", "pain_checkins", "ai_summaries"]}
rows["profiles"].append(therapist)
rows["exercises"] = exercises

sessions_by_patient, flags_by_patient, assignments = {}, {}, {}
for p in patients:
    email = p["full_name"].split()[0].lower() + "@bendwith.us"
    rows["profiles"].append({"id": p["id"], "full_name": p["full_name"], "role": "patient", "language": p["language"],
                             "email": email, "password_hash": hash_password(DEMO_PASSWORD, (p["id"] + "-demo-salt!").encode()[:16])})
    start = TODAY - timedelta(days=p["start_days"])
    rows["therapist_patients"].append({"therapist_id": "t-lee", "patient_id": p["id"], "injury": p["injury"], "start_date": start.date().isoformat()})
    a = {"id": f"a-{p['id']}", "patient_id": p["id"], "therapist_id": "t-lee", "exercise_id": "ex-knee-bend",
         "target_angle": 90, "reps": 10, "times_per_week": 5}
    rows["assignments"].append(a); assignments[p["id"]] = a
    sessions_by_patient[p["id"]], flags_by_patient[p["id"]] = [], []

    days = p["start_days"]
    for d in range(days, 0, -1):
        if d in p["skip"]:
            continue
        progress = (days - d) / (days - 1)
        started = TODAY - timedelta(days=d) + timedelta(hours=17 + random.randint(0, 2), minutes=random.randint(0, 59))
        max_angle = round(p["from"] + (p["to"] - p["from"]) * progress + random.uniform(-1.5, 1.5), 1)
        reps = 8 if random.random() < 0.2 else 10
        warnings = ["not_deep_enough"] if max_angle < 80 and random.random() < 0.6 else []
        if random.random() < 0.2: warnings.append("too_fast")
        duration = 180 + random.randint(0, 120)
        sid = f"s-{p['id']}-{d}"
        s = {"id": sid, "assignment_id": a["id"], "patient_id": p["id"], "joint": "knee", "started_at": iso(started),
             "reps_done": reps, "max_angle": max_angle, "form_warnings": warnings, "duration_sec": duration}
        rows["sessions"].append(s)

        # angle samples @ 2 Hz: reps spread through the session, rest ~3-6° between reps
        rep_len, t = 4.0, 0.0
        rep_starts = [5 + i * (duration - 20) / reps for i in range(reps)]
        while t <= duration:
            ang = 3 + random.uniform(0, 3)
            for rs in rep_starts:
                if rs <= t <= rs + rep_len:
                    peak = max_angle - random.uniform(0, 6)
                    ang = max(ang, peak * math.sin(math.pi * (t - rs) / rep_len))
            rows["angle_samples"].append({"time": iso(started + timedelta(seconds=t)), "session_id": sid, "angle": round(ang, 1)})
            t += 0.5

        pain = 2 + random.randint(0, 2)
        notes, flagged = "", False
        if p["id"] == "p-james" and d == min(x for x in range(1, days + 1) if x not in p["skip"]):
            pain, notes, flagged = 8, "Sharp, on the inside of the knee.", True
        pc = {"id": f"pc-{sid}", "session_id": sid, "pain_score": pain, "notes": notes, "flagged": flagged,
              "created_at": iso(started + timedelta(seconds=duration + 30))}
        rows["pain_checkins"].append(pc)
        rec = {**{k: s[k] for k in ["id", "patient_id", "started_at", "reps_done", "max_angle", "form_warnings", "duration_sec"]},
               "pain_score": pain, "flagged": flagged}
        sessions_by_patient[p["id"]].append(rec)
        if flagged:
            flags_by_patient[p["id"]].append({"session_id": sid, "patient_id": p["id"], "created_at": pc["created_at"],
                                              "pain_score": pain, "reason": f"“{notes}”"})

summaries = {}
week_cut = iso(TODAY - timedelta(days=6))
for p in patients:
    ss = sorted(sessions_by_patient[p["id"]], key=lambda x: x["started_at"])
    first, last = ss[0]["max_angle"], ss[-1]["max_angle"]
    week = len([x for x in ss if x["started_at"] >= week_cut])
    name = p["full_name"].split()[0]
    text = (f"{name} completed {week} of 5 planned sessions this week"
            + (", below plan." if week < 4 else ".")
            + f" Peak knee flexion improved from {first:.0f}° to {last:.0f}° (target 90°).")
    if flags_by_patient[p["id"]]:
        f = flags_by_patient[p["id"]][-1]
        text += f" ⚠ Reported pain {f['pain_score']}/10 after the latest session ({f['reason']}) — recommend a check-in call before progressing."
    else:
        text += " No concerning pain reports; consider progressing the target."
    summaries[p["id"]] = text
for pid, text in summaries.items():
    rows["ai_summaries"].append({"id": f"sum-{pid}", "patient_id": pid, "week_start": (TODAY - timedelta(days=6)).date().isoformat(), "summary_text": text})

# ---- write table CSVs ----
for name, data in rows.items():
    with open(f"{OUT}/tables/{name}.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(data[0].keys()))
        w.writeheader()
        for r in data:
            w.writerow({k: ("{" + ",".join(v) + "}" if isinstance(v, list) else v) for k, v in r.items()})

# ---- API examples ----
def patient_obj(p):
    return {"id": p["id"], "full_name": p["full_name"], "language": p["language"], "injury": p["injury"],
            "start_date": iso(TODAY - timedelta(days=p["start_days"]))}
ex_by_id = {e["id"]: e for e in exercises}
def assignment_obj(pid):
    a = assignments[pid]
    return {"id": a["id"], "patient_id": pid, "therapist_id": "t-lee", "exercise": ex_by_id[a["exercise_id"]],
            "target_angle": a["target_angle"], "reps": a["reps"], "times_per_week": a["times_per_week"]}
samples_by_session = {}
for r in rows["angle_samples"]:
    samples_by_session.setdefault(r["session_id"], []).append(r)

def session_stats(samples, target):
    """The stats the overview adds to each session, worked out like SESSION_STATS in
    backend/api/data/queries.py. These samples are 2 Hz, so its 10 Hz buckets leave them as they are."""
    half_up = lambda x: math.floor(x + Decimal("0.5"))  # like Postgres round(), unlike Python's
    pts = [(datetime.fromisoformat(r["time"]), Decimal(str(r["angle"]))) for r in samples]
    ordered = sorted(a for _, a in pts)
    rest, peak = ordered[int(len(ordered) * 0.1)], ordered[-1]
    top = max(rest + 15, min(Decimal(target), peak))
    bent, straight = rest + (top - rest) / 2, rest + (top - rest) / 6
    peaks, rep = [], None
    for _, a in pts:
        if rep is not None:
            rep = max(rep, a)
            if a < straight:
                peaks.append(half_up(rep))
                rep = None
        elif a > bent:
            rep = a
    fade = half_up(Decimal(sum(peaks[:3]) - sum(peaks[-3:])) / 3) if len(peaks) >= 6 else None
    total = longest = hold = Decimal(0)
    for i, (t, a) in enumerate(pts):
        if a < peak - 5 or (i and (t - pts[i - 1][0]).total_seconds() > 1):
            hold = Decimal(0)
        if a >= peak - 5:
            step = Decimal(str((pts[i + 1][0] - t).total_seconds())) if i + 1 < len(pts) else Decimal(0)
            hold += step if step <= 1 else 0
            total += step if step <= 1 else 0
            longest = max(longest, hold)
    return {"rep_peaks": peaks, "fade": fade, "end_range_sec": float(half_up(total * 10) / 10),
            "longest_hold_sec": float(half_up(longest * 10) / 10)}

def overview(p):
    target = assignments[p["id"]]["target_angle"]
    ss = [{**s, "stats": session_stats(samples_by_session[s["id"]], target)}
          for s in sorted(sessions_by_patient[p["id"]], key=lambda s: s["started_at"], reverse=True)]
    week = [s for s in ss if s["started_at"] >= iso(TODAY - timedelta(days=6))]
    return {"patient": patient_obj(p), "assignment": assignment_obj(p["id"]),
            "adherence_7d": round(len(week) / 5, 2), "sessions": ss,
            "red_flags": flags_by_patient[p["id"]], "latest_summary": summaries[p["id"]]}

maria = patients[0]
sample_samples = [r for r in rows["angle_samples"] if r["session_id"] == f"s-p-maria-1"][:12]
api = {
    "POST /auth/login": {
        "request": {"email": "maria@bendwith.us", "password": "demo1234"},
        "response": {"access_token": "<JWT>", "token_type": "bearer",
                     "user": {"id": "p-maria", "full_name": "Maria Lopez", "role": "patient", "language": "es"}},
        "errors": {"401": "wrong email or password"}},
    "GET /auth/me": {"headers": {"Authorization": "Bearer <JWT>"},
        "response": {"id": "p-maria", "full_name": "Maria Lopez", "role": "patient", "language": "es"}},
    "_access_rules": {
        "all endpoints except /auth/login and /health": "require header Authorization: Bearer <JWT>, else 401",
        "/patients/{id}/*": "patient: only own id; therapist: only assigned patients; else 403",
        "/therapist/{id}/dashboard": "therapist only, and only their own id; else 403",
        "POST /sessions, POST /pain-check": "patient only, for their own patient_id / session; else 403",
        "GET /sessions/{id}/samples": "same rule as /patients/{id}, for the session's patient; unknown session 404",
        "POST /summary": "same rule as /patients/{id}"},
    "_note": "Request/response shapes match frontend/src/api/client.ts. Base URL = VITE_API_URL (default http://localhost:8000).",
    "GET /patients/{patient_id}/assignment": {"example_url": "/patients/p-maria/assignment", "response": assignment_obj("p-maria")},
    "GET /patients/{patient_id}/overview": {"example_url": "/patients/p-maria/overview", "response": overview(maria)},
    "GET /therapist/{therapist_id}/dashboard": {"example_url": "/therapist/t-lee/dashboard",
        "response": {"therapist_id": "t-lee", "patients": [overview(p) for p in patients], "generated_at": iso(NOW)}},
    "POST /sessions": {
        "request": {"patient_id": "p-maria", "assignment_id": "a-p-maria", "joint": "knee", "started_at": iso(NOW - timedelta(minutes=4)),
                    "reps_done": 10, "max_angle": 87.5, "form_warnings": ["too_fast"], "duration_sec": 212,
                    "angle_samples": sample_samples},
        "request_notes": "assignment_id, joint and angle_samples are PROPOSED additions (not yet in the frontend's CreateSessionRequest). angle_samples feed the Tiger Data hypertable; one array per session, ~2–30 samples/sec.",
        "response": {"session_id": "s-3f6c1a2e-7b8d-4c9e-a1f2-0d3e4b5c6a7f"}},
    "GET /sessions/{session_id}/samples": {"example_url": "/sessions/s-p-maria-1/samples",
        "response_notes": "The whole session, oldest first, averaged into 100 ms buckets (time_bucket); first rows shown.",
        "response": [{"time": r["time"], "angle": r["angle"]} for r in sample_samples]},
    "POST /pain-check": {
        "request": {"session_id": "s-p-james-1", "pain_score": 8, "notes": "sharp pain", "language": "en"},
        "response_flagged": {"flagged": True, "reply": "Thanks for telling me. I've let your therapist know. Rest now and skip any more exercises today.", "flag_reason": "“sharp pain”"},
        "response_ok": {"flagged": False, "reply": "Great work! A little soreness is normal. See you next session.", "flag_reason": None},
        "rule": "flagged if pain_score >= 7 OR notes contain: sharp, swelling, swollen, pop, numb, agudo, hinchado, hinchazón"},
    "POST /summary": {"request": {"patient_id": "p-james"},
        "response": {"summary_text": summaries["p-james"], "week_start": iso(TODAY - timedelta(days=6)), "is_fallback": False}},
    "POST /translate": {"request": {"text": "Bend your knee slowly.", "target_language": "es"},
        "response": {"text": "Dobla la rodilla despacio."}},
}
with open(f"{OUT}/api_examples.json", "w") as f:
    json.dump(api, f, indent=2, ensure_ascii=False)

print({k: len(v) for k, v in rows.items()})

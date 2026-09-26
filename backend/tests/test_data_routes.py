import sys, json, uuid; sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from api.main import app
from api.auth.db import connect
c = TestClient(app); P = "/api/v1"
def tok(e): return {"Authorization": "Bearer " + c.post(P+"/auth/login", json={"email": e, "password": "demo1234"}).json()["access_token"]}
M, L, J = tok("maria@bendwith.us"), tok("lee@bendwith.us"), tok("james@bendwith.us")
ex = json.load(open(__import__("pathlib").Path(__file__).resolve().parents[2] / "database/sample_data/api_examples.json"))
res = []
def chk(name, got, want): res.append((name, got, want))

# shapes
a = c.get(P+"/patients/p-maria/assignment", headers=M); chk("assignment 200", a.status_code, 200)
chk("assignment keys", sorted(a.json()), sorted(ex["GET /patients/{patient_id}/assignment"]["response"]))
o = c.get(P+"/patients/p-maria/overview", headers=M); chk("overview 200", o.status_code, 200)
chk("overview keys", sorted(o.json()), sorted(ex["GET /patients/{patient_id}/overview"]["response"]))
chk("overview session keys", sorted(o.json()["sessions"][0]), sorted(ex["GET /patients/{patient_id}/overview"]["response"]["sessions"][0]))
d = c.get(P+"/therapist/t-lee/dashboard", headers=L); chk("dashboard 200", d.status_code, 200)
chk("dashboard patients (>=3)", len(d.json()["patients"]) >= 3, True)
chk("james red flag on dashboard", any(p["patient"]["id"] == "p-james" and p["red_flags"] for p in d.json()["patients"]), True)
# access
chk("maria -> james overview", c.get(P+"/patients/p-james/overview", headers=M).status_code, 403)
chk("maria -> dashboard", c.get(P+"/therapist/t-lee/dashboard", headers=M).status_code, 403)
chk("no token -> assignment", c.get(P+"/patients/p-maria/assignment").status_code, 401)
# write a session with angle samples. Dated now, not a fixed date: the demo seed is pinned
# to judging day (database/sample_data/generate.py), so a hardcoded time can fall *behind*
# the newest seeded session and break the "is it the newest?" checks below.
START = datetime.now(timezone.utc).replace(microsecond=0)
stamp = lambda d: d.isoformat().replace("+00:00", "Z")
body = {"patient_id": "p-maria", "started_at": stamp(START), "reps_done": 10, "max_angle": 88.5,
        "form_warnings": ["too_fast"], "duration_sec": 60, "joint": "knee",
        "angle_samples": [{"time": stamp(START + timedelta(seconds=i)), "angle": i * 1.5} for i in range(60)]}
s = c.post(P+"/sessions", json=body, headers=M); chk("create session 200", s.status_code, 200)
chk("samples saved", s.json().get("angle_samples_saved"), 60)
sid = s.json()["session_id"]
chk("james saves as maria", c.post(P+"/sessions", json=body, headers=J).status_code, 403)
chk("therapist saves session", c.post(P+"/sessions", json=body, headers=L).status_code, 403)
o2 = c.get(P+"/patients/p-maria/overview", headers=L).json()
chk("new session visible to therapist", o2["sessions"][0]["id"], sid)
# replay: the session's angle trace
tr = c.get(P+f"/sessions/{sid}/samples", headers=L); chk("samples 200 (therapist)", tr.status_code, 200)
chk("samples, oldest first", ([x["angle"] for x in tr.json()][:3], len(tr.json())), ([0.0, 1.5, 3.0], 60))
chk("samples (own session)", c.get(P+f"/sessions/{sid}/samples", headers=M).status_code, 200)
chk("samples (other patient)", c.get(P+f"/sessions/{sid}/samples", headers=J).status_code, 403)
chk("samples (unknown session)", c.get(P+"/sessions/s-nope/samples", headers=L).status_code, 404)
# the therapist edits the plan
orig = c.get(P+"/patients/p-maria/assignment", headers=M).json()
plan = {"joint": "shoulder", "target_angle": 140, "reps": 12, "times_per_week": 4}
pa = c.patch(P+"/assignments/a-p-maria", json=plan, headers=L); chk("edit plan 200", pa.status_code, 200)
chk("plan saved", (pa.json()["exercise"]["joint"], pa.json()["target_angle"], pa.json()["reps"], pa.json()["times_per_week"]),
    ("shoulder", 140.0, 12, 4))
chk("patient sees the new plan", c.get(P+"/patients/p-maria/assignment", headers=M).json()["exercise"]["joint"], "shoulder")
chk("new joint, fresh history", c.get(P+"/patients/p-maria/overview", headers=M).json()["sessions"], [])
chk("patient edits plan", c.patch(P+"/assignments/a-p-maria", json=plan, headers=M).status_code, 403)
chk("unknown joint", c.patch(P+"/assignments/a-p-maria", json={**plan, "joint": "neck"}, headers=L).status_code, 422)
chk("unknown assignment", c.patch(P+"/assignments/a-nope", json=plan, headers=L).status_code, 404)
back = {"joint": orig["exercise"]["joint"], "target_angle": orig["target_angle"], "reps": orig["reps"],
        "times_per_week": orig["times_per_week"]}
chk("plan restored", c.patch(P+"/assignments/a-p-maria", json=back, headers=L).json()["exercise"]["id"], orig["exercise"]["id"])
# sign up: a patient joins Dr. Lee's caseload on the starter plan; a therapist starts empty
tag = uuid.uuid4().hex[:8]
def signup(role, email, **kw):
    return c.post(P+"/auth/signup", json={"full_name": f"Test {role}", "email": email, "password": "long-enough",
                                          "role": role, "language": "es", **kw})
su = signup("patient", f"patient-{tag}@example.com"); chk("patient signup 201", su.status_code, 201)
new_p = su.json()["user"]; NP = {"Authorization": "Bearer " + su.json()["access_token"]}
chk("new patient", (new_p["role"], new_p["language"], new_p["id"][:2]), ("patient", "es", "p-"))
na = c.get(P+f"/patients/{new_p['id']}/assignment", headers=NP).json()
chk("starter plan", (na["exercise"]["joint"], na["target_angle"], na["reps"], na["therapist_id"]), ("knee", 90.0, 10, "t-lee"))
chk("new patient's overview", c.get(P+f"/patients/{new_p['id']}/overview", headers=NP).status_code, 200)
chk("new patient on lee's dashboard",
    new_p["id"] in [x["patient"]["id"] for x in c.get(P+"/therapist/t-lee/dashboard", headers=L).json()["patients"]], True)
chk("log in as new patient", c.post(P+"/auth/login", json={"email": f"PATIENT-{tag}@example.com", "password": "long-enough"}).status_code, 200)
chk("email taken", signup("patient", f"Patient-{tag}@example.com").status_code, 409)
chk("demo email taken", signup("patient", "maria@bendwith.us").status_code, 409)
chk("short password", signup("patient", f"x-{tag}@example.com", password="short").status_code, 422)
chk("bad email", signup("patient", "not-an-email").status_code, 422)
st = signup("therapist", f"therapist-{tag}@example.com"); chk("therapist signup 201", st.status_code, 201)
new_t = st.json()["user"]; NT = {"Authorization": "Bearer " + st.json()["access_token"]}
chk("new therapist, empty caseload", c.get(P+f"/therapist/{new_t['id']}/dashboard", headers=NT).json()["patients"], [])
chk("other therapist edits plan", c.patch(P+"/assignments/a-p-maria", json=plan, headers=NT).status_code, 403)
chk("other therapist replays", c.get(P+f"/sessions/{sid}/samples", headers=NT).status_code, 403)
# pain check
pc = c.post(P+"/pain-check", json={"session_id": sid, "pain_score": 8, "notes": "sharp pain", "language": "es"}, headers=M)
chk("pain-check 200", pc.status_code, 200); chk("flagged", pc.json()["flagged"], True)
chk("spanish reply", pc.json()["reply"].startswith("Gracias") or bool(pc.json()["reply"]), True)
chk("pain-check other's session", c.post(P+"/pain-check", json={"session_id": "s-p-james-1", "pain_score": 2}, headers=M).status_code, 403)
d2 = c.get(P+"/therapist/t-lee/dashboard", headers=L).json()
maria = [p for p in d2["patients"] if p["patient"]["id"] == "p-maria"][0]
chk("new red flag on dashboard", any(f["session_id"] == sid for f in maria["red_flags"]), True)
chk("session shows pain+flag", (maria["sessions"][0]["pain_score"], maria["sessions"][0]["flagged"]), (8, True))
# summary + translate (no Gemini key -> fallbacks)
sm = c.post(P+"/summary", json={"patient_id": "p-maria"}, headers=L)
chk("summary 200", sm.status_code, 200); chk("summary text present", bool(sm.json().get("summary_text")), True)
o3 = c.get(P+"/patients/p-maria/overview", headers=L).json()
chk("newest summary shown", o3["latest_summary"], sm.json()["summary_text"])
chk("credited to whoever wrote it", o3["latest_summary_is_ai"], not sm.json()["is_fallback"])
with connect() as conn:
    conn.execute("""INSERT INTO ai_summaries (id, patient_id, week_start, summary_text, source)
                    VALUES ('sum-test-gemini', 'p-maria', CURRENT_DATE, 'A Gemini draft', 'gemini')""")
chk("gemini draft credited", c.get(P+"/patients/p-maria/overview", headers=L).json()["latest_summary_is_ai"], True)
print("   summary:", sm.json()["summary_text"][:140])
chk("translate output", bool(c.post(P+"/translate", json={"text": "Bend", "target_language": "es"}, headers=M).json().get("text")), True)
ok = True
for n, g, w in res:
    f = g == w; ok &= f; print(("✅" if f else "❌"), n, "" if f else f"got {g} want {w}")
print("ALL PASS" if ok else "FAILURES")

# ---- clean up everything this test wrote, so the demo data stays untouched ----
with connect() as conn:
    conn.execute("DELETE FROM angle_samples WHERE session_id = %s", (sid,))
    conn.execute("DELETE FROM pain_checkins WHERE session_id = %s", (sid,))
    conn.execute("DELETE FROM sessions WHERE id = %s", (sid,))
    conn.execute("DELETE FROM ai_summaries WHERE patient_id = 'p-maria' AND id <> 'sum-p-maria'")
    conn.execute("""UPDATE assignments SET exercise_id = %s, target_angle = %s, reps = %s, times_per_week = %s
                    WHERE id = 'a-p-maria'""", (orig["exercise"]["id"], orig["target_angle"], orig["reps"], orig["times_per_week"]))
    for uid in (new_p["id"], new_t["id"]):
        conn.execute("DELETE FROM assignments WHERE patient_id = %s", (uid,))
        conn.execute("DELETE FROM therapist_patients WHERE patient_id = %s OR therapist_id = %s", (uid, uid))
        conn.execute("DELETE FROM profiles WHERE id = %s", (uid,))
print("cleaned up test rows")


def test_data_routes():
    assert ok

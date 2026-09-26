import sys, json; sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
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
chk("dashboard patients", len(d.json()["patients"]), 3)
chk("james red flag on dashboard", len([p for p in d.json()["patients"] if p["red_flags"]]), 1)
# access
chk("maria -> james overview", c.get(P+"/patients/p-james/overview", headers=M).status_code, 403)
chk("maria -> dashboard", c.get(P+"/therapist/t-lee/dashboard", headers=M).status_code, 403)
chk("no token -> assignment", c.get(P+"/patients/p-maria/assignment").status_code, 401)
# write a session with angle samples
body = {"patient_id": "p-maria", "started_at": "2026-09-26T10:00:00Z", "reps_done": 10, "max_angle": 88.5,
        "form_warnings": ["too_fast"], "duration_sec": 60, "joint": "knee",
        "angle_samples": [{"time": f"2026-09-26T10:00:{i:02d}Z", "angle": i * 1.5} for i in range(60)]}
s = c.post(P+"/sessions", json=body, headers=M); chk("create session 200", s.status_code, 200)
chk("samples saved", s.json().get("angle_samples_saved"), 60)
sid = s.json()["session_id"]
chk("james saves as maria", c.post(P+"/sessions", json=body, headers=J).status_code, 403)
chk("therapist saves session", c.post(P+"/sessions", json=body, headers=L).status_code, 403)
o2 = c.get(P+"/patients/p-maria/overview", headers=L).json()
chk("new session visible to therapist", o2["sessions"][0]["id"], sid)
# pain check
pc = c.post(P+"/pain-check", json={"session_id": sid, "pain_score": 8, "notes": "sharp pain", "language": "es"}, headers=M)
chk("pain-check 200", pc.status_code, 200); chk("flagged", pc.json()["flagged"], True)
chk("spanish fallback reply", pc.json()["reply"].startswith("Gracias"), True)
chk("pain-check other's session", c.post(P+"/pain-check", json={"session_id": "s-p-james-1", "pain_score": 2}, headers=M).status_code, 403)
d2 = c.get(P+"/therapist/t-lee/dashboard", headers=L).json()
maria = [p for p in d2["patients"] if p["patient"]["id"] == "p-maria"][0]
chk("new red flag on dashboard", len(maria["red_flags"]), 1)
chk("session shows pain+flag", (maria["sessions"][0]["pain_score"], maria["sessions"][0]["flagged"]), (8, True))
# summary + translate (no Gemini key -> fallbacks)
sm = c.post(P+"/summary", json={"patient_id": "p-maria"}, headers=L)
chk("summary 200", sm.status_code, 200); chk("summary fallback flag", sm.json()["is_fallback"], True)
print("   summary:", sm.json()["summary_text"][:140])
chk("translate fallback", c.post(P+"/translate", json={"text": "Bend", "target_language": "es"}, headers=M).json()["text"], "Bend")
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
print("cleaned up test rows")


def test_data_routes():
    assert ok

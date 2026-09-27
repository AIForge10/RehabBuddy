import sys; sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from api.auth import (auth_router, CurrentUser, require_patient, require_patient_access,
                      require_therapist_self, require_session_owner)

app = FastAPI()
app.include_router(auth_router)

@app.get("/patients/{patient_id}/overview")
def overview(patient_id: str, user: CurrentUser = Depends(require_patient_access)):
    return {"patient_id": patient_id, "viewer": user.id}

@app.get("/therapist/{therapist_id}/dashboard")
def dash(therapist_id: str, user: CurrentUser = Depends(require_therapist_self)):
    return {"ok": True}

@app.post("/pain-check")
def pain(body: dict, user: CurrentUser = Depends(require_patient)):
    require_session_owner(body["session_id"], user)
    return {"ok": True}

c = TestClient(app)
def login(email, pw="demo1234"):
    r = c.post("/auth/login", json={"email": email, "password": pw})
    return r.status_code, (r.json().get("access_token") if r.status_code == 200 else None), r.json()
H = lambda t: {"Authorization": f"Bearer {t}"}

s, maria, body = login("maria@bendwith.us"); print("login maria", s, body["user"]["role"])
s, lee, _ = login("LEE@bendwith.us");        print("login lee (case-insens.)", s)
print("wrong password ->", login("maria@bendwith.us", "nope")[0])
print("unknown email  ->", login("x@y.z")[0])
print("me (maria)     ->", c.get("/auth/me", headers=H(maria)).json())
print("no token       ->", c.get("/patients/p-maria/overview").status_code)
print("bad token      ->", c.get("/patients/p-maria/overview", headers=H("abc")).status_code)
checks = [
  ("maria  -> own overview",        c.get("/patients/p-maria/overview", headers=H(maria)).status_code, 200),
  ("maria  -> james overview",      c.get("/patients/p-james/overview", headers=H(maria)).status_code, 403),
  ("lee    -> maria overview",      c.get("/patients/p-maria/overview", headers=H(lee)).status_code, 200),
  ("lee    -> james overview",      c.get("/patients/p-james/overview", headers=H(lee)).status_code, 200),
  ("lee    -> own dashboard",       c.get("/therapist/t-lee/dashboard", headers=H(lee)).status_code, 200),
  ("maria  -> therapist dashboard", c.get("/therapist/t-lee/dashboard", headers=H(maria)).status_code, 403),
  ("maria  -> pain-check own",      c.post("/pain-check", json={"session_id":"s-p-maria-1"}, headers=H(maria)).status_code, 200),
  ("maria  -> pain-check james's",  c.post("/pain-check", json={"session_id":"s-p-james-1"}, headers=H(maria)).status_code, 403),
  ("lee    -> pain-check",          c.post("/pain-check", json={"session_id":"s-p-maria-1"}, headers=H(lee)).status_code, 403),
]
ok = True
for name, got, want in checks:
    flag = "✅" if got == want else "❌"; ok &= got == want
    print(f"{flag} {name:<32} got {got} want {want}")
print("ALL PASS" if ok else "FAILURES")


def test_access_matrix():
    assert ok

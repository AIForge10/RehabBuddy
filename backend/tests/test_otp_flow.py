"""Email OTP flow. Uses DATABASE_URL: run against a TEST database, not the live demo DB."""
import os, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
os.environ["OTP_DEV_MODE"] = "true"
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import api.auth.otp as otp
from api.auth.db import connect
from api.main import app


def test_email_otp_flow():
    sent = []
    otp.send_otp_email = lambda to, code: sent.append((to, code))
    c = TestClient(app); P = "/api/v1"
    res = []
    def chk(n, g, w): res.append((n, g, w))
    E = "new.person@example.com"; PW = "longpass123"

    r = c.post(P+"/auth/signup", json={"full_name": "New Person", "email": E, "password": PW, "role": "patient"})
    chk("signup -> 202 verification_required", (r.status_code, r.json().get("status")), (202, "verification_required"))
    chk("signup gives NO token", "access_token" in r.json(), False)
    chk("code emailed", len(sent), 1)
    code = sent[-1][1]
    chk("code is 6 digits", (len(code), code.isdigit()), (6, True))
    with connect() as conn:
        stored = conn.execute("SELECT code_hash FROM email_otps WHERE email=%s", (E,)).fetchone()["code_hash"]
    chk("code stored only as hash", code in stored, False)

    r = c.post(P+"/auth/login", json={"email": E, "password": PW, "role": "patient"})
    chk("login before verify -> 403 email_not_verified", (r.status_code, r.json()["detail"]), (403, "email_not_verified"))
    chk("login did not send (cooldown)", len(sent), 1)
    chk("wrong password still 401", c.post(P+"/auth/login", json={"email": E, "password": "nope"}).status_code, 401)

    chk("resend within 60s -> 429", c.post(P+"/auth/resend-otp", json={"email": E}).status_code, 429)
    chk("resend for unknown email: same answer", c.post(P+"/auth/resend-otp", json={"email": "nobody@x.io"}).status_code, 200)

    wrong = "000000" if code != "000000" else "111111"
    r = c.post(P+"/auth/verify-otp", json={"email": E, "code": wrong})
    chk("wrong code -> 400", r.status_code, 400)
    with connect() as conn:
        att = conn.execute("SELECT attempts FROM email_otps WHERE email=%s", (E,)).fetchone()["attempts"]
    chk("failed attempt is counted (commit bug fixed)", att, 1)
    chk("letters rejected", c.post(P+"/auth/verify-otp", json={"email": E, "code": "12ab56"}).status_code, 400)

    r = c.post(P+"/auth/verify-otp", json={"email": E.upper(), "code": code})
    chk("correct code (email any case) -> 200 + token", (r.status_code, "access_token" in r.json()), (200, True))
    tok = r.json().get("access_token")
    chk("token works", c.get(P+"/auth/me", headers={"Authorization": f"Bearer {tok}"}).json().get("full_name"), "New Person")
    chk("code can't be reused", c.post(P+"/auth/verify-otp", json={"email": E, "code": code}).status_code, 400)
    chk("login works after verify", c.post(P+"/auth/login", json={"email": E, "password": PW, "role": "patient"}).status_code, 200)
    chk("new patient has a plan", c.get(P+"/patients/{}/assignment".format(r.json()["user"]["id"]), headers={"Authorization": f"Bearer {tok}"}).status_code, 200)

    chk("demo account still logs in (existing = verified)", c.post(P+"/auth/login", json={"email": "maria@bendwith.us", "password": "demo1234"}).status_code, 200)

    # expiry + too many attempts, on a second account
    E2 = "second@example.com"
    c.post(P+"/auth/signup", json={"full_name": "Second One", "email": E2, "password": PW, "role": "patient"})
    code2 = sent[-1][1]
    for _ in range(5):
        c.post(P+"/auth/verify-otp", json={"email": E2, "code": "999999" if code2 != "999999" else "888888"})
    chk("6th try after 5 wrong -> 429", c.post(P+"/auth/verify-otp", json={"email": E2, "code": code2}).status_code, 429)
    with connect() as conn:
        conn.execute("UPDATE email_otps SET last_sent_at = now() - interval '2 minutes' WHERE email=%s", (E2,))
    chk("resend after cooldown -> 200", c.post(P+"/auth/resend-otp", json={"email": E2}).status_code, 200)
    code3 = sent[-1][1]
    with connect() as conn:
        conn.execute("UPDATE email_otps SET expires_at = now() - interval '1 minute' WHERE email=%s", (E2,))
    chk("expired code -> 400", c.post(P+"/auth/verify-otp", json={"email": E2, "code": code3}).status_code, 400)

    # email provider not configured -> signup fails cleanly, nothing half-created
    import api.auth.email_sender as es
    otp.send_otp_email = es.send_otp_email
    os.environ.pop("OTP_DEV_MODE", None)
    r = c.post(P+"/auth/signup", json={"full_name": "No Mail", "email": "nomail@example.com", "password": PW, "role": "patient"})
    with connect() as conn:
        exists = conn.execute("SELECT count(*) AS n FROM profiles WHERE email='nomail@example.com'").fetchone()["n"]
    chk("no email provider -> 503 and no account left behind", (r.status_code, exists), (503, 0))

    with connect() as conn:
        for e in (E, E2):
            uid = conn.execute("SELECT id FROM profiles WHERE email=%s", (e,)).fetchone()
            if uid:
                conn.execute("DELETE FROM assignments WHERE patient_id=%s", (uid["id"],))
                conn.execute("DELETE FROM therapist_patients WHERE patient_id=%s", (uid["id"],))
                conn.execute("DELETE FROM profiles WHERE id=%s", (uid["id"],))
            conn.execute("DELETE FROM email_otps WHERE email=%s", (e,))
    ok = True
    for n, g, w in res:
        f = g == w; ok &= f; print(("✅" if f else "❌"), n, "" if f else f"got {g} want {w}")
    assert ok

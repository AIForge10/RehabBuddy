"""RehabBuddy backend smoke test: checks every part of a running backend.

Usage (from the repo root):
    python scripts/smoke_test.py https://rehabbuddy-api-ggcb7.ondigitalocean.app
    python scripts/smoke_test.py http://localhost:8000
    python scripts/smoke_test.py <url> --no-ai        # skip Gemini + ElevenLabs (no credits used)

It creates ONE small test session (so the write path is tested) and deletes it at the end
using DATABASE_URL from the root .env. Demo data is left unchanged.
Only uses the Python standard library (+ psycopg for the cleanup).
"""
import argparse
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

results = []


def call(method, url, token=None, body=None, raw=False, timeout=30):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = r.read(4096) if raw else r.read()
            ms = int((time.time() - t0) * 1000)
            if raw:
                return r.status, payload, ms, r.headers.get("Content-Type", "")
            return r.status, (json.loads(payload) if payload else None), ms, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        try:
            body = json.loads(e.read() or b"null")
            return e.code, body if isinstance(body, (dict, list)) else None, ms, ""
        except Exception:  # noqa: BLE001
            return e.code, None, ms, ""
    except Exception as e:  # noqa: BLE001
        return 0, str(e), int((time.time() - t0) * 1000), ""


def check(area, name, ok, detail="", skip=False):
    results.append((area, name, "SKIP" if skip else ("PASS" if ok else "FAIL"), detail))
    icon = "⏭️ " if skip else ("✅" if ok else "❌")
    print(f"{icon} [{area}] {name}" + (f"  ({detail})" if detail else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", help="backend URL, e.g. https://rehabbuddy-api-xxxx.ondigitalocean.app")
    ap.add_argument("--no-ai", action="store_true", help="skip Gemini/ElevenLabs calls")
    args = ap.parse_args()
    B = args.base.rstrip("/")
    A = B + "/api/v1"
    print(f"\nTesting {A}\n")

    # ---------- 1. Server ----------
    s, d, ms, _ = call("GET", B + "/")
    check("server", "GET / responds", s == 200 and isinstance(d, dict), f"{s}, {ms} ms")
    if s == 0:
        print(f"\nCannot reach {B} ({d}). Is the URL right and the app running?")
        return finish()
    s, _, _, _ = call("GET", B + "/api/v1/openapi.json")
    check("server", "OpenAPI docs available", s == 200, str(s))

    # ---------- 2. Auth ----------
    def login(email, pw="demo1234"):
        s, d, ms, _ = call("POST", A + "/auth/login", body={"email": email, "password": pw})
        return s, (d if isinstance(d, dict) else {}), ms

    s, d, ms = login("maria@bendwith.us")
    maria = d.get("access_token")
    check("auth", "patient login (maria)", s == 200 and maria and d["user"]["role"] == "patient", f"{s}, {ms} ms")
    s, d, ms = login("lee@bendwith.us")
    lee = d.get("access_token")
    check("auth", "therapist login (lee)", s == 200 and lee and d["user"]["role"] == "therapist", f"{s}, {ms} ms")
    s, _, _ = login("maria@bendwith.us", "wrong-password")
    check("auth", "wrong password rejected", s == 401, str(s))
    s, d, _, _ = call("GET", A + "/auth/me", maria)
    check("auth", "/auth/me with token", s == 200 and (d or {}).get("id") == "p-maria", str(s))
    s, _, _, _ = call("GET", A + "/auth/me")
    check("auth", "/auth/me without token rejected", s == 401, str(s))
    if not (maria and lee):
        print("\nLogin failed; stopping. Check DATABASE_URL / JWT_SECRET on the server.")
        return finish()

    # ---------- 3. Data from Tiger ----------
    s, d, ms, _ = call("GET", A + "/patients/p-maria/assignment", maria)
    assignment_id = (d or {}).get("id")
    check("data", "assignment (maria)", s == 200 and assignment_id, f"{s}, target {(d or {}).get('target_angle')}°")
    s, d, ms, _ = call("GET", A + "/patients/p-maria/overview", maria)
    n_sessions = len((d or {}).get("sessions", []))
    check("data", "overview from Tiger (maria)", s == 200 and n_sessions > 0, f"{n_sessions} sessions, {ms} ms")
    s, d, ms, _ = call("GET", A + "/therapist/t-lee/dashboard", lee)
    pts = (d or {}).get("patients", [])
    flags = sum(len(p.get("red_flags", [])) for p in pts)
    check("data", "therapist dashboard", s == 200 and len(pts) >= 3, f"{len(pts)} patients, {flags} red flags, {ms} ms")
    s, d, _, _ = call("GET", A + "/exercises")
    check("data", "exercise list", s == 200, str(s), skip=s == 404)

    # ---------- 4. Access control ----------
    s, _, _, _ = call("GET", A + "/patients/p-james/overview", maria)
    check("access", "patient blocked from another patient", s == 403, str(s))
    s, _, _, _ = call("GET", A + "/therapist/t-lee/dashboard", maria)
    check("access", "patient blocked from dashboard", s == 403, str(s))
    s, _, _, _ = call("GET", A + "/patients/p-maria/overview")
    check("access", "no token rejected", s == 401, str(s))
    s, _, _, _ = call("PATCH", A + f"/assignments/{assignment_id}", maria, {"reps": 3})
    check("access", "patient cannot edit plan", s == 403, str(s))

    # ---------- 5. Write path: session + samples into the hypertable ----------
    start = datetime.now(timezone.utc).replace(microsecond=0)
    samples = [{"time": (start + timedelta(milliseconds=200 * i)).isoformat(), "angle": round(45 + 40 * abs(((i % 20) - 10) / 10), 1)}
               for i in range(50)]
    body = {"patient_id": "p-maria", "assignment_id": assignment_id, "joint": "knee",
            "started_at": start.isoformat(), "reps_done": 3, "max_angle": 85.0,
            "form_warnings": [], "duration_sec": 10, "angle_samples": samples}
    s, d, ms, _ = call("POST", A + "/sessions", maria, body)
    session_id = (d or {}).get("session_id")
    check("write", "save session + 50 angle samples", s in (200, 201) and session_id, f"{s}, {ms} ms")
    if session_id:
        s, d, _, _ = call("GET", A + f"/sessions/{session_id}/samples", maria)
        got = len(d) if isinstance(d, list) else len((d or {}).get("samples", (d or {}).get("angle_samples", [])))
        check("write", "samples readable from hypertable", s == 200 and got >= 50, f"{got} samples", skip=s == 404)
        s, d, _, _ = call("GET", A + "/therapist/t-lee/dashboard", lee)
        maria_o = next((p for p in (d or {}).get("patients", []) if p["patient"]["id"] == "p-maria"), {})
        newest = (maria_o.get("sessions") or [{}])[0].get("id")
        check("write", "new session visible to therapist", newest == session_id)

    # ---------- 6. AI ----------
    if args.no_ai:
        check("ai", "Gemini / ElevenLabs", True, "skipped (--no-ai)", skip=True)
    else:
        s, d, ms, _ = call("POST", A + "/summary", lee, {"patient_id": "p-james"}, timeout=40)
        check("ai", "Gemini summary (live, not fallback)", s == 200 and (d or {}).get("is_fallback") is False,
              f"{s}, is_fallback={(d or {}).get('is_fallback')}, {ms} ms")
        s, d, ms, _ = call("POST", A + "/translate", maria, {"text": "Bend your knee slowly.", "target_language": "es"}, timeout=40)
        txt = (d or {}).get("text", "")
        check("ai", "Gemini translate to Spanish", s == 200 and txt and txt != "Bend your knee slowly.", f"'{txt[:40]}'")
        if session_id:
            s, d, ms, _ = call("POST", A + "/pain-check", maria,
                               {"session_id": session_id, "pain_score": 8, "notes": "sharp pain", "language": "en"}, timeout=40)
            check("ai", "pain check flags pain 8 + 'sharp'", s == 200 and (d or {}).get("flagged") is True, f"{s}, {ms} ms")
            audio = (d or {}).get("audio_url")
            if audio:
                clip = audio.rstrip("/").split("/")[-1]
                check("security", "tts clip id is random (not guessable)",
                      len(clip) >= 16 and not re.search(r"p-maria|s-|session", clip), f"id length {len(clip)}")
                url = audio if audio.startswith("http") else B + audio
                s2, data, ms2, ctype = call("GET", url, raw=True, timeout=40)
                check("ai", "ElevenLabs audio streams", s2 == 200 and len(data or b"") > 500 and "audio" in ctype,
                      f"{s2}, {ctype}, first chunk {ms2} ms")
            else:
                check("ai", "ElevenLabs audio_url in pain-check", False, "no audio_url (ELEVENLABS_* env vars?)")
            s, d, _, _ = call("GET", A + "/therapist/t-lee/dashboard", lee)
            maria_o = next((p for p in (d or {}).get("patients", []) if p["patient"]["id"] == "p-maria"), {})
            check("ai", "red flag reaches therapist dashboard",
                  any(f.get("session_id") == session_id for f in maria_o.get("red_flags", [])))

    # ---------- 7. Unprotected routes (should need a token, unless meant to be public) ----------
    s, _, _, _ = call("POST", A + "/summaries/session", body={})
    check("security", "/summaries/session requires login", s in (401, 403, 404), f"{s} (422/200 = open to anyone)",
          skip=s == 404)

    # ---------- cleanup ----------
    if session_id:
        cleanup(session_id)
    return finish()


def cleanup(session_id):
    env = pathlib.Path(__file__).resolve().parents[1] / ".env"
    m = re.search(r"^DATABASE_URL=(.+)$", env.read_text(), re.M) if env.exists() else None
    if not m:
        print(f"\n⚠️  No DATABASE_URL in .env; delete test session {session_id} manually.")
        return
    try:
        import psycopg
        with psycopg.connect(m.group(1).strip()) as c:
            for sql in ("DELETE FROM angle_samples WHERE session_id = %s",
                        "DELETE FROM pain_checkins WHERE session_id = %s",
                        "DELETE FROM sessions WHERE id = %s"):
                c.execute(sql, (session_id,))
        print(f"\n🧹 Test session {session_id} and its samples/pain check deleted.")
    except Exception as e:  # noqa: BLE001
        print(f"\n⚠️  Cleanup failed ({e}); delete session {session_id} manually.")


def finish():
    p = sum(r[2] == "PASS" for r in results)
    f = sum(r[2] == "FAIL" for r in results)
    sk = sum(r[2] == "SKIP" for r in results)
    print(f"\n{'=' * 50}\n{p} passed · {f} failed · {sk} skipped")
    if f:
        print("Failed:")
        for area, name, st, det in results:
            if st == "FAIL":
                print(f"  - [{area}] {name} {det}")
    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())

"""Session replay trace and per-session stats, with login and the database faked.

The SQL itself runs on Tiger Data; these check who may read a trace and what the routes
make of the rows. Run from backend/:  python -m pytest tests/test_session_samples.py
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from api.auth import CurrentUser, deps, get_current_user, require_patient_access
from api.data import queries as q
from api.main import app

T0 = datetime(2026, 9, 25, 18, 22, tzinfo=timezone.utc)
LEE = CurrentUser("t-lee", "therapist", "Dr. Sarah Lee", "en")
MARIA = CurrentUser("p-maria", "patient", "Maria Lopez", "es")
JAMES = CurrentUser("p-james", "patient", "James Carter", "en")


class Rows:
    def __init__(self, rows):
        self.rows = rows

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


class FakeDb:
    """Stands in for psycopg: answers the few statements these routes send from rows in memory."""

    def __init__(self):
        self.patient_of = {"s-maria-1": "p-maria", "s-maria-2": "p-maria"}
        # Who can_view_patient() lets see whom: Maria herself and her therapist.
        self.may_view = {("p-maria", "p-maria"), ("t-lee", "p-maria")}
        # Already bucketed to 10 Hz, as Tiger Data sends them back.
        self.trace = {"s-maria-1": [(T0 + timedelta(milliseconds=100 * i), Decimal(a))
                                    for i, a in enumerate(["3.2", "40.5", "86.0", "12.1"])]}
        self.stats = {"s-maria-1": {"session_id": "s-maria-1", "rep_peaks": [84, 86], "fade": None,
                                    "end_range_sec": 3.5, "longest_hold_sec": 1.2}}
        self.sent = []  # (sql, params) in order

    @contextmanager
    def connect(self):
        yield self

    def execute(self, sql, params=None):
        self.sent.append((sql, params))
        if "can_view_patient" in sql:
            viewer, session_id = params
            patient = self.patient_of.get(session_id)
            return Rows([{"ok": (viewer, patient) in self.may_view}] if patient else [])
        if "rep_peaks" in sql:
            return Rows([self.stats[i] for i in params["ids"] if i in self.stats])
        if "time_bucket" in sql:
            return Rows([{"time": t, "angle": a} for i in params["ids"] for t, a in self.trace.get(i, [])])
        raise AssertionError(f"unexpected SQL: {sql}")


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(deps, "connect", fake.connect)
    monkeypatch.setattr(q, "connect", fake.connect)
    q._stats_cache.clear()
    yield fake
    q._stats_cache.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def login(user):
    app.dependency_overrides[get_current_user] = lambda: user


def test_therapist_replays_a_trace_downsampled_in_sql(client, db):
    login(LEE)
    res = client.get("/api/v1/sessions/s-maria-1/samples")
    assert res.status_code == 200
    assert res.json() == [
        {"time": "2026-09-25T18:22:00+00:00", "angle": 3.2},
        {"time": "2026-09-25T18:22:00.100000+00:00", "angle": 40.5},
        {"time": "2026-09-25T18:22:00.200000+00:00", "angle": 86.0},
        {"time": "2026-09-25T18:22:00.300000+00:00", "angle": 12.1},
    ]
    sql, params = db.sent[-1]
    assert "time_bucket('100 milliseconds', time)" in sql and "ORDER BY time" in sql
    assert params == {"ids": ["s-maria-1"]}


def test_patient_reads_their_own_trace(client, db):
    login(MARIA)
    assert client.get("/api/v1/sessions/s-maria-1/samples").status_code == 200


def test_session_without_samples_is_an_empty_trace(client, db):
    login(LEE)
    res = client.get("/api/v1/sessions/s-maria-2/samples")
    assert res.status_code == 200
    assert res.json() == []


def test_another_patients_trace_is_403(client, db):
    login(JAMES)
    assert client.get("/api/v1/sessions/s-maria-1/samples").status_code == 403


def test_unknown_session_is_404(client, db):
    login(LEE)
    assert client.get("/api/v1/sessions/s-nope/samples").status_code == 404
    assert not any("time_bucket" in sql for sql, _ in db.sent)  # never reached the trace


def test_no_token_is_401(client, db):
    assert client.get("/api/v1/sessions/s-maria-1/samples").status_code == 401


@pytest.fixture
def maria_overview(monkeypatch, db):
    """The overview's other queries answer with a plan and two sessions; only the stats go to the fake DB."""
    session = {"patient_id": "p-maria", "started_at": T0.isoformat(), "reps_done": 10, "max_angle": 86.0,
               "form_warnings": [], "duration_sec": 180, "pain_score": 3, "flagged": False}
    target = {"value": 90.0}
    monkeypatch.setattr(q, "patient", lambda conn, pid: {"id": pid, "full_name": "Maria Lopez", "language": "es",
                                                        "injury": "ACL reconstruction", "start_date": "2026-09-16"})
    monkeypatch.setattr(q, "assignment", lambda conn, pid: {"id": "a-p-maria", "target_angle": target["value"],
                                                           "times_per_week": 5})
    monkeypatch.setattr(q, "sessions", lambda conn, pid: [{"id": "s-maria-2", **session}, {"id": "s-maria-1", **session}])
    monkeypatch.setattr(q, "red_flags", lambda conn, pid: [])
    monkeypatch.setattr(q, "adherence_7d", lambda conn, pid, n: 0.4)
    monkeypatch.setattr(q, "latest_summary", lambda conn, pid: None)
    app.dependency_overrides[require_patient_access] = lambda: LEE
    return target


def test_overview_sessions_carry_their_stats(client, db, maria_overview):
    sessions = client.get("/api/v1/patients/p-maria/overview").json()["sessions"]
    assert [s["stats"] for s in sessions] == [
        None,  # no angle trace was recorded
        {"rep_peaks": [84, 86], "fade": None, "end_range_sec": 3.5, "longest_hold_sec": 1.2},
    ]
    sql, params = next((sql, p) for sql, p in db.sent if "rep_peaks" in sql)
    assert params == {"ids": ["s-maria-2", "s-maria-1"], "target": 90.0}


def test_stats_are_worked_out_once_per_session_and_target(client, db, maria_overview):
    def stats_queries():
        return [p for sql, p in db.sent if "rep_peaks" in sql]

    client.get("/api/v1/patients/p-maria/overview")
    client.get("/api/v1/patients/p-maria/overview")
    assert len(stats_queries()) == 1  # the dashboard's next poll re-reads nothing

    maria_overview["value"] = 95.0  # a new target moves the rep thresholds
    sessions = client.get("/api/v1/patients/p-maria/overview").json()["sessions"]
    assert stats_queries()[-1] == {"ids": ["s-maria-2", "s-maria-1"], "target": 95.0}
    assert sessions[1]["stats"]["rep_peaks"] == [84, 86]

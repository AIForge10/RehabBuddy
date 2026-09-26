"""Session replay trace, with login and the database faked.

The SQL itself runs on Tiger Data; these check who may read a trace and what the route
makes of the rows. Run from backend/:  python -m pytest tests/test_session_samples.py
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from api.auth import CurrentUser, deps, get_current_user
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
        if "time_bucket" in sql:
            return Rows([{"time": t, "angle": a} for i in params["ids"] for t, a in self.trace.get(i, [])])
        raise AssertionError(f"unexpected SQL: {sql}")


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(deps, "connect", fake.connect)
    monkeypatch.setattr(q, "connect", fake.connect)
    return fake


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


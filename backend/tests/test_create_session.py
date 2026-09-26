"""POST /sessions with login and the database faked: which plan and joint a saved session gets.

Run from backend/:  python -m pytest tests/test_create_session.py
"""
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from api.auth import CurrentUser, require_patient
from api.data import queries as q
from api.main import app

MARIA = CurrentUser("p-maria", "patient", "Maria Lopez", "es")
BODY = {"patient_id": "p-maria", "started_at": "2026-09-26T18:00:00Z", "reps_done": 10,
        "max_angle": 88.5, "duration_sec": 80, "joint": "knee"}


class Rows:
    def __init__(self, rows):
        self.rows = rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeDb:
    def __init__(self):
        # Maria's current plan, and an older one of hers from before a plan change.
        self.owned = {("a-maria", "p-maria"), ("a-maria-old", "p-maria"), ("a-james", "p-james")}
        self.saved = None

    @contextmanager
    def connect(self):
        yield self

    def execute(self, sql, params=None):
        if "FROM assignments" in sql:
            return Rows([{"?column?": 1}] if tuple(params) in self.owned else [])
        if "INSERT INTO sessions" in sql:
            self.saved = params
            return Rows([])
        raise AssertionError(f"unexpected SQL: {sql}")


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(q, "connect", fake.connect)
    monkeypatch.setattr(q, "assignment", lambda conn, pid: {"id": "a-maria", "exercise": {"joint": "knee"}})
    return fake


@pytest.fixture
def client():
    app.dependency_overrides[require_patient] = lambda: MARIA
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def saved_plan(db):
    return db.saved[1]


@pytest.mark.parametrize("sent, kept", [
    (None, "a-maria"),               # nothing sent: the current plan
    ("a-maria", "a-maria"),
    ("a-maria-old", "a-maria-old"),  # one of her own older plans stays
    ("a-james", "a-maria"),          # someone else's plan: never linked
    ("a-nope", "a-maria"),           # unknown: would have failed the foreign key
])
def test_a_session_is_only_linked_to_the_patients_own_plan(client, db, sent, kept):
    res = client.post("/api/v1/sessions", json={**BODY, "assignment_id": sent})
    assert res.status_code == 200
    assert saved_plan(db) == kept


def test_an_unknown_joint_is_refused(client, db):
    assert client.post("/api/v1/sessions", json={**BODY, "joint": "ankle"}).status_code == 422
    assert db.saved is None

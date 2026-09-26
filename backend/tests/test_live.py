"""Live sessions: the in-memory pub/sub, who may publish and watch, and the timeout. Login and the database are faked.

Run from backend/:  python -m pytest tests/test_live.py
"""
import asyncio
import json

import pytest
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api.auth import CurrentUser, get_current_user
from api.data import live
from api.main import app
from api.services import live_hub as live_hub_module
from api.services.live_hub import LiveHub

STARTED = "2026-09-26T17:00:00.000Z"

# Bearer tokens the fake login accepts.
USERS = {
    "maria": CurrentUser("p-maria", "patient", "Maria Lopez", "es"),
    "james": CurrentUser("p-james", "patient", "James Carter", "en"),
    "lee": CurrentUser("t-lee", "therapist", "Dr. Lee", "en"),
}
# Dr. Lee's caseload (tests/test_data_routes.py covers the real can_view_patient against the database).
CARE = {("t-lee", "p-maria"), ("t-lee", "p-james")}


def fake_user(creds: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False))) -> CurrentUser:
    user = USERS.get(creds.credentials) if creds else None
    if user is None:
        raise HTTPException(401, "Invalid or expired token")
    return user


def update(**fields) -> dict:
    """One batch from the patient's screen."""
    return {"type": "update", "started_at": STARTED, "joint": "knee", "target": 90, "goal": 10, "t_ms": 1000,
            "reps": 0, "max_angle": 0, "warning": None, "samples": [], **fields}


def drain(sub) -> list[dict]:
    events = []
    while not sub.queue.empty():
        events.append(sub.queue.get_nowait())
    return events


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def hub(clock, monkeypatch):
    hub = LiveHub(clock=clock)
    monkeypatch.setattr(live, "live_hub", hub)
    return hub


@pytest.fixture
def client(hub, monkeypatch):
    app.dependency_overrides[get_current_user] = fake_user
    monkeypatch.setattr(live, "get_current_user", fake_user)  # the socket checks its first message itself
    monkeypatch.setattr(live, "can_view_patient", lambda viewer, patient: viewer == patient or (viewer, patient) in CARE)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# --- The pub/sub --------------------------------------------------------------

def test_updates_reach_only_that_patients_watchers(hub):
    maria, james = hub.subscribe(["p-maria"]), hub.subscribe(["p-james"])
    hub.update("p-maria", update(reps=3, samples=[{"t_ms": 900, "angle": 42.5}]))

    [event] = drain(maria)
    assert event["type"] == "update" and event["patient_id"] == "p-maria"
    assert event["reps"] == 3 and event["samples"] == [{"t_ms": 900, "angle": 42.5}]
    assert drain(james) == []


def test_a_late_watcher_gets_the_session_so_far(hub):
    hub.update("p-maria", update(t_ms=250, samples=[{"t_ms": 100, "angle": 10}, {"t_ms": 200, "angle": 20}]))
    hub.update("p-maria", update(t_ms=500, reps=1, warning="Knee caving inward", samples=[{"t_ms": 300, "angle": 30}]))

    [snapshot] = drain(hub.subscribe(["p-maria", "p-james"]))
    assert snapshot["patient_id"] == "p-maria"
    assert snapshot["reps"] == 1 and snapshot["t_ms"] == 500 and snapshot["warning"] == "Knee caving inward"
    assert [s["angle"] for s in snapshot["samples"]] == [10, 20, 30]


def test_ending_closes_the_session_and_a_late_batch_cant_reopen_it(hub):
    sub = hub.subscribe(["p-maria"])
    hub.update("p-maria", update())
    hub.end("p-maria", STARTED, "finished")

    assert drain(sub)[-1] == {"type": "end", "patient_id": "p-maria", "started_at": STARTED, "reason": "finished"}
    assert not hub.is_live("p-maria")

    hub.update("p-maria", update(t_ms=1250))  # was already in flight
    assert not hub.is_live("p-maria") and drain(sub) == []

    hub.update("p-maria", update(started_at="2026-09-26T17:05:00.000Z"))  # the next session
    assert hub.is_live("p-maria")


def test_a_quiet_patient_is_lost_after_the_timeout(hub, clock):
    sub = hub.subscribe(["p-maria"])
    hub.update("p-maria", update())
    drain(sub)

    clock.now = 4.9
    hub.reap()
    assert hub.is_live("p-maria") and drain(sub) == []

    clock.now = 5.1
    hub.reap()
    assert drain(sub) == [{"type": "end", "patient_id": "p-maria", "started_at": STARTED, "reason": "lost"}]
    assert not hub.is_live("p-maria")

    # The network comes back: the same session picks up again.
    hub.update("p-maria", update(t_ms=6000))
    assert hub.is_live("p-maria")


def test_a_stalled_watcher_is_dropped(hub, monkeypatch):
    monkeypatch.setattr(live_hub_module, "QUEUE_MAX", 2)
    sub = hub.subscribe(["p-maria"])
    for t in (250, 500, 750):
        hub.update("p-maria", update(t_ms=t))
    assert sub.closed
    hub.update("p-maria", update(t_ms=1000))
    assert len(drain(sub)) == 2  # nothing more was queued once it was dropped


# --- Publishing (WebSocket) ---------------------------------------------------

PUBLISH = "/api/v1/live/{}/publish"


def test_patient_publishes_their_own_session(client, hub):
    sub = hub.subscribe(["p-maria"])
    with client.websocket_connect(PUBLISH.format("p-maria")) as ws:
        ws.send_json({"token": "maria"})
        assert ws.receive_json() == {"ok": True}
        ws.send_json(update(reps=1, samples=[{"t_ms": 100, "angle": 12.3}]))
        ws.send_json({"type": "end", "started_at": STARTED, "reason": "finished"})
    # Leaving the block waits for the server to handle everything sent.

    first, last = drain(sub)
    assert first["patient_id"] == "p-maria" and first["samples"] == [{"t_ms": 100, "angle": 12.3}]
    assert first["type"] == "update"
    assert last["type"] == "end" and last["reason"] == "finished"


@pytest.mark.parametrize(("token", "stream", "code"), [
    ("maria", "p-james", live.WS_FORBIDDEN),  # someone else's stream
    ("lee", "p-maria", live.WS_FORBIDDEN),    # therapists watch, they don't publish
    ("expired", "p-maria", live.WS_UNAUTHORIZED),
])
def test_only_the_patient_may_publish(client, hub, token, stream, code):
    with client.websocket_connect(PUBLISH.format(stream)) as ws:
        ws.send_json({"token": token})
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == code
    assert not hub.is_live(stream)


def test_a_bad_message_closes_the_socket(client, hub):
    with client.websocket_connect(PUBLISH.format("p-maria")) as ws:
        ws.send_json({"token": "maria"})
        ws.receive_json()
        ws.send_json(update(samples=[{"t_ms": 100, "angle": "deep"}]))
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == live.WS_INVALID
    assert not hub.is_live("p-maria")


def test_a_closed_tab_ends_the_live_view_after_the_timeout(client, hub, clock):
    sub = hub.subscribe(["p-maria"])
    with client.websocket_connect(PUBLISH.format("p-maria")) as ws:
        ws.send_json({"token": "maria"})
        ws.receive_json()
        ws.send_json(update())
    # Gone without an end: still live for a few seconds, in case it reconnects.
    assert hub.is_live("p-maria")

    clock.now += 6
    hub.reap()
    assert drain(sub)[-1]["reason"] == "lost"


# --- Watching (Server-Sent Events) --------------------------------------------

WATCH = "/api/v1/live/watch"
auth = lambda token: {"Authorization": f"Bearer {token}"}  # noqa: E731


def test_watching_needs_a_login(client):
    app.dependency_overrides.pop(get_current_user)  # the real check: no token, no database call
    assert client.get(WATCH, params={"patient_id": "p-maria"}).status_code == 401


@pytest.mark.parametrize(("token", "patients"), [
    ("lee", ["p-maria", "p-aisha"]),  # one of them isn't Dr. Lee's patient
    ("maria", ["p-james"]),           # patients only see themselves
])
def test_only_allowed_viewers_may_watch(client, hub, token, patients):
    res = client.get(WATCH, params={"patient_id": patients}, headers=auth(token))
    assert res.status_code == 403
    assert hub._subscribers == set()


def test_watching_needs_at_least_one_patient(client):
    assert client.get(WATCH, headers=auth("lee")).status_code == 422


def test_watch_streams_sessions_as_server_sent_events(client, hub, clock, monkeypatch):
    # TestClient waits for a response to finish, and this one never does, so read the stream directly.
    monkeypatch.setattr(live, "TICK_S", 0.01)
    hub.update("p-maria", update(reps=2, samples=[{"t_ms": 100, "angle": 30}]))  # already under way

    def parse(chunk: str) -> dict:
        assert chunk.startswith("data: ") and chunk.endswith("\n\n")
        return json.loads(chunk[len("data: "):])

    async def scenario():
        res = await live.watch(patient_id=["p-maria", "p-james"], user=USERS["lee"])
        assert res.media_type == "text/event-stream"
        stream = res.body_iterator
        assert await anext(stream) == ": watching\n\n"
        snapshot = parse(await anext(stream))
        hub.update("p-james", update(t_ms=250))
        james = parse(await anext(stream))
        clock.now += 6  # both go quiet; the stream's idle tick ends them
        ends = [parse(await anext(stream)), parse(await anext(stream))]
        await stream.aclose()
        return snapshot, james, ends

    snapshot, james, ends = asyncio.run(scenario())
    assert snapshot["patient_id"] == "p-maria" and snapshot["reps"] == 2 and snapshot["samples"] == [{"t_ms": 100, "angle": 30}]
    assert james["patient_id"] == "p-james" and james["t_ms"] == 250
    assert {(e["patient_id"], e["type"], e["reason"]) for e in ends} == {("p-maria", "end", "lost"), ("p-james", "end", "lost")}
    assert hub._subscribers == set()  # closing the stream unsubscribes

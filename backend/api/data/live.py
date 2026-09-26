"""Live sessions: the therapist watches a patient's angles while they exercise. No video, only angles.

WS  /live/{patient_id}/publish   the patient's session screen: first message {"token": ...}, then an
                                 `update` every ~250 ms and an `end` when they finish or leave
GET /live/watch?patient_id=...   therapists (Server-Sent Events): sessions under way, then each event

A browser can't put an Authorization header on a WebSocket, so the token is the socket's first
message rather than part of the URL, where it would end up in server logs. The dashboard reads the
event stream with fetch(), which can send the header.

The pub/sub is in memory (api/services/live_hub.py): run the API as a single worker.
"""
import asyncio
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, TypeAdapter

from api.auth import CurrentUser, get_current_user
from api.auth.deps import can_view_patient
from api.services.live_hub import live_hub

router = APIRouter(tags=["live"])

AUTH_TIMEOUT_S = 10
# The screen sends every ~250 ms; a socket silent this long is dead. (The hub ends the live
# view after a few quiet seconds; this only tidies up the connection.)
IDLE_TIMEOUT_S = 30
# How often an idle stream wakes to end quiet sessions, and how often it sends a comment so
# proxies don't close it and a closed tab is noticed.
TICK_S = 1.0
KEEPALIVE_S = 10.0
MAX_WATCHED = 50

# WebSocket close codes: 4000 + the HTTP status they stand for.
WS_UNAUTHORIZED = 4401
WS_FORBIDDEN = 4403
WS_INVALID = 4422


class LiveSample(BaseModel):
    t_ms: int = Field(ge=0)  # since the session started
    angle: float = Field(ge=-360, le=360)


class LiveUpdate(BaseModel):
    """Sent every ~250 ms. It repeats the plan, so any one batch describes the whole session."""
    type: Literal["update"]
    started_at: str = Field(min_length=1, max_length=40)
    joint: str = Field(max_length=20)
    target: float = Field(ge=0, le=360)
    goal: int = Field(ge=0, le=1000)
    t_ms: int = Field(ge=0)
    reps: int = Field(ge=0, le=1000)
    max_angle: float = Field(ge=-360, le=360)
    warning: str | None = Field(default=None, max_length=120)
    samples: list[LiveSample] = Field(default=[], max_length=100)


class LiveEnd(BaseModel):
    type: Literal["end"]
    started_at: str = Field(min_length=1, max_length=40)
    reason: Literal["finished", "exited"]


_message = TypeAdapter(Annotated[LiveUpdate | LiveEnd, Field(discriminator="type")])


async def _authenticate(ws: WebSocket) -> CurrentUser | None:
    """The user named by the socket's first message, or None after closing it."""
    try:
        first = await asyncio.wait_for(ws.receive_json(), AUTH_TIMEOUT_S)
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=str(first["token"]))
        return await run_in_threadpool(get_current_user, creds)
    except WebSocketDisconnect:
        return None
    except (TimeoutError, HTTPException, KeyError, TypeError, ValueError):
        await ws.close(WS_UNAUTHORIZED, "Not logged in")
        return None


@router.websocket("/live/{patient_id}/publish")
async def publish(ws: WebSocket, patient_id: str):
    await ws.accept()
    user = await _authenticate(ws)
    if user is None:
        return
    if user.role != "patient" or user.id != patient_id:
        await ws.close(WS_FORBIDDEN, "You can only share your own session")
        return
    await ws.send_json({"ok": True})
    try:
        while True:
            event = _message.validate_python(await asyncio.wait_for(ws.receive_json(), IDLE_TIMEOUT_S))
            if isinstance(event, LiveUpdate):
                live_hub.update(patient_id, event.model_dump(exclude={"type"}))
            else:
                live_hub.end(patient_id, event.started_at, event.reason)
    except WebSocketDisconnect:
        pass  # without an end, the hub calls the session lost unless the patient reconnects first
    except TimeoutError:
        await ws.close()
    except (KeyError, ValueError):  # not JSON, or not a live-session message (ValidationError is a ValueError)
        await ws.close(WS_INVALID, "Not a live-session message")


async def event_stream(patient_ids: list[str]):
    sub = live_hub.subscribe(patient_ids)
    try:
        yield ": watching\n\n"
        quiet = 0.0
        while not sub.closed:
            event = await sub.get(TICK_S)
            if event is not None:
                quiet = 0.0
                yield f"data: {json.dumps(event, separators=(',', ':'))}\n\n"
                continue
            live_hub.reap()  # a lost patient's end lands in the queue for the next turn
            quiet += TICK_S
            if quiet >= KEEPALIVE_S:
                quiet = 0.0
                yield ": keep-alive\n\n"
    finally:
        live_hub.unsubscribe(sub)


@router.get("/live/watch", response_class=StreamingResponse, summary="Stream the listed patients' live sessions (text/event-stream)")
async def watch(
    patient_id: Annotated[list[str], Query(min_length=1, max_length=MAX_WATCHED)],
    user: CurrentUser = Depends(get_current_user),
):
    ids = list(dict.fromkeys(patient_id))
    allowed = await run_in_threadpool(lambda: all(can_view_patient(user.id, pid) for pid in ids))
    if not allowed:
        raise HTTPException(403, "You can't view one of these patients")
    return StreamingResponse(
        event_stream(ids),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )

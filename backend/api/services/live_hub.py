"""In-memory pub/sub for live sessions: a patient's angles, reps and form cues,
fanned out to the therapists watching them while they exercise.

Keyed by patient id. The patient's session screen publishes an `update` every
~250 ms (api/data/live.py validates it) and an `end` when they finish,
leave, or stop because it hurts. Subscribers get a snapshot of every session
already under way, then each event as it arrives. A patient who goes quiet
(tab closed, network gone) is ended as "lost" after STALE_AFTER_S.

Everything lives in this process's memory, so the API must run as a single
worker: with several, a patient could publish to one and the therapist listen
on another.
"""
import asyncio
import time
from collections import deque
from typing import Callable

STALE_AFTER_S = 5.0
# ~20 s of angles at the screen's 10 Hz: enough for a therapist who opens the
# dashboard mid-session to see the rolling trace straight away.
BUFFER_SAMPLES = 200
# A reader this far behind has stalled; it's dropped and reconnects to a fresh snapshot.
QUEUE_MAX = 500


class Subscriber:
    """One open dashboard stream: the patients it watches and the events waiting for it."""

    def __init__(self, patient_ids: frozenset[str]) -> None:
        self.patient_ids = patient_ids
        self.queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=QUEUE_MAX)
        self.closed = False

    def put(self, event: dict) -> None:
        try:
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            self.closed = True

    async def get(self, timeout: float) -> dict | None:
        """The next event, or None if nothing arrived within `timeout` seconds."""
        try:
            return await asyncio.wait_for(self.queue.get(), timeout)
        except TimeoutError:
            return None


class LiveSession:
    def __init__(self, patient_id: str, started_at: str) -> None:
        self.patient_id = patient_id
        self.started_at = started_at
        self.latest: dict = {}
        self.samples: deque[dict] = deque(maxlen=BUFFER_SAMPLES)
        self.last_seen = 0.0

    def snapshot(self) -> dict:
        """The session so far as one update, for a subscriber who just joined."""
        return {**self.latest, "samples": list(self.samples)}


class LiveHub:
    def __init__(self, stale_after_s: float = STALE_AFTER_S, clock: Callable[[], float] = time.monotonic) -> None:
        self.stale_after_s = stale_after_s
        self.clock = clock
        self._sessions: dict[str, LiveSession] = {}
        # The session each patient last ended on purpose, so a batch that was
        # already in flight can't bring it back to life.
        self._ended: dict[str, str] = {}
        self._subscribers: set[Subscriber] = set()

    def is_live(self, patient_id: str) -> bool:
        return patient_id in self._sessions

    def update(self, patient_id: str, update: dict) -> None:
        """A batch from the patient: the session's plan and progress plus the angles since the last one."""
        self.reap()
        started_at = update["started_at"]
        if self._ended.get(patient_id) == started_at:
            return
        session = self._sessions.get(patient_id)
        # A new start time is a new session, even if the last one never sent its end.
        if session is None or session.started_at != started_at:
            session = self._sessions[patient_id] = LiveSession(patient_id, started_at)
        session.last_seen = self.clock()
        event = {**update, "type": "update", "patient_id": patient_id}
        session.latest = {k: v for k, v in event.items() if k != "samples"}
        session.samples.extend(update.get("samples", []))
        self._publish(event)

    def end(self, patient_id: str, started_at: str, reason: str) -> None:
        """The patient finished, left or stopped for pain. An end for an older session than the live one is ignored."""
        self._ended[patient_id] = started_at
        session = self._sessions.get(patient_id)
        if session is None or session.started_at != started_at:
            return
        self._close(session, reason)

    def reap(self) -> None:
        """End every session whose patient has gone quiet. Cheap, so it runs on every batch and idle tick."""
        now = self.clock()
        for session in [s for s in self._sessions.values() if now - s.last_seen > self.stale_after_s]:
            self._close(session, "lost")

    def subscribe(self, patient_ids: list[str]) -> Subscriber:
        """Start watching these patients. Sessions already under way arrive first, as snapshots."""
        self.reap()
        sub = Subscriber(frozenset(patient_ids))
        for pid in sub.patient_ids:
            if pid in self._sessions:
                sub.put(self._sessions[pid].snapshot())
        self._subscribers.add(sub)
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        self._subscribers.discard(sub)

    def _close(self, session: LiveSession, reason: str) -> None:
        del self._sessions[session.patient_id]
        self._publish({"type": "end", "patient_id": session.patient_id, "started_at": session.started_at, "reason": reason})

    def _publish(self, event: dict) -> None:
        for sub in list(self._subscribers):
            if event["patient_id"] in sub.patient_ids:
                sub.put(event)
            if sub.closed:
                self._subscribers.discard(sub)


live_hub = LiveHub()

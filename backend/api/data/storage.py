"""GET /therapist/{id}/storage: what Tiger Data is doing with the angle frames, for the clinic dashboard's Data card.

★ Tiger Data. Everything here comes from TimescaleDB's own catalog views and the hypertable
itself, so the numbers on screen are the database's, not ours:
  samples, sessions          rows in the angle_samples hypertable and the sessions table
  chunks, compressed_chunks  the hypertable's time chunks, and how many the compression policy has
                             turned into columnstore (schema.sql compresses chunks older than a day)
  bytes_before, bytes_after  the compressed chunks' size before and after (hypertable_compression_stats)
  rollup_minutes             rows in the session_angle_1m continuous aggregate
  rollup_realtime            the aggregate answers with minutes not yet materialized (materialized_only = false)
  rollup_policy              a refresh policy materializes it on a schedule
  trace_ms, trace_points     how long the 10 Hz replay trace of this therapist's newest session took to
                             read, and how many points came back: the same query the replay uses
"""
import time
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import CurrentUser, require_therapist_self

from . import queries as q

router = APIRouter(tags=["storage"])


class StorageStats(BaseModel):
    samples: int
    sessions: int
    chunks: int
    compressed_chunks: int
    bytes_before: Optional[int] = None
    bytes_after: Optional[int] = None
    rollup_minutes: int
    rollup_realtime: bool
    rollup_policy: bool
    trace_session_id: Optional[str] = None
    trace_ms: Optional[float] = None
    trace_points: Optional[int] = None


def storage_stats(conn, therapist_id: str) -> StorageStats:
    # An exact count: approximate_row_count goes stale once a chunk is compressed.
    samples = conn.execute("SELECT count(*) AS n FROM angle_samples").fetchone()["n"]
    sessions = conn.execute("SELECT count(*) AS n FROM sessions").fetchone()["n"]
    comp = conn.execute("""SELECT total_chunks, number_compressed_chunks,
                                  before_compression_total_bytes, after_compression_total_bytes
                           FROM hypertable_compression_stats('angle_samples')""").fetchone()
    rollup = conn.execute("SELECT count(*) AS n FROM session_angle_1m").fetchone()["n"]
    cagg = conn.execute("""SELECT materialized_only FROM timescaledb_information.continuous_aggregates
                           WHERE view_name = 'session_angle_1m'""").fetchone()
    # The jobs view names a refresh policy's job by its view, not its materialization hypertable.
    policy = conn.execute("""SELECT count(*) AS n FROM timescaledb_information.jobs
                             WHERE proc_name = 'policy_refresh_continuous_aggregate'
                               AND hypertable_name = 'session_angle_1m'""").fetchone()["n"]

    # Time the replay's own query on the therapist's newest session (their patients only).
    latest = conn.execute("""SELECT s.id FROM sessions s
                             JOIN therapist_patients tp ON tp.patient_id = s.patient_id
                             WHERE tp.therapist_id = %s ORDER BY s.started_at DESC LIMIT 1""",
                          (therapist_id,)).fetchone()
    trace_id = trace_ms = trace_points = None
    if latest:
        trace_id = latest["id"]
        t0 = time.perf_counter()
        trace_points = len(q.session_samples(conn, trace_id))
        trace_ms = round((time.perf_counter() - t0) * 1000, 1)

    return StorageStats(
        samples=int(samples or 0), sessions=int(sessions),
        chunks=int(comp["total_chunks"] or 0) if comp else 0,
        compressed_chunks=int(comp["number_compressed_chunks"] or 0) if comp else 0,
        bytes_before=comp["before_compression_total_bytes"] if comp else None,
        bytes_after=comp["after_compression_total_bytes"] if comp else None,
        rollup_minutes=int(rollup), rollup_realtime=bool(cagg and not cagg["materialized_only"]),
        rollup_policy=policy > 0,
        trace_session_id=trace_id, trace_ms=trace_ms, trace_points=trace_points,
    )


@router.get("/therapist/{therapist_id}/storage", response_model=StorageStats)
def get_storage(therapist_id: str, user: CurrentUser = Depends(require_therapist_self)):
    with q.connect() as conn:
        return storage_stats(conn, therapist_id)

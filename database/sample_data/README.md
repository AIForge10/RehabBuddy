# RehabBuddy sample data (backend + schema reference)

Dummy data that matches **exactly** what the frontend expects
(`frontend/src/api/client.ts` + `mock.ts`). Build the backend against this and the
frontend will work when `VITE_USE_MOCKS` is switched off.

## What's here
| File | What it is |
|---|---|
| `api_examples.json` | Every endpoint: URL, request body, response body (copy these shapes into Pydantic models) |
| `schema.sql` | Tables for Tiger Data. TEXT ids (`p-maria`, `t-lee`) to match the frontend |
| `tables/*.csv` | Demo rows: 1 therapist, 3 patients, 18 sessions, 8,710 angle samples, 1 red flag |
| `load.sql` | Loads all CSVs (re-runnable) + refreshes the continuous aggregate |
| `queries.sql` | The SQL behind each GET endpoint, incl. the Tiger Data hypertable queries |
| `generate.py` | Regenerates the CSVs + JSON (`python generate.py`) |

## Endpoints the frontend calls
| Method + path | Returns |
|---|---|
| `GET /patients/{id}/assignment` | `Assignment` (with nested `exercise`) |
| `GET /patients/{id}/overview` | `{patient, assignment, adherence_7d, sessions[], red_flags[], latest_summary}` |
| `GET /therapist/{id}/dashboard` | `{therapist_id, patients: Overview[], generated_at}` |
| `POST /sessions` | `{session_id}` |
| `GET /sessions/{id}/samples` | `[{time, angle}]`, oldest first, averaged to 10 Hz with `time_bucket` (the therapist's replay) |
| `POST /pain-check` | `{flagged, reply, flag_reason}`: flag if pain ≥ 7 or red-flag words |
| `POST /summary` | `{summary_text, week_start, is_fallback}` |
| `POST /translate` | `{text}` |

Demo ids: patient `p-maria` (Spanish), `p-james` (red flag), `p-aisha`; therapist `t-lee`.

## Load into Tiger Data
```bash
cd database/sample_data
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f load.sql
```
(No `psql`? Paste `schema.sql` into the Tiger console SQL editor, then use `brew install libpq`
for `load.sql`, because `\copy` needs psql. Or run `python database/sample_data/load_to_tiger.py`
from the repo root, which does both.)

`schema.sql` also makes the `session_angle_1m` continuous aggregate real-time and adds a policy
that materializes it every minute, so sessions saved by the app show up in it without a manual refresh.

## Proposed API additions
`POST /sessions` in `api_examples.json` includes 3 **proposed** fields not yet in the frontend's
`CreateSessionRequest`: `assignment_id`, `joint`, and **`angle_samples`**. The pose engine already
produces them (`pose.finish()`). `angle_samples` go into the `angle_samples` hypertable, which is
the core of the **Best Use of Tiger Data** prize, so the endpoint should insert them.

## Conventions
- Angles in degrees. Knee = flexion (straight leg = 0°, target 90°).
- `form_warnings` are codes: `not_deep_enough`, `too_fast`; the frontend turns them into text.
- Every AI endpoint must return a fallback on error (never 500 during the demo).

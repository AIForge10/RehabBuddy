"""Put the seeded demo patients back to exactly what database/sample_data/tables/*.csv says.

Rehearsing and testing on the live app leaves rows behind: a session recorded while trying
the camera, a plan left on the wrong joint, a summary generated twice. None of it shows on the
knee demo (a patient's history is filtered to their assigned joint), but it surfaces the moment
someone switches a plan on stage. Run this before the freeze and again before judging so the
dashboard shows only the story the seed tells.

    python scripts/reset_demo_data.py          # report what is extra, change nothing
    python scripts/reset_demo_data.py --yes    # delete the extras and restore the plans

Scope: ONLY the demo patients the seed defines (p-maria, p-james, p-aisha). Accounts that
signed up through the app are real people -- teammates, and anyone who tries it at the table --
so their profiles and their sessions are never touched, only listed at the end. Rows the seed
itself defines are never touched either, so this is safe to re-run.

Reads DATABASE_URL from the root .env, the same as database/sample_data/load_to_tiger.py.
"""
import argparse
import csv
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TABLES = ROOT / "database/sample_data/tables"
sys.path.insert(0, str(ROOT / "backend"))

from api.auth.db import connect  # noqa: E402  (needs the path above)


def seed(name: str) -> list[dict]:
    with open(TABLES / f"{name}.csv", newline="") as f:
        return list(csv.DictReader(f))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--yes", action="store_true", help="actually delete; without it this only reports")
    args = ap.parse_args()

    seed_sessions = {r["id"] for r in seed("sessions")}
    seed_summaries = {r["id"] for r in seed("ai_summaries")}
    demo_patients = [r["id"] for r in seed("profiles") if r["role"] == "patient"]
    plans = {r["id"]: r for r in seed("assignments")}
    changes: list[str] = []

    print(f"Demo patients: {', '.join(demo_patients)}\n")

    with connect() as conn:
        # Extras belonging to a demo patient. Scoped by patient_id on purpose: a session from
        # someone's own signed-up account is their data, not demo clutter.
        extra_sessions = [r["id"] for r in conn.execute(
            "SELECT id FROM sessions WHERE patient_id = ANY(%s)", (demo_patients,)).fetchall()
            if r["id"] not in seed_sessions]
        extra_summaries = [r["id"] for r in conn.execute(
            "SELECT id FROM ai_summaries WHERE patient_id = ANY(%s)", (demo_patients,)).fetchall()
            if r["id"] not in seed_summaries]
        # A plan edited during a rehearsal leaves the patient on the wrong joint, which also
        # hides their whole seeded history (overview filters sessions to the assigned joint).
        drifted = []
        for a in conn.execute("""SELECT id, exercise_id, target_angle, reps, times_per_week FROM assignments
                                 WHERE id = ANY(%s)""", (list(plans),)).fetchall():
            want = plans[a["id"]]
            if (a["exercise_id"] != want["exercise_id"]
                    or float(a["target_angle"]) != float(want["target_angle"])
                    or int(a["reps"]) != int(want["reps"])
                    or int(a["times_per_week"]) != int(want["times_per_week"])):
                drifted.append((a["id"], a["exercise_id"], want))

        for label, items in (("extra sessions", extra_sessions), ("extra summaries", extra_summaries)):
            print(f"{label}: {len(items)}")
            for i in items:
                print("   ", i)
        print(f"plans off the seed: {len(drifted)}")
        for aid, now, want in drifted:
            print(f"    {aid}: {now} -> {want['exercise_id']} "
                  f"({want['target_angle']}°, {want['reps']} reps, {want['times_per_week']}x/wk)")

        if not (extra_sessions or extra_summaries or drifted):
            print("\nDemo patients already match the seed. Nothing to do.")
            return report_real_accounts(conn, demo_patients)
        if not args.yes:
            print("\nReport only. Re-run with --yes to apply.")
            return report_real_accounts(conn, demo_patients)

        if extra_sessions:
            for t, col in (("angle_samples", "session_id"), ("pain_checkins", "session_id"), ("sessions", "id")):
                conn.execute(f"DELETE FROM {t} WHERE {col} = ANY(%s)", (extra_sessions,))
            changes.append(f"{len(extra_sessions)} session(s) and their samples/pain checks")
        if extra_summaries:
            conn.execute("DELETE FROM ai_summaries WHERE id = ANY(%s)", (extra_summaries,))
            changes.append(f"{len(extra_summaries)} summary/summaries")
        for aid, _now, want in drifted:
            conn.execute("""UPDATE assignments SET exercise_id = %s, target_angle = %s, reps = %s,
                            times_per_week = %s WHERE id = %s""",
                         (want["exercise_id"], want["target_angle"], want["reps"],
                          want["times_per_week"], aid))
        if drifted:
            changes.append(f"{len(drifted)} plan(s) restored")

    # Re-read on a fresh connection so the checks below see committed state.
    with connect() as conn:
        left = [r["id"] for r in conn.execute(
            "SELECT id FROM sessions WHERE patient_id = ANY(%s)", (demo_patients,)).fetchall()
            if r["id"] not in seed_sessions]
        kept = conn.execute("SELECT count(*) AS n FROM sessions WHERE id = ANY(%s)",
                            (list(seed_sessions),)).fetchone()["n"]
        orphans = conn.execute("""SELECT count(*) AS n FROM angle_samples a
                                  WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = a.session_id)"""
                               ).fetchone()["n"]

        print("\nRemoved: " + "; ".join(changes))
        print(f"Seed sessions intact: {kept} of {len(seed_sessions)} | "
              f"extras left: {len(left)} | orphan samples: {orphans}")
        if kept != len(seed_sessions) or left or orphans:
            print("Demo data is NOT clean -- reload it: python database/sample_data/load_to_tiger.py --reset")
            return 1
        print("Demo patients match the seed.")
        return report_real_accounts(conn, demo_patients)


def report_real_accounts(conn, demo_patients: list[str]) -> int:
    """List accounts that signed up through the app. Listed only -- never deleted."""
    seeded = {r["id"] for r in seed("profiles")}
    rows = [r for r in conn.execute("SELECT id, full_name, role FROM profiles ORDER BY id").fetchall()
            if r["id"] not in seeded]
    if rows:
        print(f"\nSigned-up accounts, left alone ({len(rows)}):")
        for r in rows:
            n = conn.execute("SELECT count(*) AS n FROM sessions WHERE patient_id = %s", (r["id"],)).fetchone()["n"]
            print(f"    {r['id']}  {r['full_name']} ({r['role']}, {n} session(s))")
        print("    Real people, not demo clutter. Remove one only if its owner asks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

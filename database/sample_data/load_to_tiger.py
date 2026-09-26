"""Load RehabBuddy schema + demo data into Tiger Data. No psql needed.

Run from the repo root:
    python database/sample_data/load_to_tiger.py --check     # connect + list existing tables only
    python database/sample_data/load_to_tiger.py             # create tables + load demo data
    python database/sample_data/load_to_tiger.py --reset     # DROP the RehabBuddy tables first, then load

Reads DATABASE_URL from the root .env.
"""
import argparse
import csv
import pathlib
import re
import sys

import psycopg

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TABLES = ["profiles", "therapist_patients", "exercises", "assignments",
          "sessions", "angle_samples", "pain_checkins", "ai_summaries"]


def database_url() -> str:
    env = ROOT / ".env"
    if not env.exists():
        sys.exit("No .env in repo root. Create it and add DATABASE_URL=...")
    m = re.search(r"^DATABASE_URL=(.+)$", env.read_text(), re.M)
    if not m or not m.group(1).strip():
        sys.exit("DATABASE_URL missing in .env")
    url = m.group(1).strip().strip('"').strip("'")
    if "<" in url or "PASSWORD" in url:
        sys.exit("DATABASE_URL still has a placeholder password. Put the real one in .env")
    return url


def statements(sql: str):
    no_comments = re.sub(r"--[^\n]*", "", sql)   # strip all -- comments (incl. inline)
    return [s.strip() for s in no_comments.split(";") if s.strip()]


def existing_tables(conn):
    rows = conn.execute(
        "select table_name from information_schema.tables "
        "where table_schema='public' and table_type='BASE TABLE' order by 1").fetchall()
    return [r[0] for r in rows]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()

    with psycopg.connect(database_url(), autocommit=True) as conn:
        ver = conn.execute("select version()").fetchone()[0]
        ts = conn.execute("select extversion from pg_extension where extname='timescaledb'").fetchone()
        print(f"Connected ✅  {ver[:30]}...  TimescaleDB: {ts[0] if ts else 'NOT INSTALLED'}")
        tables = existing_tables(conn)
        print("Existing tables:", tables or "(none)")
        if args.check:
            return

        clash = [t for t in TABLES if t in tables]
        if clash and not args.reset:
            # Only safe to continue if the existing tables are ours (TEXT ids)
            col = conn.execute(
                "select data_type from information_schema.columns "
                "where table_name='profiles' and column_name='id'").fetchone()
            if col and col[0] != "text":
                sys.exit(f"Tables {clash} already exist with a different design (profiles.id is {col[0]}).\n"
                         "Agree with the backend owner which schema to use. To replace them: --reset")

        prof_cols = [r[0] for r in conn.execute(
            "select column_name from information_schema.columns where table_name='profiles'").fetchall()]
        if prof_cols and "password_hash" not in prof_cols and not args.reset:
            sys.exit("profiles table is from an older version (no login columns). Re-run with --reset")

        if args.reset:
            conn.execute("DROP MATERIALIZED VIEW IF EXISTS session_angle_1m CASCADE")
            for t in reversed(TABLES):
                conn.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
            print("Dropped old RehabBuddy tables")

        for stmt in statements((HERE / "schema.sql").read_text()):
            conn.execute(stmt)
        print("Schema ready ✅ (tables + angle_samples hypertable + real-time continuous aggregate, "
              "materialized every minute)")

        conn.execute("TRUNCATE " + ", ".join(reversed(TABLES)) + " CASCADE")
        for t in TABLES:
            path = HERE / "tables" / f"{t}.csv"
            with open(path, newline="", encoding="utf-8") as f:
                reader = csv.reader(f)
                cols = next(reader)
                with conn.cursor() as cur:
                    with cur.copy(f"COPY {t} ({', '.join(cols)}) FROM STDIN") as cp:
                        for row in reader:
                            cp.write_row([None if v == "" and c in ("pain_score",) else v
                                          for c, v in zip(cols, row)])
            n = conn.execute(f"select count(*) from {t}").fetchone()[0]
            print(f"  {t:<20} {n:>6} rows")

        conn.execute("CALL refresh_continuous_aggregate('session_angle_1m', NULL, NULL)")
        print("Continuous aggregate refreshed ✅")

        # Compress the demo data's older chunks now rather than waiting for the hourly job,
        # so the storage numbers (GET /therapist/{id}/storage) show it straight away.
        try:
            done = conn.execute(
                "SELECT count(compress_chunk(c)) FROM show_chunks('angle_samples', older_than => INTERVAL '1 day') c"
            ).fetchone()[0]
            print(f"Compressed {done} chunk(s) older than a day ✅")
        except psycopg.Error as e:
            print(f"Compression skipped: {e}")

        flag = conn.execute("select count(*) from pain_checkins where flagged").fetchone()[0]
        trend = conn.execute(
            "select time_bucket('1 day', a.time)::date, max(a.angle) from angle_samples a "
            "join sessions s on s.id = a.session_id where s.patient_id='p-maria' "
            "group by 1 order by 1").fetchall()
        print(f"Red flags: {flag}  |  Maria daily peak (from hypertable): "
              + ", ".join(f"{d:%m-%d} {float(v):.0f}°" for d, v in trend))
        print("\nDone ✅  Tiger Data is loaded.")


if __name__ == "__main__":
    main()

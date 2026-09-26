import os
import sys
import psycopg
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set in .env")
    sys.exit(1)

def run_sql_file(filepath: str):
    print(f"Executing {filepath}...")
    
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return

    with open(filepath, "r") as f:
        sql = f.read()

    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute(sql)

    print(f"{filepath} applied successfully.")

def migrate():
    run_sql_file("database/schema.sql")

def seed():
    run_sql_file("database/seed.sql")

def reset():
    print("Resetting database...")
    migrate()
    seed()
    print("Database fully reset and seeded for demo!")

def verify():
    with psycopg.connect(DATABASE_URL) as conn:
        result = conn.execute(
            "SELECT hypertable_name FROM timescaledb_information.hypertables;"
        ).fetchall()
        print(f"Active Hypertables in Tiger Data: {[r[0] for r in result]}")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    if cmd == "migrate":
        migrate()
    elif cmd == "seed":
        seed()
    elif cmd == "reset":
        reset()
    elif cmd == "verify":
        verify()
    else:
        print("Usage: python database/manage.py [migrate | seed | reset | verify]")
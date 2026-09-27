"""Two test modules run against a real database: whatever DATABASE_URL points at, which in the
root .env is the live demo on Tiger Data. test_data_routes.py writes to it (a Maria session with
a pain-8 red flag, two sign-ups, Gemini summaries) and cleans up only if every step gets that far.
So they run only when asked for, against a database you mean them to touch:

    RUN_DB_TESTS=1 python -m pytest
"""
import os

collect_ignore = [] if os.environ.get("RUN_DB_TESTS") == "1" else ["test_auth_access.py", "test_data_routes.py"]

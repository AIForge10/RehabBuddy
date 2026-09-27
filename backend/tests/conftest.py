"""Two test modules run against a real database: whatever DATABASE_URL points at, which in the
root .env is the live demo on Tiger Data. test_data_routes.py writes to it (a Maria session with
a pain-8 red flag, two sign-ups, Gemini summaries) and cleans up only if every step gets that far.
So they run only when asked for, against a database you mean them to touch:

    RUN_DB_TESTS=1 python -m pytest
"""
import os
import pathlib
import sys

# `import api` works from backend/ (pytest puts the rootdir first), but not from the repo
# root. It used to, only because the two modules below happened to be collected first and
# each began with this insert; ignoring them took the path with them. Do it here instead,
# so `pytest` and `pytest backend/tests` both work from either directory.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

collect_ignore = [] if os.environ.get("RUN_DB_TESTS") == "1" else ["test_auth_access.py", "test_data_routes.py"]

"""Tiny DB helper for auth (uses DATABASE_URL from .env)."""
import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from . import security  # noqa: F401  (loads .env)


@contextmanager
def connect():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set in .env")
    with psycopg.connect(url, row_factory=dict_row) as conn:
        yield conn

"""Configuration for the Academy runner.

All values come from the environment so the container can be started without
editing code. Defaults are safe for the local Compose network only.
"""
from __future__ import annotations

import os
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# Mounted read-only authored content (content-samples) with exercise manifests.
CONTENT_DIR = Path(os.environ.get("ACADEMY_CONTENT_DIR", "/content"))

# Durable, app-owned progress store. Deliberately a separate SQLite file on its
# own volume: learner progress must survive exercise Reset/Restart and must not
# depend on the disposable MySQL exercise schemas.
PROGRESS_DB_PATH = Path(
    os.environ.get("ACADEMY_PROGRESS_DB", "/data/academy_progress.sqlite3")
)
PROGRESS_SCHEMA_VERSION = 1

# MySQL connection (internal Docker network only; never published to the host).
DB_HOST = os.environ.get("ACADEMY_DB_HOST", "academy-mysql")
DB_PORT = _int("ACADEMY_DB_PORT", 3306)
ADMIN_USER = os.environ.get("ACADEMY_DB_ADMIN_USER", "academy_admin")
ADMIN_PASSWORD = os.environ.get("ACADEMY_DB_ADMIN_PASSWORD", "")
CONTROL_SCHEMA = os.environ.get("ACADEMY_CONTROL_SCHEMA", "academy_control")

# Shared password for the per-exercise restricted users. Internal-only; the
# learner already has full rights on the disposable exercise schema.
EXERCISE_PASSWORD = os.environ.get("ACADEMY_EXERCISE_PASSWORD", "academy-local-lab")

# Server-side defaults mirrored in docs for charset/collation/sql_mode/timezone.
DB_CHARSET = "utf8mb4"
DB_COLLATION = "utf8mb4_0900_ai_ci"
SERVER_TIMEZONE = "UTC"
DTO_ISOLATION_LEVEL = "repeatable read"

# Resource caps for learner submissions.
SQL_MAX_SOURCE_BYTES = _int("ACADEMY_SQL_MAX_BYTES", 20_000)
SQL_TIMEOUT_SECONDS = _int("ACADEMY_SQL_TIMEOUT_SECONDS", 8)
SQL_MAX_ROWS = _int("ACADEMY_SQL_MAX_ROWS", 500)
ORM_MAX_SOURCE_BYTES = _int("ACADEMY_ORM_MAX_BYTES", 40_000)
ORM_TIMEOUT_SECONDS = _int("ACADEMY_ORM_TIMEOUT_SECONDS", 12)
ORM_MAX_ROWS = _int("ACADEMY_ORM_MAX_ROWS", 500)

# Progressive hints: a Mastery challenge deliberately exposes fewer hints than
# the introductory levels, regardless of how many are authored.
MASTERY_MAX_HINTS = _int("ACADEMY_MASTERY_MAX_HINTS", 1)

CONTROL_PORT = _int("ACADEMY_CONTROL_PORT", 8200)

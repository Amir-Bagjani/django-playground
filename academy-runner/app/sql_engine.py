"""SQL execution and evaluation for the Academy lab.

Learner SQL runs as the exercise's restricted MySQL user against the
disposable exercise schema. Safety comes from the schema-scoped grants, a
statement size cap, ``MAX_EXECUTION_TIME`` and a socket read timeout — never
from parsing or pattern-matching the SQL text.
"""
from __future__ import annotations

import threading
import time
from typing import Any

from pymysql.err import MySQLError, OperationalError

from . import checks, config
from .db import DbUnavailable, learner_connection
from .exercises import Spec
from .normalize import normalize_rows

# Serializes submissions and reset for a single-user local lab. RLock because
# ``check`` re-enters ``_run`` for the anti-hardcode probe.
LOCK = threading.RLock()

TIMEOUT_CODES = {3024, 2013, 1205}


def _result(status: str, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": status,
        "columns": [],
        "rows": [],
        "rowCount": 0,
        "truncated": False,
        "affectedRows": None,
        "durationMs": 0,
        "error": None,
    }
    payload.update(overrides)
    return payload


def _run(spec: Spec, source: str) -> dict[str, Any]:
    """Execute one statement and return a normalized result payload."""
    start = time.monotonic()
    connection = None
    try:
        connection = learner_connection(
            spec.schema,
            spec.user,
            config.EXERCISE_PASSWORD,
            read_timeout=config.SQL_TIMEOUT_SECONDS + 3,
        )
        with connection.cursor() as cursor:
            cursor.execute(
                "SET SESSION max_execution_time = %s",
                (config.SQL_TIMEOUT_SECONDS * 1000,),
            )
            cursor.execute(source)
            duration = int((time.monotonic() - start) * 1000)
            if cursor.description:
                columns = [description[0] for description in cursor.description]
                fetched = cursor.fetchmany(config.SQL_MAX_ROWS + 1)
                truncated = len(fetched) > config.SQL_MAX_ROWS
                rows = normalize_rows([list(row) for row in fetched[: config.SQL_MAX_ROWS]])
                return _result(
                    "ok",
                    columns=columns,
                    rows=rows,
                    rowCount=len(rows),
                    truncated=truncated,
                    durationMs=duration,
                )
            return _result("ok", affectedRows=max(cursor.rowcount, 0), durationMs=duration)
    except OperationalError as exc:
        code = exc.args[0] if exc.args else None
        status = "timeout" if code in TIMEOUT_CODES else "error"
        return _result(status, durationMs=int((time.monotonic() - start) * 1000), error=str(exc))
    except MySQLError as exc:
        return _result("error", durationMs=int((time.monotonic() - start) * 1000), error=str(exc))
    finally:
        if connection is not None:
            try:
                connection.close()
            except MySQLError:  # pragma: no cover - defensive
                pass


def _too_large(source: str) -> bool:
    return len(source.encode("utf-8")) > config.SQL_MAX_SOURCE_BYTES


def execute(spec: Spec, source: str) -> dict[str, Any]:
    source = source or ""
    if not source.strip():
        return _result("error", error="پرس‌وجو خالی است. یک دستور SELECT بنویس.")
    if _too_large(source):
        return _result("error", error="متن پرس‌وجو از حد مجاز بزرگ‌تر است.")
    with LOCK:
        return _run(spec, source)


def check(spec: Spec, source: str) -> dict[str, Any]:
    """Evaluate a submission and return the structured PRD-03 contract."""
    with LOCK:
        return checks.build_payload(
            spec,
            source,
            lambda text: _run(spec, text),
            max_bytes=config.SQL_MAX_SOURCE_BYTES,
            empty_message="پرس‌وجو خالی است. یک دستور SELECT بنویس.",
            too_large_message="متن پرس‌وجو از حد مجاز بزرگ‌تر است.",
        )

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

import pymysql
from pymysql.err import MySQLError, OperationalError

from . import config, seeds
from .db import DbUnavailable, learner_connection
from .exercises import Spec, get_public
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


def _too_large(source: str) -> bool:
    return len(source.encode("utf-8")) > config.SQL_MAX_SOURCE_BYTES


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


def execute(spec: Spec, source: str) -> dict[str, Any]:
    source = source or ""
    if not source.strip():
        return _result("error", error="پرس‌وجو خالی است. یک دستور SELECT بنویس.")
    if _too_large(source):
        return _result("error", error="متن پرس‌وجو از حد مجاز بزرگ‌تر است.")
    with LOCK:
        return _run(spec, source)


def _criteria_defs(spec: Spec) -> list[dict]:
    public = get_public(spec.id) or {}
    return list(public.get("criteria", []))


def check(spec: Spec, source: str) -> dict[str, Any]:
    defs = _criteria_defs(spec)
    ids = [c["id"] for c in defs]

    def payload(
        passed: bool,
        outcome: dict[str, str],
        run: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        criteria = [
            {
                "id": c["id"],
                "description_fa": c["description_fa"],
                "passed": outcome.get(c["id"], False),
            }
            for c in defs
        ]
        run = run or _result("error")
        return {
            "status": run["status"],
            "passed": passed,
            "criteria": criteria,
            "columns": run["columns"],
            "rows": run["rows"],
            "rowCount": run["rowCount"],
            "truncated": run["truncated"],
            "durationMs": run["durationMs"],
            "error": error if error is not None else run["error"],
        }

    source = source or ""
    if not source.strip():
        return payload(False, {}, error="پرس‌وجو خالی است.")
    if _too_large(source):
        return payload(False, {}, error="متن پرس‌وجو از حد مجاز بزرگ‌تر است.")

    with LOCK:
        run = _run(spec, source)
        if run["status"] != "ok":
            return payload(False, {}, run=run)

        columns = [column.lower() for column in run["columns"]]
        columns_ok = columns == ["name", "price"]
        rows_ok = run["rows"] == seeds.EXPECTED_ROWS

        # Anti-hardcode: inject a hidden row and require the query to reflect it.
        data_driven_ok = False
        try:
            seeds.insert_sentinel(spec.schema)
            probe = _run(spec, source)
            data_driven_ok = (
                probe["status"] == "ok"
                and probe["rows"] == seeds.EXPECTED_ROWS_WITH_SENTINEL
            )
        finally:
            try:
                seeds.remove_sentinel(spec.schema)
            except MySQLError:
                seeds.reset(spec)

        outcome = {
            "select-executes": True,
            "projected-columns": columns_ok,
            "filtered-ordered-rows": rows_ok,
            "data-driven": data_driven_ok,
        }
        passed = all(outcome.get(cid, False) for cid in ids)
        return payload(passed, outcome, run=run)

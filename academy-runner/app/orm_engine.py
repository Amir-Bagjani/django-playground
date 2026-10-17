"""ORM execution and evaluation for the Academy lab.

Learner Python never runs in the API process. Each submission is written to a
private temp file and executed by ``python -m app.orm_child`` with a hard
timeout, a minimal environment (no admin credentials) and the same disposable
schema as the SQL exercise. A Python/Django exception is a learner failure; a
database/connection failure is reported as ``system_error``.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
import uuid

from pymysql.err import MySQLError

from . import config, seeds
from .exercises import Spec, get_public
from .normalize import normalize_rows
from .sql_engine import LOCK

MARKER_PREFIX = "ACADEMY_RESULT_"
CONNECTION_ERROR_TYPES = {"OperationalError", "InterfaceError"}


def _result(status: str, **overrides) -> dict:
    payload = {
        "status": status,
        "columns": [],
        "rows": [],
        "rowCount": 0,
        "truncated": False,
        "affectedRows": None,
        "durationMs": 0,
        "error": None,
        "traceback": None,
    }
    payload.update(overrides)
    return payload


def _child_env(spec: Spec, nonce: str) -> dict[str, str]:
    return {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "PYTHONPATH": "/app",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
        "LANG": "C.UTF-8",
        "DJANGO_SETTINGS_MODULE": "app.orm_settings",
        "ACADEMY_DB_HOST": config.DB_HOST,
        "ACADEMY_DB_PORT": str(config.DB_PORT),
        "ACADEMY_ORM_SCHEMA": spec.schema,
        "ACADEMY_ORM_USER": spec.user,
        "ACADEMY_ORM_PASSWORD": config.EXERCISE_PASSWORD,
        "ACADEMY_ORM_NONCE": nonce,
        "ACADEMY_ORM_CPU_SECONDS": str(config.ORM_TIMEOUT_SECONDS + 1),
    }


def _parse_output(stdout: str, nonce: str) -> dict | None:
    prefix = f"{MARKER_PREFIX}{nonce}:"
    for line in reversed(stdout.splitlines()):
        if line.startswith(prefix):
            import json

            try:
                return json.loads(line[len(prefix):])
            except json.JSONDecodeError:
                return None
    return None


def _run(spec: Spec, source: str) -> dict:
    nonce = uuid.uuid4().hex
    handle, path = tempfile.mkstemp(prefix="academy_learner_", suffix=".py", dir="/tmp")
    with os.fdopen(handle, "w", encoding="utf-8") as file:
        file.write(source)

    start = time.monotonic()
    try:
        try:
            process = subprocess.run(
                [sys.executable, "-m", "app.orm_child", path],
                cwd="/app",
                env=_child_env(spec, nonce),
                capture_output=True,
                text=True,
                timeout=config.ORM_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return _result(
                "timeout",
                durationMs=int((time.monotonic() - start) * 1000),
                error="اجرای کد بیش از حد طول کشید و متوقف شد.",
            )
    finally:
        try:
            os.unlink(path)
        except OSError:  # pragma: no cover - defensive
            pass

    duration = int((time.monotonic() - start) * 1000)
    payload = _parse_output(process.stdout, nonce)
    if payload is None:
        tail = (process.stderr or "").strip().splitlines()
        detail = tail[-1] if tail else "بدون خروجی معتبر از اجرای کد."
        return _result("error", durationMs=duration, error=f"اجرای کد ناموفق بود: {detail}")

    if not payload.get("ok"):
        error_type = payload.get("errorType", "")
        status = "system_error" if error_type in CONNECTION_ERROR_TYPES else "error"
        return _result(
            status,
            durationMs=duration,
            error=payload.get("error") or error_type,
            traceback=payload.get("traceback"),
        )

    rows = normalize_rows([list(row) for row in payload.get("rows", [])[: config.ORM_MAX_ROWS]])
    return _result(
        "ok",
        columns=payload.get("columns", []),
        rows=rows,
        rowCount=len(rows),
        durationMs=duration,
    )


def execute(spec: Spec, source: str) -> dict:
    source = source or ""
    if not source.strip():
        return _result("error", error="کد خالی است. یک QuerySet بنویس و در result بگذار.")
    if len(source.encode("utf-8")) > config.ORM_MAX_SOURCE_BYTES:
        return _result("error", error="متن کد از حد مجاز بزرگ‌تر است.")
    with LOCK:
        return _run(spec, source)


def check(spec: Spec, source: str) -> dict:
    defs = list((get_public(spec.id) or {}).get("criteria", []))
    ids = [c["id"] for c in defs]

    def payload(passed: bool, outcome: dict[str, bool], run: dict, error: str | None = None) -> dict:
        criteria = [
            {
                "id": c["id"],
                "description_fa": c["description_fa"],
                "passed": outcome.get(c["id"], False),
            }
            for c in defs
        ]
        return {
            "status": run["status"],
            "passed": passed,
            "criteria": criteria,
            "columns": run["columns"],
            "rows": run["rows"],
            "rowCount": run["rowCount"],
            "durationMs": run["durationMs"],
            "error": error if error is not None else run["error"],
            "traceback": run["traceback"],
        }

    source = source or ""
    if not source.strip():
        return payload(False, {}, _result("error", error="کد خالی است."), error="کد خالی است.")
    if len(source.encode("utf-8")) > config.ORM_MAX_SOURCE_BYTES:
        return payload(False, {}, _result("error"), error="متن کد از حد مجاز بزرگ‌تر است.")

    with LOCK:
        run = _run(spec, source)
        if run["status"] != "ok":
            return payload(False, {}, run)

        columns = [column.lower() for column in run["columns"]]
        columns_ok = columns == ["name", "price"]
        rows_ok = run["rows"] == seeds.EXPECTED_ROWS

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
            "queryset-executes": True,
            "projected-columns": columns_ok,
            "filtered-ordered-rows": rows_ok,
            "data-driven": data_driven_ok,
        }
        passed = all(outcome.get(cid, False) for cid in ids)
        return payload(passed, outcome, run)

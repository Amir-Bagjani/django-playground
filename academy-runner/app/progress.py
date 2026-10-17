"""Durable learner progress store.

Progress is intentionally **not** stored in MySQL: the disposable exercise
schemas are dropped and recreated on Reset, and a MySQL outage must not lose or
reduce progress (PRD-03 AC6). It lives in a small app-owned SQLite file on its
own volume, keyed by stable ``exercise_id`` / ``lesson_id`` so lessons can be
reordered without invalidating history.

Guarantees implemented here:
* appending an attempt never overwrites an earlier pass;
* passes are keyed by ``(exercise_id, assessment_version)`` and kept as history;
* a pass recorded under an older assessment version keeps counting (flagged
  ``legacy`` for an explicit content-version notice) — never silently revoked.

Derived lesson status (``pending`` / ``in_progress`` / ``completed`` /
``mastered``) is computed from the registry plus stored passes, so module and
overall percentages can be derived without storing them.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config, exercises

_LOCK = threading.RLock()
SCHEMA_VERSION = config.PROGRESS_SCHEMA_VERSION

_DDL = (
    """
    CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exercise_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        level TEXT NOT NULL,
        assessment_version INTEGER NOT NULL,
        status TEXT NOT NULL,
        outcome TEXT NOT NULL,
        passed INTEGER NOT NULL,
        checks TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS passes (
        exercise_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        level TEXT NOT NULL,
        assessment_version INTEGER NOT NULL,
        passed_at TEXT NOT NULL,
        PRIMARY KEY (exercise_id, assessment_version)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS drafts (
        exercise_id TEXT PRIMARY KEY,
        graph TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
)


def _db_path() -> Path:
    # Read at call time so tests can point at a temporary file.
    return Path(config.PROGRESS_DB_PATH)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def _ensure_schema(connection: sqlite3.Connection) -> None:
    for statement in _DDL:
        connection.execute(statement)
    row = connection.execute(
        "SELECT value FROM meta WHERE key = 'schema_version'"
    ).fetchone()
    if row is None:
        connection.execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )
    connection.commit()


def schema_version() -> int:
    with _LOCK, _connect() as connection:
        _ensure_schema(connection)
        row = connection.execute(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        ).fetchone()
        return int(row["value"]) if row else SCHEMA_VERSION


def record_attempt(
    *,
    exercise_id: str,
    lesson_id: str,
    level: str,
    assessment_version: int,
    status: str,
    outcome: str,
    passed: bool,
    checks: list[dict[str, Any]],
) -> None:
    summary = [
        {"criterionId": check.get("criterionId"), "status": check.get("status")}
        for check in checks
    ]
    with _LOCK, _connect() as connection:
        _ensure_schema(connection)
        connection.execute(
            "INSERT INTO attempts (exercise_id, lesson_id, level, assessment_version, "
            "status, outcome, passed, checks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                exercise_id,
                lesson_id,
                level,
                assessment_version,
                status,
                outcome,
                1 if passed else 0,
                json.dumps(summary, ensure_ascii=False),
                _now(),
            ),
        )
        connection.commit()


def record_pass(
    *, exercise_id: str, lesson_id: str, level: str, assessment_version: int
) -> None:
    with _LOCK, _connect() as connection:
        _ensure_schema(connection)
        connection.execute(
            "INSERT OR IGNORE INTO passes (exercise_id, lesson_id, level, "
            "assessment_version, passed_at) VALUES (?, ?, ?, ?, ?)",
            (exercise_id, lesson_id, level, assessment_version, _now()),
        )
        connection.commit()


def save_draft(*, exercise_id: str, graph: str) -> None:
    """Persist the learner's in-progress ERD draft (best-effort auto-save).

    Drafts live in the same app-owned store as progress but are *separate* from
    passes: Reset clears a draft and never touches earned progress.
    """
    with _LOCK, _connect() as connection:
        _ensure_schema(connection)
        connection.execute(
            "INSERT INTO drafts (exercise_id, graph, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(exercise_id) DO UPDATE SET graph = excluded.graph, "
            "updated_at = excluded.updated_at",
            (exercise_id, graph, _now()),
        )
        connection.commit()


def get_draft(*, exercise_id: str) -> dict[str, Any] | None:
    with _LOCK, _connect() as connection:
        _ensure_schema(connection)
        row = connection.execute(
            "SELECT graph, updated_at FROM drafts WHERE exercise_id = ?", (exercise_id,)
        ).fetchone()
    if row is None:
        return None
    try:
        graph = json.loads(row["graph"])
    except json.JSONDecodeError:
        graph = None
    return {"graph": graph, "updatedAt": row["updated_at"]}


def clear_draft(*, exercise_id: str) -> None:
    with _LOCK, _connect() as connection:
        _ensure_schema(connection)
        connection.execute("DELETE FROM drafts WHERE exercise_id = ?", (exercise_id,))
        connection.commit()


def _passes(connection: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    """Latest (highest assessment version) pass per exercise."""
    rows = connection.execute(
        "SELECT exercise_id, level, assessment_version, passed_at FROM passes"
    ).fetchall()
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        current = latest.get(row["exercise_id"])
        if current is None or row["assessment_version"] > current["assessmentVersion"]:
            latest[row["exercise_id"]] = {
                "assessmentVersion": row["assessment_version"],
                "passedAt": row["passed_at"],
                "level": row["level"],
            }
    return latest


def _attempts(connection: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    rows = connection.execute(
        "SELECT exercise_id, status, outcome, passed, created_at FROM attempts "
        "ORDER BY id"
    ).fetchall()
    summary: dict[str, dict[str, Any]] = {}
    for row in rows:
        entry = summary.setdefault(
            row["exercise_id"],
            {"count": 0, "lastStatus": None, "lastOutcome": None, "learnerAttempts": 0},
        )
        entry["count"] += 1
        entry["lastStatus"] = row["status"]
        entry["lastOutcome"] = row["outcome"]
        if row["outcome"] in ("success", "validation_failed"):
            entry["learnerAttempts"] += 1
    return summary


def _lesson_states(connection: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    passes = _passes(connection)
    attempts = _attempts(connection)

    by_lesson: dict[str, list[exercises.Spec]] = {}
    for spec in exercises.all_specs():
        by_lesson.setdefault(spec.lesson_id, []).append(spec)

    states: dict[str, dict[str, Any]] = {}
    for lesson_id, specs in sorted(by_lesson.items()):
        exercise_states: dict[str, dict[str, Any]] = {}
        required_total = 0
        required_passed = 0
        mastery_total = 0
        mastery_passed = 0
        legacy = False
        any_learner_attempt = False

        for spec in specs:
            passed_info = passes.get(spec.id)
            passed = passed_info is not None
            passed_version = passed_info["assessmentVersion"] if passed_info else None
            exercise_legacy = bool(
                passed and passed_version is not None
                and passed_version < spec.validator_version
            )
            legacy = legacy or exercise_legacy
            attempt = attempts.get(spec.id)
            if attempt and attempt["learnerAttempts"] > 0:
                any_learner_attempt = True

            if spec.required_for_completion:
                required_total += 1
                if passed:
                    required_passed += 1
            if spec.level == "mastery":
                mastery_total += 1
                if passed:
                    mastery_passed += 1

            exercise_states[spec.id] = {
                "level": spec.level,
                "required": spec.required_for_completion,
                "passed": passed,
                "passedAssessmentVersion": passed_version,
                "currentAssessmentVersion": spec.validator_version,
                "legacy": exercise_legacy,
                "lastStatus": attempt["lastStatus"] if attempt else None,
                "lastOutcome": attempt["lastOutcome"] if attempt else None,
                "attempts": attempt["count"] if attempt else 0,
            }

        completed = required_total == 0 or required_passed == required_total
        # A lesson with no required exercises (only a mastery challenge) is not
        # "completed" until that challenge passes, so it can still be Mastered.
        if required_total == 0 and mastery_total > 0:
            completed = mastery_passed == mastery_total
        mastered = completed and mastery_total > 0 and mastery_passed == mastery_total

        if mastered:
            status = "mastered"
        elif completed:
            status = "completed"
        elif any_learner_attempt:
            status = "in_progress"
        else:
            status = "pending"

        states[lesson_id] = {
            "lessonId": lesson_id,
            "status": status,
            "completed": completed,
            "mastered": mastered,
            "legacy": legacy,
            "requiredTotal": required_total,
            "requiredPassed": required_passed,
            "masteryTotal": mastery_total,
            "masteryPassed": mastery_passed,
            "exercises": exercise_states,
        }
    return states


def snapshot() -> dict[str, Any]:
    """Full progress payload for the API and the UI."""
    with _LOCK, _connect() as connection:
        _ensure_schema(connection)
        lessons = _lesson_states(connection)
        attempt_rows = connection.execute("SELECT COUNT(*) AS n FROM attempts").fetchone()
        pass_rows = connection.execute("SELECT COUNT(*) AS n FROM passes").fetchone()
        totals = {
            "trackedLessons": len(lessons),
            "completed": sum(1 for s in lessons.values() if s["completed"]),
            "mastered": sum(1 for s in lessons.values() if s["mastered"]),
            "attempts": int(attempt_rows["n"]),
            "passes": int(pass_rows["n"]),
        }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "lessons": lessons,
        "totals": totals,
    }

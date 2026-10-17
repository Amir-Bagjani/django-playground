"""Project milestone evaluation (PRD-05).

Dispatches a milestone to the engine that matches its ``stage_kind`` and returns
the same structured payload contract the exercise engines use, so the UI and the
progress layer treat a milestone result exactly like an exercise result:

* ``erd`` — reuses the PRD-04 ERD engine (semantic graph checks);
* ``sql`` — runs the learner DDL script on a freshly reset disposable schema,
  then grades the real structure/rows read back from ``information_schema``;
* ``orm`` — runs Django ``makemigrations`` + ``migrate`` in a sandboxed child,
  then grades the real models and schema.

A milestone never passes on exact text: grading is on structure and behaviour,
several different designs pass, and criteria that cannot be decided by rules are
``needs_manual_review``. A failed attempt never earns a checkpoint; the caller
saves a checkpoint only when ``passed`` is true.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from typing import Any

from . import checks, config, db, erd_checks, project_db, project_sql, projects

MARKER_PREFIX = "ACADEMY_RESULT_"
_CONNECTION_ERROR_TYPES = {"OperationalError", "InterfaceError"}


# --- semantic name helpers (mirror the ERD engine's tolerance) ---------------


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def _singular(word: str) -> str:
    return word[:-1] if len(word) > 1 and word.endswith("s") else word


def _forms(name: str) -> set[str]:
    base = _norm(name)
    return {base, _singular(base)}


def _match_table(tables: dict[str, dict], key: str, aliases: tuple[str, ...]) -> tuple[str, dict] | None:
    wanted: set[str] = set()
    for token in (key, *aliases):
        wanted |= _forms(token)
    for name, meta in tables.items():
        if _forms(name) & wanted:
            return name, meta
    return None


_SCHEMA_EXPECTATIONS: dict[str, dict[str, Any]] = {
    "booking-schema": {
        "tables": (("rooms", ("room",)), ("bookings", ("booking", "reservation", "reservations"))),
        "foreign_key": ("bookings", "room_id", "rooms"),
        "not_null": (
            ("bookings", "room_id"),
            ("bookings", "guest_name"),
            ("bookings", "check_in"),
            ("bookings", "check_out"),
        ),
        "min_rows": {"rooms": 2, "bookings": 2},
    }
}


def _type_is(type_name: str, family: str) -> bool:
    mapping = {
        "text": ("CharField", "TextField", "SlugField", "EmailField"),
        "integer": ("IntegerField", "PositiveIntegerField", "BigIntegerField", "SmallIntegerField", "AutoField", "PositiveSmallIntegerField"),
        "temporal": ("DateField", "DateTimeField", "TimeField"),
    }
    return type_name in mapping.get(family, ())


# --- ERD stage ---------------------------------------------------------------


def _evaluate_erd(milestone, criteria: list[dict], hint_available: bool, workspace: dict) -> dict:
    graph = workspace.get("erd")
    if graph is None:
        graph = {"schema_version": 1, "entities": [], "relationships": [], "notes": ""}
    return erd_checks.build_payload(
        milestone.spec.engine_spec(),
        graph,
        task_id=milestone.spec.id,
        criteria=criteria,
        hint_available=hint_available,
    )


# --- SQL stage ---------------------------------------------------------------


def _evaluate_sql(milestone, criteria: list[dict], hint_available: bool, workspace: dict) -> dict:
    spec = milestone.spec
    engine_spec = spec.engine_spec()
    if spec.id not in _SCHEMA_EXPECTATIONS:
        return checks.system_error_payload(
            engine_spec,
            "برای این مرحله هنوز معیار ساختاری تعریف نشده است.",
            criteria=criteria,
            hint_available=hint_available,
        )
    source = workspace.get("sql") or ""
    if not source.strip():
        return checks.failure_payload(
            engine_spec,
            outcome="empty_source",
            message="پاسخ خالی است؛ ابتدا اسکریپت SQL خود را بنویس.",
            criteria=criteria,
            hint_available=hint_available,
        )
    if len(source.encode("utf-8")) > config.PROJECT_SQL_MAX_SOURCE_BYTES:
        return checks.failure_payload(
            engine_spec,
            outcome="too_large",
            message="متن پاسخ از حد مجاز بزرگ‌تر است.",
            criteria=criteria,
            hint_available=hint_available,
        )

    try:
        project_db.ensure_identity(spec.schema, spec.user)
        project_db.recreate_empty(spec.schema)
    except project_db.ProjectDbError as exc:
        return checks.failure_payload(
            engine_spec,
            outcome="runner_unavailable",
            message=str(exc),
            criteria=criteria,
            hint_available=hint_available,
        )

    run = project_sql.run_with_lock(spec.schema, spec.user, source)
    if run["status"] == "timeout":
        return checks.failure_payload(
            engine_spec, outcome="deadline_exceeded", message=run.get("error") or "", criteria=criteria, hint_available=hint_available
        )
    if run["status"] == "system_error":
        return checks.failure_payload(
            engine_spec, outcome="runner_unavailable", message=run.get("error") or "", criteria=criteria, hint_available=hint_available
        )
    if run["status"] != "ok":
        return checks.failure_payload(
            engine_spec, outcome="syntax_error", message=run.get("error") or "", criteria=criteria, hint_available=hint_available
        )

    try:
        structure = project_sql.introspect(spec.schema)
    except db.DbUnavailable as exc:
        return checks.failure_payload(
            engine_spec, outcome="runner_unavailable", message=str(exc), criteria=criteria, hint_available=hint_available
        )

    outcomes = _schema_outcomes(structure, spec.id)
    checks_list = checks.assemble_checks(engine_spec, outcomes, criteria=criteria, hint_available=hint_available)
    return checks.build_result_payload(engine_spec, _empty_run(), checks_list, hint_available=hint_available)


def _empty_run() -> dict[str, Any]:
    return {"columns": [], "rows": [], "rowCount": 0, "durationMs": 0, "truncated": False}


def _schema_outcomes(structure: dict, milestone_id: str) -> dict[str, dict]:
    tables = structure["tables"]
    expected = _SCHEMA_EXPECTATIONS[milestone_id]

    matched: dict[str, tuple[str, dict]] = {}
    table_problems: list[str] = []
    for key, aliases in expected["tables"]:
        found = _match_table(tables, key, aliases)
        if found is None:
            table_problems.append(f"جدول `{key}` ساخته نشده است")
        else:
            matched[key] = found

    pk_problems = [
        f"جدول `{key}` کلید اصلی ندارد"
        for key, (name, meta) in matched.items()
        if not meta["primary_key"]
    ]

    fk_key, fk_column, fk_target = expected["foreign_key"]
    fk_problems: list[str] = []
    if fk_key in matched and fk_target in matched:
        _, meta = matched[fk_key]
        target_table = matched[fk_target][0]
        found_fk = any(
            _forms(fk["column"]) & _forms(fk_column) and fk["ref_table"] == target_table
            for fk in meta["foreign_keys"]
        )
        if not found_fk:
            fk_problems.append(
                f"جدول `{fk_key}` کلید خارجی واقعی روی `{fk_column}` به `{target_table}` ندارد"
            )

    not_null_problems: list[str] = []
    for table_key, column in expected["not_null"]:
        if table_key not in matched:
            continue
        _, meta = matched[table_key]
        column_meta = next(
            (info for name, info in meta["columns"].items() if _forms(name) & _forms(column)),
            None,
        )
        if column_meta is None:
            not_null_problems.append(f"ستون `{table_key}.{column}` وجود ندارد")
        elif column_meta["nullable"]:
            not_null_problems.append(f"ستون `{table_key}.{column}` نباید NULL بپذیرد")

    sample_problems: list[str] = []
    for table_key, minimum in expected["min_rows"].items():
        if table_key not in matched:
            continue
        _, meta = matched[table_key]
        if meta["row_count"] < minimum:
            sample_problems.append(
                f"جدول `{table_key}` حداقل به {minimum} ردیف نیاز دارد (اکنون {meta['row_count']})"
            )

    def outcome(problems: list[str], ok_message: str) -> dict:
        return {
            "status": checks.PASSED if not problems else checks.FAILED,
            "messageFa": "؛ ".join(problems) + "." if problems else ok_message,
        }

    return {
        "schema-tables": outcome(table_problems, "هر دو جدول لازم ساخته شده‌اند."),
        "schema-primary-key": outcome(pk_problems, "هر جدول کلید اصلی دارد."),
        "schema-foreign-key": outcome(fk_problems, "کلید خارجی واقعی درست تعریف شده است."),
        "schema-not-null": outcome(not_null_problems, "ستون‌های لازم بدون NULL هستند."),
        "schema-sample-data": outcome(sample_problems, "داده‌ی نمونه‌ی کافی درج شده است."),
    }


# --- ORM stage ---------------------------------------------------------------


def _child_env(spec, nonce: str) -> dict[str, str]:
    return {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "PYTHONPATH": "/app",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
        "LANG": "C.UTF-8",
        "ACADEMY_DB_HOST": config.DB_HOST,
        "ACADEMY_DB_PORT": str(config.DB_PORT),
        "ACADEMY_ORM_SCHEMA": spec.schema,
        "ACADEMY_ORM_USER": spec.user,
        "ACADEMY_ORM_PASSWORD": config.EXERCISE_PASSWORD,
        "ACADEMY_ORM_NONCE": nonce,
        "ACADEMY_PROJECT_ORM_CPU_SECONDS": str(config.PROJECT_ORM_TIMEOUT_SECONDS + 1),
    }


def _parse_output(stdout: str, nonce: str) -> dict | None:
    prefix = f"{MARKER_PREFIX}{nonce}:"
    for line in reversed(stdout.splitlines()):
        if line.startswith(prefix):
            try:
                return json.loads(line[len(prefix):])
            except json.JSONDecodeError:
                return None
    return None


def _run_orm(spec, source: str) -> dict[str, Any]:
    nonce = uuid.uuid4().hex
    handle, path = tempfile.mkstemp(prefix="academy_project_models_", suffix=".py", dir="/tmp")
    with os.fdopen(handle, "w", encoding="utf-8") as file:
        file.write(source)

    start = time.monotonic()
    try:
        try:
            process = subprocess.run(
                [sys.executable, "-m", "app.project_orm_child", path],
                cwd="/app",
                env=_child_env(spec, nonce),
                capture_output=True,
                text=True,
                timeout=config.PROJECT_ORM_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return {
                "status": "timeout",
                "error": "اجرای کد بیش از حد طول کشید و متوقف شد.",
                "durationMs": int((time.monotonic() - start) * 1000),
            }
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    duration = int((time.monotonic() - start) * 1000)
    payload = _parse_output(process.stdout, nonce)
    if payload is None:
        tail = (process.stderr or "").strip().splitlines()
        detail = tail[-1] if tail else "بدون خروجی معتبر از اجرای کد."
        return {"status": "error", "error": f"اجرای کد ناموفق بود: {detail}", "durationMs": duration}
    if not payload.get("ok"):
        status = payload.get("signal") or (
            "system_error" if payload.get("errorType") in _CONNECTION_ERROR_TYPES else "error"
        )
        return {
            "status": status,
            "error": payload.get("error") or payload.get("errorType", ""),
            "durationMs": duration,
            "payload": payload,
        }
    return {"status": "ok", "error": None, "durationMs": duration, "payload": payload}


def _evaluate_orm(milestone, criteria: list[dict], hint_available: bool, workspace: dict) -> dict:
    spec = milestone.spec
    engine_spec = spec.engine_spec()
    source = workspace.get("orm") or ""
    if not source.strip():
        return checks.failure_payload(
            engine_spec,
            outcome="empty_source",
            message="کد خالی است؛ Modelها را بنویس.",
            criteria=criteria,
            hint_available=hint_available,
        )
    if len(source.encode("utf-8")) > config.PROJECT_ORM_MAX_SOURCE_BYTES:
        return checks.failure_payload(
            engine_spec,
            outcome="too_large",
            message="متن کد از حد مجاز بزرگ‌تر است.",
            criteria=criteria,
            hint_available=hint_available,
        )

    try:
        project_db.ensure_identity(spec.schema, spec.user)
        project_db.recreate_empty(spec.schema)
    except project_db.ProjectDbError as exc:
        return checks.failure_payload(
            engine_spec, outcome="runner_unavailable", message=str(exc), criteria=criteria, hint_available=hint_available
        )

    run = _run_orm(spec, source)
    if run["status"] == "timeout":
        return checks.failure_payload(
            engine_spec, outcome="deadline_exceeded", message=run.get("error") or "", criteria=criteria, hint_available=hint_available
        )
    if run["status"] == "system_error":
        return checks.failure_payload(
            engine_spec, outcome="runner_unavailable", message=run.get("error") or "", criteria=criteria, hint_available=hint_available
        )
    if run["status"] != "ok":
        return checks.failure_payload(
            engine_spec, outcome="syntax_error", message=run.get("error") or "", criteria=criteria, hint_available=hint_available
        )

    outcomes = _model_outcomes(run["payload"])
    checks_list = checks.assemble_checks(engine_spec, outcomes, criteria=criteria, hint_available=hint_available)
    return checks.build_result_payload(engine_spec, _empty_run(), checks_list, hint_available=hint_available)


def _model_outcomes(payload: dict) -> dict[str, dict]:
    models = payload.get("models", [])
    by_name = {model["name"]: model for model in models}

    booking_model = next((m for m in models if m.get("foreign_keys")), None)
    room_model = None
    if booking_model is not None:
        room_model = None
        for fk in booking_model["foreign_keys"]:
            room_model = by_name.get(fk["target"])
            if room_model is not None:
                break

    define_problems: list[str] = []
    if booking_model is None:
        define_problems.append("Model رزرو با ForeignKey پیدا نشد")
    if room_model is None:
        define_problems.append("Model اتاق (هدف ForeignKey) پیدا نشد")
    if booking_model is not None:
        field_families = {f["type"] for f in booking_model["fields"]}
        if not any(_type_is(t, "temporal") for t in field_families):
            define_problems.append("Model رزرو تاریخ ورود/خروج ندارد")
        if not any(_type_is(t, "text") for t in field_families):
            define_problems.append("Model رزرو نام مهمان ندارد")
    if room_model is not None:
        if not any(_type_is(f["type"], "integer") for f in room_model["fields"]):
            define_problems.append("Model اتاق ظرفیت عددی ندارد")

    migrate_problems: list[str] = []
    if not payload.get("migrated"):
        migrate_problems.append("اجرای Migration ناموفق بود")
    if not payload.get("migrationRecorded"):
        migrate_problems.append("Migration در دیتابیس ثبت نشد")
    if not models:
        migrate_problems.append("هیچ جدولی از Modelها ساخته نشد")

    pk_problems = [f"Model `{m['name']}` کلید اصلی ندارد" for m in models if not m.get("pk")]

    fk_problems: list[str] = []
    if booking_model is not None:
        fk = booking_model["foreign_keys"][0]
        if not fk.get("dbConstraint"):
            fk_problems.append("کلید خارجی رزرو به‌صورت قید دیتابیس ساخته نشد")
    else:
        fk_problems.append("کلید خارجی رزرو تعریف نشده است")

    null_problems: list[str] = []
    if booking_model is not None:
        for fk in booking_model["foreign_keys"]:
            if fk.get("null"):
                null_problems.append("کلید خارجی رزرو نباید NULL بپذیرد")
        for field in booking_model["fields"]:
            if _type_is(field["type"], "temporal") and field.get("null"):
                null_problems.append(f"فیلد تاریخ `{field['name']}` نباید NULL بپذیرد")

    def outcome(problems: list[str], ok_message: str) -> dict:
        return {
            "status": checks.PASSED if not problems else checks.FAILED,
            "messageFa": "؛ ".join(problems) + "." if problems else ok_message,
        }

    return {
        "models-define": outcome(define_problems, "هر دو Model لازم تعریف شده‌اند."),
        "models-migrate": outcome(migrate_problems, "Migration بدون خطا اجرا و جدول‌ها ساخته شدند."),
        "models-primary-key": outcome(pk_problems, "هر Model کلید اصلی دارد."),
        "models-foreign-key": outcome(fk_problems, "کلید خارجی رزرو به اتاق با قید دیتابیس ساخته شد."),
        "models-nullable": outcome(null_problems, "ستون‌های لازم بدون NULL هستند."),
    }


# --- dispatch + snapshot -----------------------------------------------------


def evaluate(project_id: str, milestone_id: str, workspace: dict) -> dict[str, Any] | None:
    milestone = projects.get_milestone(project_id, milestone_id)
    if milestone is None:
        return None
    criteria = projects.criteria_for(project_id, milestone_id)
    hint_available = len(projects.hints_for(project_id, milestone_id)) > 0
    stage = milestone.spec.stage_kind
    if stage == "erd":
        return _evaluate_erd(milestone, criteria, hint_available, workspace)
    if stage == "sql":
        return _evaluate_sql(milestone, criteria, hint_available, workspace)
    if stage == "orm":
        return _evaluate_orm(milestone, criteria, hint_available, workspace)
    return checks.system_error_payload(
        milestone.spec.engine_spec(),
        "این مرحله هنوز قابل‌ارزیابی نیست.",
        criteria=criteria,
        hint_available=hint_available,
    )


def capture_db_snapshot(project_id: str, milestone_id: str) -> dict | None:
    """Logical DB snapshot for a passed milestone (``None`` for ERD milestones)."""
    milestone = projects.get_milestone(project_id, milestone_id)
    if milestone is None or not milestone.spec.schema:
        return None
    try:
        return project_db.snapshot(milestone.spec.schema)
    except (project_db.ProjectDbError, db.DbUnavailable):
        return None


def reset_project_databases(project_id: str) -> list[str]:
    """Drop every executable milestone schema for a project (Workspace Reset)."""
    dropped: list[str] = []
    for milestone_id in projects.executable_milestone_ids(project_id):
        milestone = projects.get_milestone(project_id, milestone_id)
        if milestone is None or not milestone.spec.schema:
            continue
        project_db.reset(milestone.spec.schema)
        dropped.append(milestone.spec.schema)
    return dropped


def restore_db_snapshot(project_id: str, milestone_id: str, snapshot: dict | None) -> None:
    milestone = projects.get_milestone(project_id, milestone_id)
    if milestone is None or not milestone.spec.schema:
        return
    project_db.ensure_identity(milestone.spec.schema, milestone.spec.user)
    if snapshot is None:
        project_db.reset(milestone.spec.schema)
        return
    project_db.restore(milestone.spec.schema, snapshot)

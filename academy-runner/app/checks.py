"""Structured exercise evaluation shared by the SQL and ORM engines.

Produces the PRD-03 evaluation contract: a top-level ``status``/``outcome`` plus
one entry per **public** criterion with ``criterionId``, ``status``,
``messageFa`` and ``hintAvailable``. Reference solutions and hidden fixtures are
never part of the payload.

Criterion statuses:
  passed | failed | needs_manual_review | not_evaluated

Top-level statuses (kept distinct on purpose):
  passed | failed | error | timeout | system_error
Top-level outcomes:
  success | validation_failed | syntax_error | deadline_exceeded |
  runner_unavailable | empty_source | too_large | invalid_graph

Only ``validation_failed`` (and ``success``) are treated as real learner
attempts for progress; ``system_error``/``timeout`` never count as a failure.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

from pymysql.err import MySQLError

from . import seeds
from .exercises import Spec, get_public, hint_total

RunFn = Callable[[str], dict[str, Any]]

PASSED = "passed"
FAILED = "failed"
MANUAL = "needs_manual_review"
NOT_EVALUATED = "not_evaluated"

LEARNER_ATTEMPT_OUTCOMES = {"success", "validation_failed"}

_TRACEBACK_LINE = re.compile(r'File "learner_solution\.py", line (\d+)')


@dataclass(frozen=True)
class RowsetMap:
    """Maps the semantic rowset checks onto this validator's criterion ids."""

    executes: str
    columns: str
    rows: str
    data_driven: str


ROWSET_VALIDATORS: dict[str, RowsetMap] = {
    "first-query-sql-validator": RowsetMap(
        executes="select-executes",
        columns="projected-columns",
        rows="filtered-ordered-rows",
        data_driven="data-driven",
    ),
    "first-query-orm-validator": RowsetMap(
        executes="queryset-executes",
        columns="projected-columns",
        rows="filtered-ordered-rows",
        data_driven="data-driven",
    ),
    "first-query-mastery-validator": RowsetMap(
        executes="query-executes",
        columns="projected-columns",
        rows="in-range-ordered-top3",
        data_driven="data-driven",
    ),
}


def _criteria(spec: Spec) -> list[dict]:
    return list((get_public(spec.id) or {}).get("criteria", []))


def _columns_message(dataset, actual: list[str]) -> str:
    expected = "، ".join(f"`{name}`" for name in dataset.result_columns)
    got = "، ".join(f"`{name}`" for name in actual) if actual else "بدون ستون"
    return f"نتیجه باید فقط ستون‌های {expected} را داشته باشد؛ خروجی فعلی: {got}."


def _rows_message(datasets) -> str:
    if len(datasets) == 1:
        count = len(datasets[0].expected_rows)
        return (
            "سطرهای بازگشتی با داده‌ی واقعی همین جدول مطابقت ندارد. "
            f"تعداد سطرها و ترتیب باید دقیقاً درست باشد (انتظار: {count} سطر). "
            "فیلترها، شرایط مرزی و ترتیب را دوباره بررسی کن."
        )
    return (
        "سطرهای بازگشتی روی مجموعه‌داده‌های آزمون مختلف با نتیجه‌ی درست مطابقت ندارد. "
        "کوئری باید هم روی حالتی که ردیف‌های کمتری در بازه هست، و هم روی حالتی که "
        "ردیف‌های بیشتری در بازه هست، همان سطرها و ترتیب را بدهد. "
        "شرط مرزی بازه، ترتیب نزولی و عدد LIMIT را دوباره بررسی کن."
    )


_DATA_MESSAGE = (
    "نتیجه از خود جدول میآید، نه از مقدار ثابت در کوئری/کد. "
    "بهجای نوشتن مقادیر آماده، ردیفها را از جدول بخوان."
)


def _location_from_traceback(traceback: str | None) -> dict[str, Any] | None:
    if not traceback:
        return None
    matches = _TRACEBACK_LINE.findall(traceback)
    if not matches:
        return None
    return {"file": "learner_solution.py", "line": int(matches[-1])}


def _rowset_outcomes(
    spec: Spec, source: str, run: dict[str, Any], run_fn: RunFn
) -> dict[str, dict[str, Any]]:
    """Run the semantic rowset checks, including the hidden sentinel probe.

    When the spec declares companion fixtures (``alt_datasets``) the schema is
    rebuilt with each fixture and the same submission is re-run, so the result
    must be correct under *every* fixture. This is what lets two independent
    conditions (a range bound and ``LIMIT``) be observed at once.
    """
    datasets = seeds.datasets_for(spec)
    primary = datasets[0]
    mapping = ROWSET_VALIDATORS[spec.validator_id]

    results: list[tuple[seeds.Dataset, dict[str, Any]]] = [(primary, run)]
    try:
        for dataset in datasets[1:]:
            seeds.load(spec, dataset)
            results.append((dataset, run_fn(source)))
    finally:
        if len(datasets) > 1:
            # Leave the primary fixture in place for later Execute/Show-schema.
            seeds.load(spec, primary)

    def ran_ok(result: dict[str, Any]) -> bool:
        return result["status"] == "ok"

    columns_ok = all(
        ran_ok(result) and [column.lower() for column in result["columns"]] == dataset.result_columns
        for dataset, result in results
    )
    rows_ok = all(
        ran_ok(result) and result["rows"] == dataset.expected_rows
        for dataset, result in results
    )

    data_driven_ok = False
    try:
        seeds.insert_sentinel(spec)
        probe = run_fn(source)
        data_driven_ok = (
            probe["status"] == "ok"
            and probe["rows"] == primary.expected_rows_with_sentinel
        )
    finally:
        try:
            seeds.remove_sentinel(spec)
        except MySQLError:
            seeds.reset(spec)

    return {
        mapping.executes: {"status": PASSED, "messageFa": "کوئری/کد بدون خطا اجرا شد."},
        mapping.columns: {
            "status": PASSED if columns_ok else FAILED,
            "messageFa": (
                "ستون‌های نتیجه درست است."
                if columns_ok
                else _columns_message(primary, run["columns"])
            ),
        },
        mapping.rows: {
            "status": PASSED if rows_ok else FAILED,
            "messageFa": (
                "سطرها و ترتیب نتیجه روی همه‌ی داده‌های آزمون درست است."
                if rows_ok
                else _rows_message(datasets)
            ),
        },
        mapping.data_driven: {
            "status": PASSED if data_driven_ok else FAILED,
            "messageFa": (
                "نتیجه به‌صورت داده‌محور از جدول تولید می‌شود."
                if data_driven_ok
                else _DATA_MESSAGE
            ),
        },
    }


def _assemble_checks(
    spec: Spec,
    outcomes: dict[str, dict[str, Any]],
    *,
    criteria: list[dict] | None = None,
    hint_available: bool | None = None,
) -> list[dict[str, Any]]:
    if hint_available is None:
        hint_available = hint_total(spec.id) > 0
    checks: list[dict[str, Any]] = []
    for criterion in criteria if criteria is not None else _criteria(spec):
        cid = criterion["id"]
        if criterion.get("evaluation") == "manual":
            checks.append(
                {
                    "criterionId": cid,
                    "status": MANUAL,
                    "messageFa": criterion.get("rubric_fa")
                    or "این معیار نیازمند بازبینی دستی است؛ بهصورت خودکار نمره داده نمیشود.",
                    "location": None,
                    "hintAvailable": hint_available,
                }
            )
            continue
        outcome = outcomes.get(cid)
        if outcome is None:
            checks.append(
                {
                    "criterionId": cid,
                    "status": NOT_EVALUATED,
                    "messageFa": "این معیار در موتور ارزیابی فعلی بهصورت خودکار سنجیده نمیشود.",
                    "location": None,
                    "hintAvailable": hint_available,
                }
            )
            continue
        checks.append(
            {
                "criterionId": cid,
                "status": outcome["status"],
                "messageFa": outcome.get("messageFa", ""),
                "location": outcome.get("location"),
                "hintAvailable": hint_available,
            }
        )
    return checks


def _header(spec: Spec, run: dict[str, Any]) -> dict[str, Any]:
    return {
        "exerciseId": spec.id,
        "assessmentVersion": spec.validator_version,
        "result": {
            "columns": run["columns"],
            "rows": run["rows"],
            "rowCount": run["rowCount"],
            "truncated": run.get("truncated", False),
            "durationMs": run["durationMs"],
        },
    }


def _failure_payload(
    spec: Spec,
    run: dict[str, Any],
    *,
    outcome: str,
    message: str,
    traceback: str | None = None,
    criteria: list[dict] | None = None,
    hint_available: bool | None = None,
) -> dict[str, Any]:
    if hint_available is None:
        hint_available = hint_total(spec.id) > 0

    def message_for(criterion: dict) -> str:
        if criterion.get("evaluation") == "manual":
            return criterion.get("rubric_fa") or (
                "این معیار نیازمند بازبینی دستی است؛ بهصورت خودکار نمره داده نمیشود."
            )
        return "به دلیل خطای اجرا سنجیده نشد."

    checks = [
        {
            "criterionId": criterion["id"],
            "status": MANUAL if criterion.get("evaluation") == "manual" else NOT_EVALUATED,
            "messageFa": message_for(criterion),
            "location": None,
            "hintAvailable": hint_available,
        }
        for criterion in (criteria if criteria is not None else _criteria(spec))
    ]
    status = {
        "syntax_error": "error",
        "empty_source": "error",
        "too_large": "error",
        "deadline_exceeded": "timeout",
        "runner_unavailable": "system_error",
    }.get(outcome, "error")
    payload = _header(spec, run)
    payload.update(
        {
            "status": status,
            "outcome": outcome,
            "passed": False,
            "checks": checks,
            "canRequestNextHint": bool(hint_available) and status != "system_error",
            "error": message,
            "traceback": traceback or run.get("traceback"),
        }
    )
    if traceback or run.get("traceback"):
        location = _location_from_traceback(traceback or run.get("traceback"))
        if location and payload["checks"]:
            payload["checks"][0]["location"] = location
    return payload


def system_error_payload(
    spec: Spec,
    message: str,
    *,
    criteria: list[dict] | None = None,
    hint_available: bool | None = None,
) -> dict[str, Any]:
    """Structured payload for an infrastructure failure (never a pass/fail)."""
    dummy = {"columns": [], "rows": [], "rowCount": 0, "durationMs": 0, "truncated": False}
    return _failure_payload(
        spec,
        dummy,
        outcome="runner_unavailable",
        message=message,
        criteria=criteria,
        hint_available=hint_available,
    )


def invalid_input_payload(
    spec: Spec,
    message: str,
    *,
    criteria: list[dict] | None = None,
    hint_available: bool | None = None,
) -> dict[str, Any]:
    """Structured payload for a malformed submission (bad graph JSON, etc.).

    This is a learner-side ``error`` (fixable input), distinct from a
    ``system_error`` (infrastructure outage).
    """
    dummy = {"columns": [], "rows": [], "rowCount": 0, "durationMs": 0, "truncated": False}
    return _failure_payload(
        spec,
        dummy,
        outcome="invalid_graph",
        message=message,
        criteria=criteria,
        hint_available=hint_available,
    )


def assemble_checks(
    spec: Spec,
    outcomes: dict[str, dict[str, Any]],
    *,
    criteria: list[dict] | None = None,
    hint_available: bool | None = None,
) -> list[dict[str, Any]]:
    """Public wrapper over the criterion assembly shared by every engine.

    ``criteria``/``hint_available`` let the project milestone engine reuse this
    assembly with the milestone's own authored criteria instead of the exercise
    registry.
    """
    return _assemble_checks(spec, outcomes, criteria=criteria, hint_available=hint_available)


def failure_payload(
    spec: Spec,
    *,
    outcome: str,
    message: str,
    traceback: str | None = None,
    criteria: list[dict] | None = None,
    hint_available: bool | None = None,
) -> dict[str, Any]:
    """Public wrapper for a non-result (error/timeout/system) evaluation payload.

    Used by the project milestone engine so a learner-side script error is still
    reported with the milestone's own criteria (all ``not_evaluated``/``manual``).
    """
    dummy = {"columns": [], "rows": [], "rowCount": 0, "durationMs": 0, "truncated": False}
    return _failure_payload(
        spec,
        dummy,
        outcome=outcome,
        message=message,
        traceback=traceback,
        criteria=criteria,
        hint_available=hint_available,
    )


def build_result_payload(
    spec: Spec,
    run: dict[str, Any],
    checks_list: list[dict[str, Any]],
    *,
    hint_available: bool,
) -> dict[str, Any]:
    """Assemble the passed/failed payload from an already-built checks list.

    The pass rule is centralized here: every automatic criterion must pass;
    manual criteria (and only those) are ignored for the outcome.
    """
    auto = [check for check in checks_list if check["status"] != MANUAL]
    passed = bool(auto) and all(check["status"] == PASSED for check in auto)
    payload = _header(spec, run)
    payload.update(
        {
            "status": "passed" if passed else "failed",
            "outcome": "success" if passed else "validation_failed",
            "passed": passed,
            "checks": checks_list,
            "canRequestNextHint": bool(hint_available) and not passed,
            "error": None,
            "traceback": None,
        }
    )
    return payload


def build_payload(
    spec: Spec,
    source: str,
    run_fn: RunFn,
    *,
    max_bytes: int | None = None,
    empty_message: str = "پاسخ خالی است؛ ابتدا کد یا کوئری خود را بنویس.",
    too_large_message: str = "متن پاسخ از حد مجاز بزرگتر است.",
) -> dict[str, Any]:
    """Evaluate one submission and return the structured contract."""
    source = source or ""
    dummy = {"columns": [], "rows": [], "rowCount": 0, "durationMs": 0, "truncated": False}
    if not source.strip():
        return _failure_payload(spec, dummy, outcome="empty_source", message=empty_message)
    if max_bytes is not None and len(source.encode("utf-8")) > max_bytes:
        return _failure_payload(
            spec, dummy, outcome="too_large", message=too_large_message
        )

    run = run_fn(source)

    if run["status"] == "timeout":
        return _failure_payload(
            spec, run, outcome="deadline_exceeded", message=run.get("error") or ""
        )
    if run["status"] == "system_error":
        return _failure_payload(
            spec, run, outcome="runner_unavailable", message=run.get("error") or ""
        )
    if run["status"] != "ok":
        return _failure_payload(
            spec,
            run,
            outcome="syntax_error",
            message=run.get("error") or "",
            traceback=run.get("traceback"),
        )

    outcomes = _rowset_outcomes(spec, source, run, run_fn)
    checks = _assemble_checks(spec, outcomes)
    auto_checks = [
        check for check in checks if check["status"] != MANUAL
    ]
    passed = bool(auto_checks) and all(check["status"] == PASSED for check in auto_checks)

    payload = _header(spec, run)
    payload.update(
        {
            "status": "passed" if passed else "failed",
            "outcome": "success" if passed else "validation_failed",
            "passed": passed,
            "checks": checks,
            "canRequestNextHint": bool(hint_total(spec.id)) and not passed,
            "error": None,
            "traceback": None,
        }
    )
    return payload

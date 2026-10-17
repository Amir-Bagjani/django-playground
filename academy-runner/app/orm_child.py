"""Child process that executes one learner ORM snippet.

Run as ``python -m app.orm_child <source_file>``. It configures Django, runs the
learner code, and prints a single machine-readable line prefixed with a per-run
nonce so the parent can extract the result even if the learner prints output.

The learner sees ``Product`` preloaded and only needs to set ``result``. Errors
(the learner's Python/Django traceback) are returned as structured output, not
raised here, so the API can distinguish learner failures from system failures.
"""
from __future__ import annotations

import json
import os
import resource
import sys
import traceback
from typing import Any


def _limit_cpu() -> None:
    try:
        seconds = int(os.environ.get("ACADEMY_ORM_CPU_SECONDS", "12"))
        resource.setrlimit(resource.RLIMIT_CPU, (seconds, seconds + 1))
    except (ValueError, OSError):
        pass


def _emit(payload: dict[str, Any]) -> None:
    nonce = os.environ.get("ACADEMY_ORM_NONCE", "")
    print(f"ACADEMY_RESULT_{nonce}:{json.dumps(payload, ensure_ascii=False)}", flush=True)


def _to_columns_rows(result: Any) -> tuple[list[str], list[list[Any]]]:
    from app.normalize import normalize_cell

    if result is None:
        raise ValueError(
            "متغیر result مقداردهی نشده است؛ نتیجه‌ی QuerySet را در آن قرار بده."
        )
    if hasattr(result, "iterator") or hasattr(result, "_result_cache"):
        items = list(result)  # evaluates the lazy QuerySet
    elif isinstance(result, (list, tuple)):
        items = list(result)
    else:
        items = [result]

    if not items:
        return ["name", "price"], []

    first = items[0]
    if isinstance(first, dict):
        columns = list(first.keys())
        rows = [[normalize_cell(item.get(column)) for column in columns] for item in items]
        return columns, rows
    if isinstance(first, (list, tuple)):
        columns = ["name", "price"]
        rows = [
            [normalize_cell(item[0]), normalize_cell(item[1])] for item in items
        ]
        return columns, rows
    fields = getattr(first, "_meta", None)
    if fields is not None:
        names = [field.name for field in fields.concrete_fields]
        rows = [
            [normalize_cell(getattr(item, name)) for name in names] for item in items
        ]
        return names, rows
    return ["value"], [[normalize_cell(item)] for item in items]


def main() -> int:
    _limit_cpu()
    if len(sys.argv) < 2:
        _emit({"ok": False, "errorType": "UsageError", "error": "missing source file"})
        return 2

    try:
        import pymysql

        pymysql.install_as_MySQLdb()
        # Django 6.1's MySQL backend requires mysqlclient >= 2.2.1; PyMySQL
        # reports its own version, which fails that check without this shim.
        if getattr(pymysql, "version_info", (0,)) < (2, 2, 1):
            pymysql.version_info = (2, 2, 1, "final", 0)
            pymysql.__version__ = "2.2.1"
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.orm_settings")
        import django

        django.setup()
        from app.orm_app.models import Product
    except Exception as exc:  # pragma: no cover - environment failure
        _emit(
            {
                "ok": False,
                "errorType": type(exc).__name__,
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
        )
        return 1

    with open(sys.argv[1], encoding="utf-8") as handle:
        source = handle.read()

    namespace: dict[str, Any] = {"Product": Product}
    try:
        exec(compile(source, "learner_solution.py", "exec"), namespace)
        columns, rows = _to_columns_rows(namespace.get("result"))
        _emit({"ok": True, "columns": columns, "rows": rows, "rowCount": len(rows)})
        return 0
    except BaseException as exc:  # noqa: BLE001 - report any learner failure
        _emit(
            {
                "ok": False,
                "errorType": type(exc).__name__,
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

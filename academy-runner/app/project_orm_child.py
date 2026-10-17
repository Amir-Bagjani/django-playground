"""Child process that builds learner Django models and runs their migrations.

Run as ``python -m app.project_orm_child <source_file>`` (source is the learner's
``models.py``). The child writes the source into a throwaway Django app package,
configures Django inline, runs ``makemigrations`` and ``migrate`` against the
milestone's disposable MySQL schema, then reports the resulting model + schema
structure as a single machine-readable line (nonce-prefixed) so learner print
output can not confuse the parent.

Like the exercise ORM child, learner errors (syntax, invalid models, migration
failures) are reported as structured output, never raised here, so the API can
distinguish learner failure from a system/database failure. The child receives
only the restricted milestone credentials, never the admin identity.
"""
from __future__ import annotations

import json
import os
import resource
import sys
import tempfile
import traceback
from typing import Any


def _limit_cpu() -> None:
    try:
        seconds = int(os.environ.get("ACADEMY_PROJECT_ORM_CPU_SECONDS", "25"))
        resource.setrlimit(resource.RLIMIT_CPU, (seconds, seconds + 1))
    except (ValueError, OSError):
        pass


def _emit(payload: dict[str, Any]) -> None:
    nonce = os.environ.get("ACADEMY_ORM_NONCE", "")
    print(f"ACADEMY_RESULT_{nonce}:{json.dumps(payload, ensure_ascii=False)}", flush=True)


def _settings() -> dict[str, Any]:
    return {
        "DEBUG": False,
        "USE_TZ": False,
        "DEFAULT_AUTO_FIELD": "django.db.models.AutoField",
        "INSTALLED_APPS": ["academy_project"],
        "DATABASES": {
            "default": {
                "ENGINE": "django.db.backends.mysql",
                "NAME": os.environ["ACADEMY_ORM_SCHEMA"],
                "USER": os.environ["ACADEMY_ORM_USER"],
                "PASSWORD": os.environ.get("ACADEMY_ORM_PASSWORD", ""),
                "HOST": os.environ.get("ACADEMY_DB_HOST", ""),
                "PORT": os.environ.get("ACADEMY_DB_PORT", "3306"),
                "OPTIONS": {"charset": "utf8mb4"},
            }
        },
    }


_CONNECTION_ERROR_TYPES = {"OperationalError", "InterfaceError"}


def _model_report() -> tuple[list[dict], list[str]]:
    from django.apps import apps
    from django.db import connection

    models: list[dict[str, Any]] = []
    app_config = apps.get_app_config("academy_project")
    with connection.cursor() as cursor:
        for model in app_config.get_models():
            table = model._meta.db_table
            cursor.execute(
                "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
                "AND REFERENCED_TABLE_NAME IS NOT NULL",
                (table,),
            )
            fk_columns = {row[0] for row in cursor.fetchall()}
            foreign_keys = []
            for field in model._meta.concrete_fields:
                if field.is_relation and field.many_to_one:
                    foreign_keys.append(
                        {
                            "field": field.name,
                            "dbColumn": field.column,
                            "target": field.related_model.__name__,
                            "null": bool(field.null),
                            "dbConstraint": field.column in fk_columns,
                        }
                    )
            fields = [
                {"name": field.name, "type": type(field).__name__, "null": bool(field.null)}
                for field in model._meta.concrete_fields
                if not field.is_relation
            ]
            models.append(
                {
                    "name": model.__name__,
                    "table": table,
                    "pk": model._meta.pk.name if model._meta.pk else None,
                    "fields": fields,
                    "foreign_keys": foreign_keys,
                }
            )
    return models, []


def main() -> int:
    _limit_cpu()
    if len(sys.argv) < 2:
        _emit({"ok": False, "errorType": "UsageError", "error": "missing source file"})
        return 2

    try:
        import pymysql

        pymysql.install_as_MySQLdb()
        if getattr(pymysql, "version_info", (0,)) < (2, 2, 1):
            pymysql.version_info = (2, 2, 1, "final", 0)
            pymysql.__version__ = "2.2.1"
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

    workdir = tempfile.mkdtemp(prefix="academy_project_orm_")
    app_dir = os.path.join(workdir, "academy_project")
    os.makedirs(app_dir, exist_ok=True)
    with open(os.path.join(app_dir, "__init__.py"), "w", encoding="utf-8") as handle:
        handle.write("")
    with open(os.path.join(app_dir, "models.py"), "w", encoding="utf-8") as handle:
        handle.write(source)
    sys.path.insert(0, workdir)

    try:
        from django.conf import settings

        settings.configure(**_settings())
        import django

        django.setup()
        from django.core.management import call_command

        call_command("makemigrations", "academy_project", verbosity=0, interactive=False)
        call_command("migrate", run_syncdb=True, verbosity=0, interactive=False)

        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) FROM django_migrations WHERE app = 'academy_project'"
            )
            migration_recorded = int(cursor.fetchone()[0]) > 0
        models, _ = _model_report()
        _emit(
            {
                "ok": True,
                "models": models,
                "migrated": True,
                "migrationRecorded": migration_recorded,
            }
        )
        return 0
    except BaseException as exc:  # noqa: BLE001 - report any learner failure
        error_type = type(exc).__name__
        signal = "system_error" if error_type in _CONNECTION_ERROR_TYPES else "error"
        _emit(
            {
                "ok": False,
                "signal": signal,
                "errorType": error_type,
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

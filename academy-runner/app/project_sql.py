"""Multi-statement SQL execution + structural introspection for project SQL
milestones (PRD-05).

Unlike the exercise SQL engine (one statement, rowset contract), a project
milestone submits a **DDL script** (several statements plus sample INSERTs). It
runs as the milestone's restricted user against the milestone's disposable
schema, then the resulting structure is read back from ``information_schema``.
Grading is on the real structure and row counts, never on the SQL text.
"""
from __future__ import annotations

import time
from typing import Any

import pymysql
from pymysql.constants import CLIENT
from pymysql.err import MySQLError, OperationalError

from . import config
from .db import DbUnavailable
from .sql_engine import LOCK

TIMEOUT_CODES = {3024, 2013, 1205}


def execute_script(schema: str, user: str, source: str) -> dict[str, Any]:
    """Run a multi-statement script as the restricted user. No elevated identity."""
    start = time.monotonic()
    connection = None
    try:
        connection = pymysql.connect(
            host=config.DB_HOST,
            port=config.DB_PORT,
            user=user,
            password=config.EXERCISE_PASSWORD,
            database=schema,
            charset=config.DB_CHARSET,
            autocommit=True,
            connect_timeout=5,
            read_timeout=config.PROJECT_SQL_TIMEOUT_SECONDS + 3,
            client_flag=CLIENT.MULTI_STATEMENTS,
        )
        with connection.cursor() as cursor:
            cursor.execute(
                "SET SESSION max_execution_time = %s",
                (config.PROJECT_SQL_TIMEOUT_SECONDS * 1000,),
            )
            cursor.execute(source)
            while cursor.nextset():
                pass
        return {
            "status": "ok",
            "error": None,
            "durationMs": int((time.monotonic() - start) * 1000),
        }
    except OperationalError as exc:
        code = exc.args[0] if exc.args else None
        status = "timeout" if code in TIMEOUT_CODES else "error"
        return {
            "status": status,
            "error": str(exc),
            "durationMs": int((time.monotonic() - start) * 1000),
        }
    except MySQLError as exc:
        return {
            "status": "error",
            "error": str(exc),
            "durationMs": int((time.monotonic() - start) * 1000),
        }
    except DbUnavailable as exc:
        return {
            "status": "system_error",
            "error": str(exc),
            "durationMs": int((time.monotonic() - start) * 1000),
        }
    finally:
        if connection is not None:
            try:
                connection.close()
            except MySQLError:  # pragma: no cover - defensive
                pass


def introspect(schema: str) -> dict[str, Any]:
    """Read tables, columns, PK/FK constraints and row counts for a schema."""
    tables: dict[str, dict[str, Any]] = {}
    from . import db

    with db.admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY "
                "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s "
                "ORDER BY TABLE_NAME, ORDINAL_POSITION",
                (schema,),
            )
            for table, column, column_type, nullable, key in cursor.fetchall():
                entry = tables.setdefault(table, {"columns": {}, "primary_key": [], "foreign_keys": []})
                entry["columns"][column] = {
                    "type": column_type,
                    "nullable": nullable == "YES",
                    "primary": key == "PRI",
                }
                if key == "PRI":
                    entry["primary_key"].append(column)

            cursor.execute(
                "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME "
                "FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = %s "
                "AND REFERENCED_TABLE_NAME IS NOT NULL",
                (schema,),
            )
            for table, column, ref_table, ref_column in cursor.fetchall():
                tables.setdefault(table, {"columns": {}, "primary_key": [], "foreign_keys": []})
                tables[table]["foreign_keys"].append(
                    {"column": column, "ref_table": ref_table, "ref_column": ref_column}
                )

        for table in tables:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT COUNT(*) FROM `{schema}`.`{table}`")
                tables[table]["row_count"] = int(cursor.fetchone()[0])
    return {"schema": schema, "tables": tables}


def run_with_lock(schema: str, user: str, source: str) -> dict[str, Any]:
    with LOCK:
        return execute_script(schema, user, source)

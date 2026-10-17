"""MySQL snapshot / restore / reset for project milestone schemas (PRD-05).

Each executable project milestone owns one dedicated schema (created and seeded
by the milestone's own evaluation). This module is the *durability* layer used by
Checkpoint Restore and Workspace Reset — it is deliberately independent of the
exercise engine.

MySQL DDL causes implicit commits, so a single ROLLBACK is **not** a reliable
restore strategy. Instead a restore is a rebuild:

1. snapshot the current active schema (so we can roll back if the rebuild fails);
2. build the requested snapshot into a throwaway **staging** schema and verify it;
3. drop and recreate the active schema from the (verified) snapshot;
4. on any failure in step 3, rebuild the active schema from the pre-restore
   snapshot so the learner never loses their current database.

Foreign-key checks are disabled only while tables/rows are created, then FK
constraints are re-verified from ``information_schema`` before a snapshot is
accepted.
"""
from __future__ import annotations

import base64
import datetime
import decimal
from typing import Any

import pymysql

from . import db

_IGNORED_TABLES = {"django_migrations", "django_content_type", "auth_permission"}


def _cell(value: Any) -> Any:
    """Make one MySQL value JSON-serializable and re-insertable.

    Temporal values become MySQL-literal strings (space separator), numerics
    become their text form and binary values become base64 text.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return str(value).replace("T", " ")
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return base64.b64encode(bytes(value)).decode("ascii")
    return str(value)


class ProjectDbError(Exception):
    """A controlled snapshot/restore/reset failure (safe to surface to the UI)."""


def _table_names(connection: pymysql.connections.Connection, schema: str) -> list[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = %s ORDER BY TABLE_NAME",
            (schema,),
        )
        return [row[0] for row in cursor.fetchall()]


def snapshot(schema: str) -> dict[str, Any]:
    """Capture DDL + rows for every table in ``schema`` (dependency-agnostic)."""
    tables: list[dict[str, Any]] = []
    with db.admin_connection() as connection:
        for name in _table_names(connection, schema):
            with connection.cursor() as cursor:
                cursor.execute(f"SHOW CREATE TABLE `{schema}`.`{name}`")
                create_sql = cursor.fetchone()[1]
                cursor.execute(f"SELECT * FROM `{schema}`.`{name}`")
                columns = [d[0] for d in cursor.description]
                rows = [[_cell(cell) for cell in row] for row in cursor.fetchall()]
            tables.append({"name": name, "create_sql": create_sql, "columns": columns, "rows": rows})
    return {"schemaVersion": 1, "tables": tables}


def _verify(connection: pymysql.connections.Connection, schema: str, snap: dict) -> None:
    existing = set(_table_names(connection, schema))
    with connection.cursor() as cursor:
        for table in snap.get("tables", []):
            name = table["name"]
            if name not in existing:
                raise ProjectDbError(f"جدول `{name}` در بازگردانی ساخته نشد.")
            cursor.execute(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_KEY = 'PRI'",
                (schema, name),
            )
            if int(cursor.fetchone()[0]) == 0:
                raise ProjectDbError(f"جدول `{name}` در بازگردانی کلید اصلی ندارد.")
            cursor.execute(f"SELECT COUNT(*) FROM `{schema}`.`{name}`")
            actual = int(cursor.fetchone()[0])
            expected = len(table.get("rows", []))
            if actual != expected:
                raise ProjectDbError(
                    f"تعداد ردیف‌های جدول `{name}` در بازگردانی مطابق نیست "
                    f"({actual} ≠ {expected})."
                )
        # Referential integrity must still be declared after the rebuild.
        for table in snap.get("tables", []):
            create_sql = table.get("create_sql", "")
            if "FOREIGN KEY" in create_sql.upper():
                cursor.execute(
                    "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                    "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
                    "AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
                    (schema, table["name"]),
                )
                if int(cursor.fetchone()[0]) == 0:
                    raise ProjectDbError(
                        f"کلید خارجی جدول `{table['name']}` در بازگردانی حفظ نشد."
                    )


def _apply(connection: pymysql.connections.Connection, schema: str, snap: dict) -> None:
    with connection.cursor() as cursor:
        cursor.execute(f"DROP DATABASE IF EXISTS `{schema}`")
        cursor.execute(
            f"CREATE DATABASE `{schema}` CHARACTER SET {db.config.DB_CHARSET} "
            f"COLLATE {db.config.DB_COLLATION}"
        )
        cursor.execute(f"USE `{schema}`")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        try:
            for table in snap.get("tables", []):
                cursor.execute(table["create_sql"])
            for table in snap.get("tables", []):
                rows = table.get("rows", [])
                if not rows:
                    continue
                placeholders = ", ".join(["%s"] * len(table["columns"]))
                columns = ", ".join(f"`{c}`" for c in table["columns"])
                cursor.executemany(
                    f"INSERT INTO `{schema}`.`{table['name']}` ({columns}) VALUES ({placeholders})",
                    rows,
                )
        finally:
            cursor.execute("SET FOREIGN_KEY_CHECKS = 1")


def restore(schema: str, snap: dict) -> None:
    """Rebuild ``schema`` from ``snap``; keep the active schema on failure."""
    staging = f"{schema}__staging"
    try:
        previous = snapshot(schema)
    except db.DbUnavailable as exc:
        raise ProjectDbError(f"اتصال به MySQL برقرار نشد: {exc}") from exc

    with db.admin_connection() as connection:
        try:
            _apply(connection, staging, snap)
            _verify(connection, staging, snap)
        except (pymysql.MySQLError, ProjectDbError) as exc:
            with connection.cursor() as cursor:
                cursor.execute(f"DROP DATABASE IF EXISTS `{staging}`")
            raise ProjectDbError(f"بازگردانی ناموفق بود: {exc}") from exc

        try:
            _apply(connection, schema, snap)
            _verify(connection, schema, snap)
        except (pymysql.MySQLError, ProjectDbError) as exc:
            # Roll forward from the pre-restore snapshot to avoid data loss.
            try:
                _apply(connection, schema, previous)
            except pymysql.MySQLError:
                pass
            raise ProjectDbError(f"اعمال بازگردانی ناموفق بود: {exc}") from exc
        finally:
            with connection.cursor() as cursor:
                cursor.execute(f"DROP DATABASE IF EXISTS `{staging}`")


def reset(schema: str) -> None:
    """Drop a milestone schema so the next evaluation reseeds the starter."""
    try:
        with db.admin_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"DROP DATABASE IF EXISTS `{schema}`")
    except db.DbUnavailable as exc:
        raise ProjectDbError(f"اتصال به MySQL برقرار نشد: {exc}") from exc


def recreate_empty(schema: str) -> None:
    """Drop and recreate an *empty* milestone schema (fresh evaluation).

    The learner script/migration connects with the schema as its default
    database, so an empty schema must exist before their code runs.
    """
    try:
        with db.admin_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"DROP DATABASE IF EXISTS `{schema}`")
                cursor.execute(
                    f"CREATE DATABASE `{schema}` CHARACTER SET {db.config.DB_CHARSET} "
                    f"COLLATE {db.config.DB_COLLATION}"
                )
    except db.DbUnavailable as exc:
        raise ProjectDbError(f"اتصال به MySQL برقرار نشد: {exc}") from exc


def ensure_identity(schema: str, user: str) -> None:
    try:
        db.ensure_exercise_identity(schema, user)
    except db.DbUnavailable as exc:
        raise ProjectDbError(f"اتصال به MySQL برقرار نشد: {exc}") from exc

"""MySQL connections and identity management for the Academy runner.

Two identities are used:

* an **admin** (control) identity used only for seeding/resetting disposable
  schemas and creating per-exercise users. It is never handed to learner code.
* one **restricted user per exercise**, granted privileges only on that
  exercise's schema, used to run learner SQL and the ORM child process.

The MySQL service has no published host port; all access happens over the
internal Compose network.
"""
from __future__ import annotations

import time
from typing import Any

import pymysql

from . import config


class DbError(Exception):
    """Base class for controlled database failures."""


class DbUnavailable(DbError):
    """MySQL could not be reached or authenticated."""


def _connect(
    user: str,
    password: str,
    database: str | None = None,
    *,
    read_timeout: int | None = None,
) -> pymysql.connections.Connection:
    try:
        return pymysql.connect(
            host=config.DB_HOST,
            port=config.DB_PORT,
            user=user,
            password=password,
            database=database,
            charset=config.DB_CHARSET,
            autocommit=True,
            connect_timeout=5,
            read_timeout=read_timeout,
        )
    except pymysql.MySQLError as exc:  # pragma: no cover - depends on environment
        raise DbUnavailable(f"MySQL unavailable: {exc}") from exc


def admin_connection() -> pymysql.connections.Connection:
    return _connect(config.ADMIN_USER, config.ADMIN_PASSWORD)


def learner_connection(
    schema: str, user: str, password: str, *, read_timeout: int | None = None
) -> pymysql.connections.Connection:
    return _connect(user, password, database=schema, read_timeout=read_timeout)


def wait_for_mysql(attempts: int = 60, delay: float = 1.0) -> None:
    last: Exception | None = None
    for _ in range(attempts):
        try:
            connection = admin_connection()
            connection.close()
            return
        except DbUnavailable as exc:
            last = exc
            time.sleep(delay)
    raise DbUnavailable(f"MySQL did not become ready: {last}")


def schema_exists(schema: str) -> bool:
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = %s",
                (schema,),
            )
            return int(cursor.fetchone()[0]) > 0


def table_exists(schema: str, table: str) -> bool:
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
                (schema, table),
            )
            return int(cursor.fetchone()[0]) > 0


def ensure_exercise_identity(schema: str, user: str) -> None:
    """Create/refresh a restricted user scoped to exactly one schema."""
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "CREATE USER IF NOT EXISTS %s@'%%' IDENTIFIED BY %s",
                (user, config.EXERCISE_PASSWORD),
            )
            cursor.execute(
                "ALTER USER %s@'%%' IDENTIFIED BY %s",
                (user, config.EXERCISE_PASSWORD),
            )
            try:
                cursor.execute("REVOKE ALL PRIVILEGES, GRANT OPTION FROM %s@'%%'", (user,))
            except pymysql.MySQLError:
                pass  # user had no privileges yet
            cursor.execute(
                f"GRANT ALL PRIVILEGES ON `{schema}`.* TO %s@'%%'",
                (user,),
            )
            cursor.execute("FLUSH PRIVILEGES")


def schema_preview(schema: str) -> dict[str, Any]:
    """Read-only structural preview of the exercise schema."""
    tables: dict[str, list[dict[str, Any]]] = {}
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY "
                "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s "
                "ORDER BY TABLE_NAME, ORDINAL_POSITION",
                (schema,),
            )
            for table_name, column, column_type, nullable, key in cursor.fetchall():
                tables.setdefault(table_name, []).append(
                    {
                        "name": column,
                        "type": column_type,
                        "nullable": nullable == "YES",
                        "key": key,
                    }
                )
    return {
        "schema": schema,
        "charset": config.DB_CHARSET,
        "collation": config.DB_COLLATION,
        "tables": [{"name": name, "columns": cols} for name, cols in tables.items()],
    }

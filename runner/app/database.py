"""Read-only introspection of a single example's SQLite database.

This module never runs user SQL. Every table name coming from the UI is checked
against the real table list first, and all pagination values are passed as bound
parameters. Connections are opened in ``mode=ro`` so a bug here cannot mutate the
example database.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .config import DEFAULT_DB_PAGE_SIZE, MAX_DB_PAGE_SIZE

DB_FILENAME = "db.sqlite3"


class DatabaseError(Exception):
    """Base class for controlled database-explorer failures."""


class DatabaseUnavailable(DatabaseError):
    """The example has no SQLite database yet (migrations not applied)."""


class TableNotFound(DatabaseError):
    """The requested table does not exist in the example database."""


def db_path(project_root: Path) -> Path:
    return project_root / DB_FILENAME


def is_available(project_root: Path) -> bool:
    path = db_path(project_root)
    return path.is_file() and path.stat().st_size > 0


def _connect(project_root: Path) -> sqlite3.Connection:
    path = db_path(project_root)
    if not is_available(project_root):
        raise DatabaseUnavailable("No database yet. Run 'Apply DB Changes' first.")
    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error as exc:  # pragma: no cover - defensive
        raise DatabaseUnavailable(f"Could not open the database: {exc}") from exc
    connection.row_factory = sqlite3.Row
    return connection


def _table_names(connection: sqlite3.Connection) -> list[str]:
    return [
        row["name"]
        for row in connection.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]


def _require_table(connection: sqlite3.Connection, name: str) -> str:
    if name not in _table_names(connection):
        raise TableNotFound(f"Table '{name}' does not exist in this database.")
    return name


def _count(connection: sqlite3.Connection, name: str) -> int:
    quoted = '"' + name.replace('"', '""') + '"'
    return int(connection.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0])


def list_tables(project_root: Path) -> dict[str, Any]:
    """Return ``{available, tables: [{name, rowCount}]}``.

    When no database exists yet this is not an error: the UI shows an empty
    state with a hint to apply migrations.
    """
    if not is_available(project_root):
        return {"available": False, "tables": []}
    try:
        with _connect(project_root) as connection:
            tables = [
                {"name": name, "rowCount": _count(connection, name)}
                for name in _table_names(connection)
            ]
    except sqlite3.Error as exc:
        raise DatabaseError(f"Could not read the database schema: {exc}") from exc
    return {"available": True, "tables": tables}


def table_detail(project_root: Path, name: str) -> dict[str, Any]:
    """Return columns, foreign keys and row count for one table."""
    try:
        with _connect(project_root) as connection:
            name = _require_table(connection, name)
            columns = [
                {
                    "name": row["name"],
                    "type": row["type"] or "",
                    "primaryKey": bool(row["pk"]),
                    "notNull": bool(row["notnull"]),
                    "default": row["dflt_value"],
                }
                for row in connection.execute(f'PRAGMA table_info("{name}")')
            ]
            foreign_keys = [
                {
                    "column": row["from"],
                    "referencesTable": row["table"],
                    "referencesColumn": row["to"],
                }
                for row in connection.execute(f'PRAGMA foreign_key_list("{name}")')
            ]
            return {
                "name": name,
                "rowCount": _count(connection, name),
                "columns": columns,
                "foreignKeys": foreign_keys,
            }
    except sqlite3.Error as exc:
        raise DatabaseError(f"Could not read table '{name}': {exc}") from exc


def _cell(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray)):
        return f"<{len(value)} bytes>"
    return value


def table_rows(
    project_root: Path, name: str, limit: int = DEFAULT_DB_PAGE_SIZE, offset: int = 0
) -> dict[str, Any]:
    """Return a page of rows as ``{columns, rows, total, limit, offset}``."""
    limit = max(1, min(int(limit), MAX_DB_PAGE_SIZE))
    offset = max(0, int(offset))
    try:
        with _connect(project_root) as connection:
            name = _require_table(connection, name)
            quoted = '"' + name.replace('"', '""') + '"'
            total = _count(connection, name)
            cursor = connection.execute(
                f"SELECT * FROM {quoted} LIMIT ? OFFSET ?", (limit, offset)
            )
            columns = [description[0] for description in cursor.description or []]
            rows = [[_cell(value) for value in row] for row in cursor.fetchall()]
    except sqlite3.Error as exc:
        raise DatabaseError(f"Could not read rows from '{name}': {exc}") from exc
    return {
        "name": name,
        "columns": columns,
        "rows": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
    }

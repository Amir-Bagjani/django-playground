"""Disposable exercise schemas: DDL, seed data, reset and probe helpers.

Reset strategy: drop and recreate the disposable database, then re-insert the
known dataset. MySQL DDL causes implicit commits, so rollback is never used as
the reset mechanism. Only the named exercise schema is touched; the legacy
Django Playground (a separate SQLite-backed container and volume) is never
referenced here.

Each exercise maps to one dataset (``Spec.dataset``). A dataset owns its table
DDL, its visible seed rows, a hidden sentinel row used by the anti-hardcode
``data-driven`` probe, and the normalized expected result used by validators.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from . import config
from .db import admin_connection, ensure_exercise_identity, schema_exists, table_exists
from .exercises import Spec


def _ddl(table: str, columns: str) -> str:
    return (
        f"CREATE TABLE `{table}` ({columns}) "
        f"ENGINE=InnoDB DEFAULT CHARSET={config.DB_CHARSET} COLLATE={config.DB_COLLATION}"
    )


@dataclass(frozen=True)
class Dataset:
    table: str
    ddl: str
    insert_columns: tuple[str, ...]
    rows: list[tuple[Any, ...]]
    sentinel_row: tuple[Any, ...]
    name_column: str
    sentinel_name: str
    result_columns: list[str]
    expected_rows: list[list[Any]]
    expected_rows_with_sentinel: list[list[Any]]


# --- products: the practice/problem-solving dataset of DB-00-008 ------------

PRODUCTS_DDL = _ddl(
    "products",
    "`id` INT NOT NULL AUTO_INCREMENT,"
    "`name` VARCHAR(80) NOT NULL,"
    "`price` DECIMAL(10,2) NOT NULL,"
    "`in_stock` TINYINT(1) NOT NULL DEFAULT 1,"
    "PRIMARY KEY (`id`)",
)

PRODUCTS = Dataset(
    table="products",
    ddl=PRODUCTS_DDL,
    insert_columns=("name", "price", "in_stock"),
    rows=[
        ("Widget", Decimal("9.99"), 1),
        ("Gadget", Decimal("24.50"), 1),
        ("Doohickey", Decimal("4.00"), 0),
        ("Sprocket", Decimal("15.75"), 1),
        ("Gizmo", Decimal("30.00"), 0),
    ],
    sentinel_row=("zz-probe", Decimal("1.23"), 1),
    name_column="name",
    sentinel_name="zz-probe",
    result_columns=["name", "price"],
    expected_rows=[
        ["Gadget", "24.50"],
        ["Sprocket", "15.75"],
        ["Widget", "9.99"],
    ],
    expected_rows_with_sentinel=[
        ["Gadget", "24.50"],
        ["Sprocket", "15.75"],
        ["Widget", "9.99"],
        ["zz-probe", "1.23"],
    ],
)


# --- books: the independent Mastery dataset of DB-00-008 --------------------
# The lesson teaches on a ``books`` table; the practice exercises use
# ``products``, so an aggregation-free but *composed* query on ``books`` is a
# genuinely independent challenge rather than a renamed practice task.

BOOKS_DDL = _ddl(
    "books",
    "`id` INT NOT NULL AUTO_INCREMENT,"
    "`title` VARCHAR(80) NOT NULL,"
    "`price` DECIMAL(10,2) NOT NULL,"
    "`published` TINYINT(1) NOT NULL DEFAULT 1,"
    "PRIMARY KEY (`id`)",
)

BOOKS = Dataset(
    table="books",
    ddl=BOOKS_DDL,
    insert_columns=("title", "price", "published"),
    rows=[
        # In-range published rows are deliberately only the two *boundary* rows.
        # The mastery window is an ordered top-3, so a range bound is only
        # observable when the window can reach past it. With fewer than three
        # in-range rows the descending window extends below the lower bound, so
        # dropping `price >= 10` (or writing an exclusive `price > 10`) really
        # changes the result instead of silently returning the same rows.
        ("Pinnacle", Decimal("50.00"), 1),        # upper boundary, in range
        ("Cheap Notes", Decimal("10.00"), 1),     # lower boundary, in range
        # Below the lower bound: enter the window only if the lower bound is
        # missing or wrong, which is what makes it verifiable.
        ("Sale Copy", Decimal("9.00"), 1),
        ("Bargain Bin", Decimal("5.00"), 1),
        # Above the upper bound: enter the window only if the upper bound is
        # missing or wrong.
        ("Too Dear", Decimal("60.00"), 1),
        # Unpublished but in range: omitting the published filter wrongly
        # promotes these into the ordered window.
        ("Draft Best", Decimal("45.00"), 0),
        ("Other Draft", Decimal("25.00"), 0),
        ("Old Draft", Decimal("9.00"), 0),
    ],
    # Hidden probe: published and in range, so a hardcoded literal result cannot
    # match once it is inserted; it also sits between the two boundaries.
    sentinel_row=("zz-probe", Decimal("49.99"), 1),
    name_column="title",
    sentinel_name="zz-probe",
    result_columns=["title", "price"],
    expected_rows=[
        ["Pinnacle", "50.00"],
        ["Cheap Notes", "10.00"],
    ],
    expected_rows_with_sentinel=[
        ["Pinnacle", "50.00"],
        ["zz-probe", "49.99"],
        ["Cheap Notes", "10.00"],
    ],
)


# --- books-wide: the LIMIT-sensitive companion fixture of DB-00-008 --------
# The boundary fixture above has only two in-range rows, so it makes the lower
# range bound observable but leaves ``LIMIT 3`` inert. This fixture has more
# than three in-range rows, so ``LIMIT 3`` really drops a row. Both fixtures are
# evaluated by the mastery validator: the *same* table (``books``) is rebuilt
# with each fixture's rows, so neither condition can hide behind the other.

BOOKS_WIDE = Dataset(
    table="books",
    ddl=BOOKS_DDL,
    insert_columns=("title", "price", "published"),
    rows=[
        # Four published, in-range rows: the descending top-3 window really
        # truncates the fourth (Cinder). Dropping ``LIMIT`` returns four rows.
        ("Pinnacle", Decimal("40.00"), 1),
        ("Alpine", Decimal("30.00"), 1),
        ("Beacon", Decimal("20.00"), 1),
        ("Cinder", Decimal("15.00"), 1),
        # Below the lower bound: excluded only if ``price >= 10`` is present.
        ("Sale Copy", Decimal("9.00"), 1),
        # Unpublished but high enough to enter the top-3 if the published
        # filter is omitted (35.00 would rank second).
        ("Draft Best", Decimal("35.00"), 0),
    ],
    sentinel_row=("zz-probe", Decimal("36.00"), 1),
    name_column="title",
    sentinel_name="zz-probe",
    result_columns=["title", "price"],
    expected_rows=[
        ["Pinnacle", "40.00"],
        ["Alpine", "30.00"],
        ["Beacon", "20.00"],
    ],
    expected_rows_with_sentinel=[
        ["Pinnacle", "40.00"],
        ["zz-probe", "36.00"],
        ["Alpine", "30.00"],
    ],
)


DATASETS: dict[str, Dataset] = {
    "products": PRODUCTS,
    "books": BOOKS,
    "books_wide": BOOKS_WIDE,
}


def dataset_for(spec: Spec) -> Dataset:
    # ERD exercises submit a graph document, not SQL, so they own no dataset.
    if spec.kind == "erd":
        raise ValueError(f"exercise '{spec.id}' is an ERD exercise and has no SQL dataset")
    return DATASETS[spec.dataset]


def datasets_for(spec: Spec) -> list[Dataset]:
    """The primary fixture plus any declared LIMIT/boundary companion fixtures."""
    return [dataset_for(spec)] + [DATASETS[name] for name in spec.alt_datasets]


def _insert_rows(cursor, schema: str, dataset: Dataset, rows: list[tuple]) -> None:
    columns = ", ".join(f"`{name}`" for name in dataset.insert_columns)
    placeholders = ", ".join(["%s"] * len(dataset.insert_columns))
    cursor.executemany(
        f"INSERT INTO `{schema}`.`{dataset.table}` ({columns}) VALUES ({placeholders})",
        rows,
    )


def load(spec: Spec, dataset: Dataset) -> None:
    """(Re)build the disposable schema from one fixture's DDL + rows."""
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"DROP DATABASE IF EXISTS `{spec.schema}`")
            cursor.execute(
                f"CREATE DATABASE `{spec.schema}` "
                f"CHARACTER SET {config.DB_CHARSET} COLLATE {config.DB_COLLATION}"
            )
            cursor.execute(f"USE `{spec.schema}`")
            cursor.execute(dataset.ddl)
            _insert_rows(cursor, spec.schema, dataset, dataset.rows)
    ensure_exercise_identity(spec.schema, spec.user)


def reset(spec: Spec) -> None:
    load(spec, dataset_for(spec))


def ensure_seeded(spec: Spec) -> None:
    dataset = dataset_for(spec)
    if not schema_exists(spec.schema) or not table_exists(spec.schema, dataset.table):
        reset(spec)
        return
    ensure_exercise_identity(spec.schema, spec.user)


def insert_sentinel(spec: Spec) -> None:
    dataset = dataset_for(spec)
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            _insert_rows(cursor, spec.schema, dataset, [dataset.sentinel_row])


def remove_sentinel(spec: Spec) -> None:
    dataset = dataset_for(spec)
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"DELETE FROM `{spec.schema}`.`{dataset.table}` WHERE `{dataset.name_column}` = %s",
                (dataset.sentinel_name,),
            )

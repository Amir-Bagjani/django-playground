"""Disposable exercise schemas: DDL, seed data, reset and probe helpers.

Reset strategy: drop and recreate the disposable database, then re-insert the
known dataset. MySQL DDL causes implicit commits, so rollback is never used as
the reset mechanism. Only the named exercise schema is touched; the legacy
Django Playground (a separate SQLite-backed container and volume) is never
referenced here.
"""
from __future__ import annotations

from decimal import Decimal

from . import config
from .db import admin_connection, ensure_exercise_identity, schema_exists, table_exists
from .exercises import Spec

PRODUCTS_DDL = (
    "CREATE TABLE `products` ("
    "`id` INT NOT NULL AUTO_INCREMENT,"
    "`name` VARCHAR(80) NOT NULL,"
    "`price` DECIMAL(10,2) NOT NULL,"
    "`in_stock` TINYINT(1) NOT NULL DEFAULT 1,"
    "PRIMARY KEY (`id`)) "
    f"ENGINE=InnoDB DEFAULT CHARSET={config.DB_CHARSET} COLLATE={config.DB_COLLATION}"
)

# Practice dataset visible to the learner.
SEED_ROWS: list[tuple[str, Decimal, int]] = [
    ("Widget", Decimal("9.99"), 1),
    ("Gadget", Decimal("24.50"), 1),
    ("Doohickey", Decimal("4.00"), 0),
    ("Sprocket", Decimal("15.75"), 1),
    ("Gizmo", Decimal("30.00"), 0),
]

# Hidden sentinel used by the anti-hardcode "data-driven" criterion.
SENTINEL_NAME = "zz-probe"
SENTINEL_PRICE = Decimal("1.23")

# Expected normalized results.
EXPECTED_ROWS: list[list[str]] = [
    ["Gadget", "24.50"],
    ["Sprocket", "15.75"],
    ["Widget", "9.99"],
]
EXPECTED_ROWS_WITH_SENTINEL: list[list[str]] = EXPECTED_ROWS + [[SENTINEL_NAME, "1.23"]]


def reset(spec: Spec) -> None:
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"DROP DATABASE IF EXISTS `{spec.schema}`")
            cursor.execute(
                f"CREATE DATABASE `{spec.schema}` "
                f"CHARACTER SET {config.DB_CHARSET} COLLATE {config.DB_COLLATION}"
            )
            cursor.execute(f"USE `{spec.schema}`")
            cursor.execute(PRODUCTS_DDL)
            cursor.executemany(
                "INSERT INTO `products` (`name`, `price`, `in_stock`) VALUES (%s, %s, %s)",
                SEED_ROWS,
            )
    ensure_exercise_identity(spec.schema, spec.user)


def ensure_seeded(spec: Spec) -> None:
    if not schema_exists(spec.schema) or not table_exists(spec.schema, "products"):
        reset(spec)
        return
    ensure_exercise_identity(spec.schema, spec.user)


def insert_sentinel(schema: str) -> None:
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"INSERT INTO `{schema}`.`products` (`name`, `price`, `in_stock`) "
                "VALUES (%s, %s, %s)",
                (SENTINEL_NAME, SENTINEL_PRICE, 1),
            )


def remove_sentinel(schema: str) -> None:
    with admin_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"DELETE FROM `{schema}`.`products` WHERE `name` = %s",
                (SENTINEL_NAME,),
            )

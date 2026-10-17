"""Reset and isolation tests for the Academy exercise schemas."""
from __future__ import annotations

from app import orm_engine, seeds, sql_engine

SQL_SOLUTION = "SELECT name, price FROM products WHERE in_stock = 1 ORDER BY price DESC"
ORM_SOLUTION = (
    'result = Product.objects.filter(in_stock=True)'
    '.order_by("-price").values("name", "price")'
)


def test_reset_restores_dataset(sql_spec):
    assert sql_engine.execute(sql_spec, "DELETE FROM products")["status"] == "ok"
    assert sql_engine.execute(sql_spec, "SELECT name FROM products")["rowCount"] == 0

    seeds.reset(sql_spec)

    assert sql_engine.check(sql_spec, SQL_SOLUTION)["passed"] is True


def test_learner_user_cannot_read_other_schema(sql_spec, orm_spec):
    result = sql_engine.execute(sql_spec, f"SELECT * FROM `{orm_spec.schema}`.products")
    assert result["status"] == "error"


def test_learner_user_cannot_read_system_schema(sql_spec):
    result = sql_engine.execute(sql_spec, "SELECT * FROM mysql.user")
    assert result["status"] == "error"


def test_ddl_in_one_schema_does_not_break_the_other(sql_spec, orm_spec):
    assert sql_engine.execute(sql_spec, "DROP TABLE products")["status"] == "ok"

    # The ORM exercise schema is untouched and still evaluates correctly.
    assert orm_engine.check(orm_spec, ORM_SOLUTION)["passed"] is True
    # The SQL schema is broken only until an explicit reset.
    assert sql_engine.check(sql_spec, SQL_SOLUTION)["passed"] is False

    seeds.reset(sql_spec)
    assert sql_engine.check(sql_spec, SQL_SOLUTION)["passed"] is True

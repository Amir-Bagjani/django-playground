"""SQL exercise evaluation tests against real MySQL 8.4."""
from __future__ import annotations

from app import config, sql_engine

SOLUTION = "SELECT name, price FROM products WHERE in_stock = 1 ORDER BY price DESC"


def criteria(result: dict) -> dict[str, bool]:
    return {c["id"]: c["passed"] for c in result["criteria"]}


def test_reference_solution_passes(sql_spec):
    result = sql_engine.check(sql_spec, SOLUTION)
    assert result["status"] == "ok", result
    assert result["passed"] is True
    assert all(criteria(result).values())


def test_missing_where_is_rejected(sql_spec):
    result = sql_engine.check(sql_spec, "SELECT name, price FROM products ORDER BY price DESC")
    assert result["passed"] is False
    assert criteria(result)["filtered-ordered-rows"] is False


def test_wrong_order_is_rejected(sql_spec):
    result = sql_engine.check(
        sql_spec, "SELECT name, price FROM products WHERE in_stock = 1 ORDER BY price ASC"
    )
    assert result["passed"] is False
    assert criteria(result)["filtered-ordered-rows"] is False


def test_hardcoded_result_is_rejected(sql_spec):
    hardcoded = (
        "SELECT 'Gadget' AS name, '24.50' AS price "
        "UNION ALL SELECT 'Sprocket', '15.75' "
        "UNION ALL SELECT 'Widget', '9.99'"
    )
    result = sql_engine.check(sql_spec, hardcoded)
    assert result["passed"] is False
    outcome = criteria(result)
    assert outcome["projected-columns"] is True
    assert outcome["filtered-ordered-rows"] is True
    assert outcome["data-driven"] is False


def test_syntax_error_is_a_learner_error(sql_spec):
    result = sql_engine.check(sql_spec, "SELECT name, price FROM products WHERE")
    assert result["status"] == "error"
    assert result["passed"] is False
    assert result["error"]


def test_slow_query_is_labeled_timeout(sql_spec, monkeypatch):
    monkeypatch.setattr(config, "SQL_TIMEOUT_SECONDS", 2)
    result = sql_engine.execute(
        sql_spec, "SELECT a.id, SLEEP(0.5) FROM products a, products b, products c, products d"
    )
    assert result["status"] == "timeout"


def test_empty_source_is_rejected(sql_spec):
    assert sql_engine.execute(sql_spec, "   ")["status"] == "error"

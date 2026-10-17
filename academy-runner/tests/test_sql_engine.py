"""SQL exercise evaluation tests against real MySQL 8.4."""
from __future__ import annotations

from app import config, sql_engine

SOLUTION = "SELECT name, price FROM products WHERE in_stock = 1 ORDER BY price DESC"
# Structurally different but semantically valid: boolean literal + explicit compare.
ALTERNATIVE = "SELECT name, price FROM products WHERE in_stock <> 0 ORDER BY price DESC"


def statuses(result: dict) -> dict[str, str]:
    return {check["criterionId"]: check["status"] for check in result["checks"]}


def test_reference_solution_passes(sql_spec):
    result = sql_engine.check(sql_spec, SOLUTION)
    assert result["status"] == "passed", result
    assert result["outcome"] == "success"
    assert result["passed"] is True
    assert result["assessmentVersion"] == 1
    assert set(statuses(result).values()) == {"passed"}
    assert all(check["hintAvailable"] for check in result["checks"])


def test_alternative_valid_solution_passes(sql_spec):
    result = sql_engine.check(sql_spec, ALTERNATIVE)
    assert result["passed"] is True
    assert statuses(result)["filtered-ordered-rows"] == "passed"


def test_missing_where_is_rejected(sql_spec):
    result = sql_engine.check(sql_spec, "SELECT name, price FROM products ORDER BY price DESC")
    assert result["passed"] is False
    assert result["status"] == "failed"
    assert result["outcome"] == "validation_failed"
    assert statuses(result)["filtered-ordered-rows"] == "failed"
    assert result["checks"][0]["messageFa"]


def test_wrong_order_is_rejected(sql_spec):
    result = sql_engine.check(
        sql_spec, "SELECT name, price FROM products WHERE in_stock = 1 ORDER BY price ASC"
    )
    assert result["passed"] is False
    assert statuses(result)["filtered-ordered-rows"] == "failed"


def test_wrong_columns_are_rejected(sql_spec):
    result = sql_engine.check(
        sql_spec, "SELECT name, price, in_stock FROM products WHERE in_stock = 1 ORDER BY price DESC"
    )
    assert result["passed"] is False
    assert statuses(result)["projected-columns"] == "failed"


def test_hardcoded_result_is_rejected(sql_spec):
    hardcoded = (
        "SELECT 'Gadget' AS name, '24.50' AS price "
        "UNION ALL SELECT 'Sprocket', '15.75' "
        "UNION ALL SELECT 'Widget', '9.99'"
    )
    result = sql_engine.check(sql_spec, hardcoded)
    assert result["passed"] is False
    outcome = statuses(result)
    assert outcome["projected-columns"] == "passed"
    assert outcome["filtered-ordered-rows"] == "passed"
    assert outcome["data-driven"] == "failed"


def test_syntax_error_is_distinct_from_validation_failure(sql_spec):
    result = sql_engine.check(sql_spec, "SELECT name, price FROM products WHERE")
    assert result["status"] == "error"
    assert result["outcome"] == "syntax_error"
    assert result["passed"] is False
    assert result["error"]
    # Nothing was graded, so no criterion is falsely marked failed.
    assert set(statuses(result).values()) == {"not_evaluated"}


def test_empty_source_is_reported(sql_spec):
    result = sql_engine.check(sql_spec, "   ")
    assert result["status"] == "error"
    assert result["outcome"] == "empty_source"


def test_slow_query_is_labeled_timeout(sql_spec, monkeypatch):
    monkeypatch.setattr(config, "SQL_TIMEOUT_SECONDS", 2)
    result = sql_engine.execute(
        sql_spec, "SELECT a.id, SLEEP(0.5) FROM products a, products b, products c, products d"
    )
    assert result["status"] == "timeout"

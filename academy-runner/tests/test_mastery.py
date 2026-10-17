"""Mastery exercise: independent dataset, manual criterion and boundaries."""
from __future__ import annotations

from app import sql_engine

SOLUTION = (
    "SELECT title, price FROM books "
    "WHERE published = 1 AND price BETWEEN 10 AND 50 "
    "ORDER BY price DESC LIMIT 3"
)


def statuses(result: dict) -> dict[str, str]:
    return {check["criterionId"]: check["status"] for check in result["checks"]}


def test_mastery_reference_solution_passes(mastery_spec):
    result = sql_engine.check(mastery_spec, SOLUTION)
    assert result["status"] == "passed", result
    assert result["passed"] is True
    assert statuses(result)["in-range-ordered-top3"] == "passed"
    assert statuses(result)["data-driven"] == "passed"
    # The engineering note is reviewed manually and never called wrong.
    assert statuses(result)["explain-approach"] == "needs_manual_review"


def test_mastery_missing_published_filter_is_rejected(mastery_spec):
    # Dropping the published filter promotes the unpublished "Draft Best" (45.00).
    result = sql_engine.check(
        mastery_spec,
        "SELECT title, price FROM books WHERE price BETWEEN 10 AND 50 ORDER BY price DESC LIMIT 3",
    )
    assert result["passed"] is False
    assert statuses(result)["in-range-ordered-top3"] == "failed"


def test_mastery_missing_lower_bound_is_rejected(mastery_spec):
    # In-range published rows are only the two boundary rows, so dropping the
    # lower bound pulls the below-range "Sale Copy" (9.00) into the window.
    result = sql_engine.check(
        mastery_spec,
        "SELECT title, price FROM books WHERE published = 1 AND price <= 50 ORDER BY price DESC LIMIT 3",
    )
    assert result["passed"] is False
    assert statuses(result)["in-range-ordered-top3"] == "failed"


def test_mastery_exclusive_lower_bound_is_rejected(mastery_spec):
    # An exclusive lower bound drops the boundary row "Cheap Notes" (10.00).
    result = sql_engine.check(
        mastery_spec,
        "SELECT title, price FROM books WHERE published = 1 AND price > 10 AND price <= 50 ORDER BY price DESC LIMIT 3",
    )
    assert result["passed"] is False
    assert statuses(result)["in-range-ordered-top3"] == "failed"


def test_mastery_wrong_range_is_rejected(mastery_spec):
    # Dropping the upper bound lets the out-of-range 60.00 row in.
    result = sql_engine.check(
        mastery_spec,
        "SELECT title, price FROM books WHERE published = 1 AND price >= 10 ORDER BY price DESC LIMIT 3",
    )
    assert result["passed"] is False
    assert statuses(result)["in-range-ordered-top3"] == "failed"


def test_mastery_hardcoded_result_is_rejected(mastery_spec):
    hardcoded = (
        "SELECT 'Pinnacle' AS title, '50.00' AS price "
        "UNION ALL SELECT 'Cheap Notes', '10.00'"
    )
    result = sql_engine.check(mastery_spec, hardcoded)
    assert result["passed"] is False
    assert statuses(result)["data-driven"] == "failed"

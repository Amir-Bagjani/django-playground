"""ORM exercise evaluation tests against real Django 6.1 + MySQL 8.4."""
from __future__ import annotations

from app import config, orm_engine

ORACLE = (
    'result = Product.objects.filter(in_stock=True)'
    '.order_by("-price").values("name", "price")'
)
ALTERNATIVE = (
    'result = Product.objects.filter(in_stock__exact=True)'
    '.order_by("-price").values("name", "price")'
)


def statuses(result: dict) -> dict[str, str]:
    return {check["criterionId"]: check["status"] for check in result["checks"]}


def test_reference_solution_passes(orm_spec):
    result = orm_engine.check(orm_spec, ORACLE)
    assert result["status"] == "passed", result
    assert result["passed"] is True
    assert set(statuses(result).values()) == {"passed"}


def test_alternative_valid_solution_passes(orm_spec):
    result = orm_engine.check(orm_spec, ALTERNATIVE)
    assert result["passed"] is True


def test_missing_filter_is_rejected(orm_spec):
    result = orm_engine.check(
        orm_spec, 'result = Product.objects.all().order_by("-price").values("name", "price")'
    )
    assert result["passed"] is False
    assert statuses(result)["filtered-ordered-rows"] == "failed"


def test_missing_order_is_rejected(orm_spec):
    result = orm_engine.check(
        orm_spec, 'result = Product.objects.filter(in_stock=True).values("name", "price")'
    )
    assert result["passed"] is False
    assert statuses(result)["filtered-ordered-rows"] == "failed"


def test_hardcoded_result_is_rejected(orm_spec):
    hardcoded = (
        "result = ["
        '{"name": "Gadget", "price": "24.50"}, '
        '{"name": "Sprocket", "price": "15.75"}, '
        '{"name": "Widget", "price": "9.99"}, '
        "]"
    )
    result = orm_engine.check(orm_spec, hardcoded)
    assert result["passed"] is False
    assert statuses(result)["data-driven"] == "failed"


def test_python_error_is_a_learner_error_with_location(orm_spec):
    result = orm_engine.check(orm_spec, "result = Product.objects.filter(nope=1)")
    assert result["status"] == "error"
    assert result["outcome"] == "syntax_error"
    assert result["passed"] is False
    assert result["traceback"]
    location = result["checks"][0]["location"]
    assert location and location["file"] == "learner_solution.py" and location["line"] >= 1


def test_missing_result_is_rejected(orm_spec):
    result = orm_engine.check(orm_spec, "x = 1")
    assert result["passed"] is False


def test_slow_code_is_labeled_timeout(orm_spec, monkeypatch):
    monkeypatch.setattr(config, "ORM_TIMEOUT_SECONDS", 2)
    result = orm_engine.execute(orm_spec, "import time\ntime.sleep(30)\nresult = []")
    assert result["status"] == "timeout"

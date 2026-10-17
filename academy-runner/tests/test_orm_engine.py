"""ORM exercise evaluation tests against real Django 6.1 + MySQL 8.4."""
from __future__ import annotations

from app import config, orm_engine

ORACLE = (
    'result = Product.objects.filter(in_stock=True)'
    '.order_by("-price").values("name", "price")'
)


def criteria(result: dict) -> dict[str, bool]:
    return {c["id"]: c["passed"] for c in result["criteria"]}


def test_reference_solution_passes(orm_spec):
    result = orm_engine.check(orm_spec, ORACLE)
    assert result["status"] == "ok", result
    assert result["passed"] is True
    assert all(criteria(result).values())


def test_missing_filter_is_rejected(orm_spec):
    result = orm_engine.check(
        orm_spec, 'result = Product.objects.all().order_by("-price").values("name", "price")'
    )
    assert result["passed"] is False
    assert criteria(result)["filtered-ordered-rows"] is False


def test_missing_order_is_rejected(orm_spec):
    result = orm_engine.check(
        orm_spec, 'result = Product.objects.filter(in_stock=True).values("name", "price")'
    )
    assert result["passed"] is False
    assert criteria(result)["filtered-ordered-rows"] is False


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
    assert criteria(result)["data-driven"] is False


def test_python_error_is_a_learner_error(orm_spec):
    result = orm_engine.check(orm_spec, "result = Product.objects.filter(nope=1)")
    assert result["status"] == "error"
    assert result["passed"] is False
    assert result["traceback"]


def test_missing_result_is_rejected(orm_spec):
    result = orm_engine.check(orm_spec, "x = 1")
    assert result["passed"] is False


def test_slow_code_is_labeled_timeout(orm_spec, monkeypatch):
    monkeypatch.setattr(config, "ORM_TIMEOUT_SECONDS", 2)
    result = orm_engine.execute(orm_spec, "import time\ntime.sleep(30)\nresult = []")
    assert result["status"] == "timeout"

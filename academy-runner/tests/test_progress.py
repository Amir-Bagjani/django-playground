"""Progress persistence, completion/mastery semantics and outage safety."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app import config, progress, sql_engine
from app.db import DbUnavailable
from app.main import app

SQL_SOLUTION = "SELECT name, price FROM products WHERE in_stock = 1 ORDER BY price DESC"
ORM_SOLUTION = (
    'result = Product.objects.filter(in_stock=True)'
    '.order_by("-price").values("name", "price")'
)
MASTERY_SOLUTION = (
    "SELECT title, price FROM books "
    "WHERE published = 1 AND price BETWEEN 10 AND 50 "
    "ORDER BY price DESC LIMIT 3"
)


def evaluate(client: TestClient, exercise_id: str, source: str) -> dict:
    return client.post(
        f"/v1/exercises/{exercise_id}/evaluate",
        json={"exerciseId": exercise_id, "source": source},
    ).json()


def test_evaluate_records_completion_then_mastery(sql_spec, orm_spec, mastery_spec):
    with TestClient(app) as client:
        sql = evaluate(client, "first-query-sql", SQL_SOLUTION)
        assert sql["passed"] is True
        assert sql["progress"]["status"] == "in_progress"
        assert sql["progress"]["requiredPassed"] == 1

        orm = evaluate(client, "first-query-orm", ORM_SOLUTION)
        assert orm["passed"] is True
        assert orm["progress"]["status"] == "completed"
        assert orm["progress"]["completed"] is True
        assert orm["progress"]["mastered"] is False

        mastery = evaluate(client, "first-query-mastery", MASTERY_SOLUTION)
        assert mastery["passed"] is True
        assert mastery["progress"]["status"] == "mastered"
        assert mastery["progress"]["mastered"] is True


def test_a_failed_attempt_does_not_revoke_an_earned_pass(sql_spec, orm_spec):
    with TestClient(app) as client:
        evaluate(client, "first-query-sql", SQL_SOLUTION)
        evaluate(client, "first-query-orm", ORM_SOLUTION)

        failed = evaluate(client, "first-query-sql", "SELECT name, price FROM products")
        assert failed["passed"] is False

        state = progress.snapshot()["lessons"]["DB-00-008"]
        assert state["completed"] is True
        assert state["exercises"]["first-query-sql"]["passed"] is True


def test_progress_persists_across_store_reopen(sql_spec, orm_spec):
    with TestClient(app) as client:
        evaluate(client, "first-query-sql", SQL_SOLUTION)
        evaluate(client, "first-query-orm", ORM_SOLUTION)

    assert config.PROGRESS_DB_PATH.exists()
    # A brand-new connection (as after a Compose restart) still sees the pass.
    reopened = progress.snapshot()
    assert reopened["lessons"]["DB-00-008"]["completed"] is True


def test_reset_keeps_earned_progress_but_restores_exercise_data(sql_spec, orm_spec):
    with TestClient(app) as client:
        evaluate(client, "first-query-sql", SQL_SOLUTION)
        evaluate(client, "first-query-orm", ORM_SOLUTION)
        assert progress.snapshot()["lessons"]["DB-00-008"]["completed"] is True

        reset = client.post("/v1/exercises/first-query-sql/reset").json()
        assert reset["status"] == "ok"

        # Progress is independent of the disposable exercise schema.
        assert progress.snapshot()["lessons"]["DB-00-008"]["completed"] is True
        assert sql_engine.check(sql_spec, SQL_SOLUTION)["passed"] is True


def test_runner_outage_is_system_error_and_does_not_reduce_progress(mastery_spec, monkeypatch):
    def down(*_args, **_kwargs):
        raise DbUnavailable("simulated outage")

    monkeypatch.setattr(sql_engine, "learner_connection", down)

    with TestClient(app) as client:
        result = evaluate(client, "first-query-mastery", MASTERY_SOLUTION)

    assert result["status"] == "system_error"
    assert result["outcome"] == "runner_unavailable"
    assert result["passed"] is False
    # No pass was invented and the lesson is not marked failed/in-progress.
    snapshot = progress.snapshot()
    assert snapshot["totals"]["completed"] == 0
    assert snapshot["totals"]["mastered"] == 0
    lesson = snapshot["lessons"]["DB-00-008"]
    assert lesson["status"] == "pending"
    assert lesson["exercises"]["first-query-mastery"]["passed"] is False

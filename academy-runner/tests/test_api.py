"""API-level tests: public metadata, execute/check/evaluate, hints, progress."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app

SQL_SOLUTION = "SELECT name, price FROM products WHERE in_stock = 1 ORDER BY price DESC"
EXERCISE_IDS = {"first-query-sql", "first-query-orm", "first-query-mastery"}


def test_health_reports_mysql_ready_and_clean_registry():
    with TestClient(app) as client:
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["mysql"] is True
        assert body["registryIssues"] == []


def test_unknown_exercise_is_404():
    with TestClient(app) as client:
        assert client.get("/v1/exercises/nope").status_code == 404


def test_exercises_expose_only_public_metadata():
    with TestClient(app) as client:
        data = client.get("/v1/exercises").json()
        ids = {exercise["id"] for exercise in data["exercises"]}
        assert ids == EXERCISE_IDS
        serialized = json.dumps(data)
        # No validator/reference material or hint text is exposed on this route.
        assert "criteria_file" not in serialized
        assert "validation-plan" not in serialized
        assert "EXPECTED_ROWS" not in serialized
        assert '"hints"' not in serialized
        for exercise in data["exercises"]:
            assert isinstance(exercise["hint_count"], int)
            assert exercise["assessment_version"] == 1
            for starter in exercise["starter"]:
                # Starters are skeletons, never a completed answer.
                assert "TODO" in starter["content"]


def test_sql_execute_check_and_reset_via_api():
    with TestClient(app) as client:
        execute = client.post(
            "/v1/runtime/sql/execute",
            json={"exerciseId": "first-query-sql", "source": SQL_SOLUTION},
        ).json()
        assert execute["status"] == "ok"
        assert execute["rowCount"] == 3

        check = client.post(
            "/v1/runtime/sql/check",
            json={"exerciseId": "first-query-sql", "source": SQL_SOLUTION},
        ).json()
        assert check["passed"] is True
        assert check["outcome"] == "success"

        reset = client.post("/v1/exercises/first-query-sql/reset").json()
        assert reset["status"] == "ok"


def test_evaluate_persists_and_progress_endpoint_reports_it():
    with TestClient(app) as client:
        result = client.post(
            "/v1/exercises/first-query-sql/evaluate",
            json={"exerciseId": "first-query-sql", "source": SQL_SOLUTION},
        ).json()
        assert result["passed"] is True
        assert result["assessmentVersion"] == 1

        progress = client.get("/v1/progress").json()
        lesson = progress["lessons"]["DB-00-008"]
        assert lesson["exercises"]["first-query-sql"]["passed"] is True
        assert progress["totals"]["passes"] == 1


def test_evaluate_rejects_mismatched_body_id():
    with TestClient(app) as client:
        response = client.post(
            "/v1/exercises/first-query-sql/evaluate",
            json={"exerciseId": "first-query-orm", "source": SQL_SOLUTION},
        )
        assert response.status_code == 400

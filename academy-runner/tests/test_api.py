"""API-level tests: public metadata, execute/check/reset via the control API."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app

SQL_SOLUTION = "SELECT name, price FROM products WHERE in_stock = 1 ORDER BY price DESC"


def test_health_reports_mysql_ready():
    with TestClient(app) as client:
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["mysql"] is True


def test_unknown_exercise_is_404():
    with TestClient(app) as client:
        assert client.get("/v1/exercises/nope").status_code == 404


def test_exercises_expose_only_public_metadata():
    with TestClient(app) as client:
        data = client.get("/v1/exercises").json()
        ids = {exercise["id"] for exercise in data["exercises"]}
        assert ids == {"first-query-sql", "first-query-orm"}
        serialized = json.dumps(data)
        # No validator/reference material is ever exposed on the public route.
        assert "criteria_file" not in serialized
        assert "validation-plan" not in serialized
        assert "EXPECTED_ROWS" not in serialized
        for exercise in data["exercises"]:
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

        reset = client.post("/v1/exercises/first-query-sql/reset").json()
        assert reset["status"] == "ok"

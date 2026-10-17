"""Progressive hints API: one at a time, capped for Mastery, no leakage."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app


def test_hints_are_revealed_one_at_a_time():
    with TestClient(app) as client:
        first = client.post(
            "/v1/exercises/first-query-sql/hints/next", json={"revealed": 0}
        ).json()
        assert first["revealed"] == 1
        assert first["total"] == 3
        assert first["canRequestMore"] is True
        assert first["hint"]["text_fa"]

        second = client.post(
            "/v1/exercises/first-query-sql/hints/next", json={"revealed": 1}
        ).json()
        assert second["revealed"] == 2
        assert second["hint"]["id"] != first["hint"]["id"]

        third = client.post(
            "/v1/exercises/first-query-sql/hints/next", json={"revealed": 2}
        ).json()
        assert third["revealed"] == 3
        assert third["canRequestMore"] is False

        exhausted = client.post(
            "/v1/exercises/first-query-sql/hints/next", json={"revealed": 3}
        ).json()
        assert exhausted["hint"] is None
        assert exhausted["canRequestMore"] is False


def test_mastery_hints_are_limited():
    with TestClient(app) as client:
        meta = client.get("/v1/exercises/first-query-mastery").json()
        assert meta["hint_count"] == 1

        first = client.post(
            "/v1/exercises/first-query-mastery/hints/next", json={"revealed": 0}
        ).json()
        assert first["hint"] is not None
        assert first["total"] == 1
        assert first["canRequestMore"] is False

        done = client.post(
            "/v1/exercises/first-query-mastery/hints/next", json={"revealed": 1}
        ).json()
        assert done["hint"] is None


def test_public_payloads_leak_no_solution_or_hidden_tests():
    with TestClient(app) as client:
        body = client.get("/v1/exercises").json()
        text = json.dumps(body, ensure_ascii=False)
        assert '"hints"' not in text
        for marker in ("zz-probe", "EXPECTED_ROWS", "validation-plan", "reference_solution"):
            assert marker not in text
        assert all("hint_count" in exercise for exercise in body["exercises"])

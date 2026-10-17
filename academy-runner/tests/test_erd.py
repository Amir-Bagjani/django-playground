"""ERD exercise: structural grading, alternative designs, malformed input, drafts."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app import erd_checks, exercises, progress
from app.main import app

EXERCISE_ID = "erd-customer-order"


def attr(aid: str, name: str, type_: str, *, pk: bool = False, unique: bool = False, nullable: bool = True) -> dict:
    return {"id": aid, "name": name, "type": type_, "nullable": nullable, "primaryKey": pk, "unique": unique}


def correct_graph() -> dict:
    return {
        "schema_version": 1,
        "entities": [
            {
                "id": "e_customers",
                "name": "customers",
                "attributes": [
                    attr("a1", "id", "INT", pk=True, unique=True, nullable=False),
                    attr("a2", "full_name", "VARCHAR(120)", nullable=False),
                    attr("a3", "email", "VARCHAR(160)", unique=True, nullable=False),
                ],
            },
            {
                "id": "e_orders",
                "name": "orders",
                "attributes": [
                    attr("a4", "id", "INT", pk=True, unique=True, nullable=False),
                    attr("a5", "total", "DECIMAL(12,2)", nullable=False),
                    attr("a6", "customer_id", "INT", nullable=False),
                ],
            },
        ],
        "relationships": [
            {
                "id": "r1",
                "fromEntityId": "e_customers",
                "toEntityId": "e_orders",
                "fromCardinality": "one",
                "toCardinality": "many",
                "optionality": "mandatory",
                "foreignKeyAttributeId": "a6",
            }
        ],
    }


def statuses(result: dict) -> dict[str, str]:
    return {check["criterionId"]: check["status"] for check in result["checks"]}


def spec():
    found = exercises.get_spec(EXERCISE_ID)
    assert found is not None
    return found


def test_correct_design_passes():
    result = erd_checks.build_payload(spec(), correct_graph())
    assert result["status"] == "passed"
    assert result["passed"] is True
    assert statuses(result)["referential-integrity"] == "passed"
    # The rationale criterion is manual and never called wrong.
    assert statuses(result)["design-rationale"] == "needs_manual_review"


def test_semantically_equivalent_design_passes():
    # Singular names, renamed FK column, different numeric spellings, reversed
    # drawing direction, an extra table and different coordinates.
    graph = {
        "schema_version": 1,
        "entities": [
            {
                "id": "c",
                "name": "Customer",
                "position": {"x": 500, "y": 10},
                "attributes": [
                    attr("c1", "id", "BIGINT", pk=True, nullable=False),
                    attr("c2", "name", "TEXT", nullable=False),
                    attr("c3", "email", "TEXT", unique=True, nullable=False),
                ],
            },
            {
                "id": "o",
                "name": "Order",
                "position": {"x": 10, "y": 400},
                "attributes": [
                    attr("o1", "id", "BIGINT", pk=True, nullable=False),
                    attr("o2", "amount", "NUMERIC(12,2)", nullable=False),
                    attr("o3", "customer", "BIGINT", nullable=False),
                ],
            },
            {"id": "log", "name": "audit_logs", "attributes": [attr("l1", "id", "BIGINT", pk=True, nullable=False)]},
        ],
        "relationships": [
            {
                "id": "r",
                "fromEntityId": "o",
                "toEntityId": "c",
                "fromCardinality": "many",
                "toCardinality": "one",
                "optionality": "mandatory",
                "foreignKeyAttributeId": "o3",
            }
        ],
    }
    result = erd_checks.build_payload(spec(), graph)
    assert result["passed"] is True, result["checks"]


def test_wrong_cardinality_fails_with_criterion():
    graph = correct_graph()
    graph["relationships"][0]["optionality"] = "optional"
    result = erd_checks.build_payload(spec(), graph)
    assert result["passed"] is False
    assert result["outcome"] == "validation_failed"
    assert statuses(result)["relationship-cardinality"] == "failed"


def test_missing_unique_constraint_fails():
    graph = correct_graph()
    # email is no longer unique nor non-nullable.
    graph["entities"][0]["attributes"][2]["unique"] = False
    result = erd_checks.build_payload(spec(), graph)
    assert result["passed"] is False
    assert statuses(result)["unique-constraint"] == "failed"


def test_foreign_key_on_wrong_side_fails():
    graph = correct_graph()
    # Move the FK column onto customers and point the relationship at it.
    del graph["entities"][1]["attributes"][2]
    graph["entities"][0]["attributes"].append(attr("a6", "customer_id", "INT", nullable=False))
    graph["relationships"][0]["foreignKeyAttributeId"] = "a6"
    result = erd_checks.build_payload(spec(), graph)
    assert result["passed"] is False
    assert statuses(result)["foreign-key"] == "failed"
    assert statuses(result)["required-attributes"] == "failed"


def test_dangling_reference_is_reported_not_crashed():
    graph = correct_graph()
    graph["relationships"][0]["toEntityId"] = "does_not_exist"
    result = erd_checks.build_payload(spec(), graph)
    assert result["status"] == "failed"
    assert statuses(result)["referential-integrity"] == "failed"


def test_unsupported_schema_version_is_a_learner_error():
    graph = correct_graph()
    graph["schema_version"] = 2
    result = erd_checks.build_payload(spec(), graph)
    assert result["status"] == "error"
    assert result["outcome"] == "invalid_graph"
    assert result["passed"] is False


def test_duplicate_entity_name_is_a_learner_error():
    graph = correct_graph()
    graph["entities"][1]["name"] = "Customers"
    result = erd_checks.build_payload(spec(), graph)
    assert result["status"] == "error"
    assert result["outcome"] == "invalid_graph"


def test_unknown_exercise_id_is_404():
    with TestClient(app) as client:
        assert client.get("/v1/exercises/erd-nope").status_code == 404


def test_draft_roundtrip_and_reset_clears_only_draft():
    with TestClient(app) as client:
        saved = client.put(f"/v1/exercises/{EXERCISE_ID}/draft", json={"graph": correct_graph()}).json()
        assert saved["status"] == "ok"
        fetched = client.get(f"/v1/exercises/{EXERCISE_ID}/draft").json()
        assert fetched["graph"]["entities"][0]["name"] == "customers"
        assert fetched["updatedAt"]

        # Real pass, then Reset: the draft is gone, the pass stays.
        evaluated = client.post(
            f"/v1/exercises/{EXERCISE_ID}/evaluate",
            json={"exerciseId": EXERCISE_ID, "graph": correct_graph()},
        ).json()
        assert evaluated["passed"] is True
        assert evaluated["progress"]["status"] == "completed"

        client.post(f"/v1/exercises/{EXERCISE_ID}/reset")
        assert client.get(f"/v1/exercises/{EXERCISE_ID}/draft").json()["graph"] is None
        assert progress.snapshot()["lessons"]["DB-03-002"]["completed"] is True
        assert progress.snapshot()["totals"]["passes"] == 1


def test_erd_evaluate_requires_a_graph_document():
    with TestClient(app) as client:
        response = client.post(
            f"/v1/exercises/{EXERCISE_ID}/evaluate",
            json={"exerciseId": EXERCISE_ID, "source": ""},
        )
        assert response.status_code == 400


def test_draft_is_persisted_as_json_roundtrip():
    progress.save_draft(exercise_id=EXERCISE_ID, graph=json.dumps(correct_graph()))
    stored = progress.get_draft(exercise_id=EXERCISE_ID)
    assert stored is not None
    assert stored["graph"]["relationships"][0]["fromCardinality"] == "one"
    progress.clear_draft(exercise_id=EXERCISE_ID)
    assert progress.get_draft(exercise_id=EXERCISE_ID) is None

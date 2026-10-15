"""Tests for built-in and personal example management (PRD 02)."""
import json

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _create(client: TestClient, name: str, template: str) -> str:
    response = client.post(
        "/v1/examples", json={"name": name, "fromTemplateId": template}
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_builtin_examples_present(client: TestClient) -> None:
    data = client.get("/v1/examples").json()
    ids = [item["id"] for item in data["builtIn"]]
    assert ids == ["hello", "orm", "crud"]
    assert all(item["readOnly"] for item in data["builtIn"])
    templates = {item["id"] for item in data["templates"]}
    assert {"scratch", "hello", "orm", "crud"} <= templates


def test_builtin_examples_are_read_only(client: TestClient) -> None:
    assert client.patch("/v1/examples/hello", json={"name": "x"}).status_code == 403
    assert client.delete("/v1/examples/hello").status_code == 403
    assert client.post("/v1/examples/hello/activate").status_code == 403

    listing = client.get("/v1/files", params={"exampleId": "hello"}).json()
    assert listing["readOnly"] is True
    assert all(not entry["editable"] for entry in listing["files"])
    content = client.get(
        "/v1/files/content", params={"exampleId": "hello", "path": "demo/views.py"}
    ).json()
    assert content["editable"] is False


def test_unknown_id_errors(client: TestClient) -> None:
    assert client.get("/v1/examples/does-not-exist").status_code == 404
    assert client.patch("/v1/examples/does-not-exist", json={"name": "x"}).status_code == 404
    assert client.delete("/v1/examples/does-not-exist").status_code == 404
    assert client.post("/v1/examples/does-not-exist/activate").status_code == 404


def test_create_requires_a_name(client: TestClient) -> None:
    assert client.post("/v1/examples", json={"name": "   "}).status_code == 400
    assert client.post(
        "/v1/examples", json={"name": "x", "fromTemplateId": "nope"}
    ).status_code == 400


def test_create_rename_duplicate_delete_and_switch(client: TestClient) -> None:
    alpha = _create(client, "Alpha", "scratch")

    renamed = client.patch(f"/v1/examples/{alpha}", json={"name": "Alpha Renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Alpha Renamed"

    duplicate = client.post(f"/v1/examples/{alpha}/duplicate")
    assert duplicate.status_code == 201
    beta = duplicate.json()["id"]
    assert beta != alpha
    assert duplicate.json()["name"].endswith("(copy)")

    # Editing the duplicate must not touch the source.
    original = client.get(
        "/v1/files/content", params={"exampleId": alpha, "path": "demo/views.py"}
    ).json()["content"]
    assert '"Hello!"' in original

    activated = client.post(f"/v1/examples/{beta}/activate")
    assert activated.status_code == 200
    client.put(
        "/v1/files/content",
        json={"path": "demo/views.py", "content": original.replace('"Hello!"', '"Beta!"')},
    )

    alpha_after = client.get(
        "/v1/files/content", params={"exampleId": alpha, "path": "demo/views.py"}
    ).json()["content"]
    beta_after = client.get(
        "/v1/files/content", params={"exampleId": beta, "path": "demo/views.py"}
    ).json()["content"]
    assert alpha_after == original
    assert '"Beta!"' in beta_after

    assert client.get("/v1/examples").json()["activeExampleId"] == beta

    # Each example has its own SQLite file.
    assert (storage.project_dir(alpha) / "db.sqlite3").exists()
    assert (storage.project_dir(beta) / "db.sqlite3").exists()
    assert storage.project_dir(alpha) != storage.project_dir(beta)

    # Deleting the active example switches to another personal example.
    deleted = client.delete(f"/v1/examples/{beta}")
    assert deleted.status_code == 200
    data = client.get("/v1/examples").json()
    assert data["activeExampleId"] != beta
    assert all(item["id"] != beta for item in data["personal"])

    client.delete(f"/v1/examples/{alpha}")


def test_crud_example_serves_and_mutates_items(client: TestClient) -> None:
    example_id = _create(client, "CRUD Test", "crud")
    client.post(f"/v1/examples/{example_id}/activate")

    assert client.post("/v1/runtime/start").json()["state"] == "running"
    try:
        listing = client.post(
            "/v1/runtime/request", json={"method": "GET", "path": "/api/items/"}
        ).json()
        assert listing["status"] == 200
        assert len(json.loads(listing["body"])) == 2

        created = client.post(
            "/v1/runtime/request",
            json={
                "method": "POST",
                "path": "/api/items/",
                "headers": {"content-type": "application/json"},
                "body": json.dumps({"name": "New Item", "description": "created in test"}),
            },
        ).json()
        assert created["status"] == 201

        after = client.post(
            "/v1/runtime/request", json={"method": "GET", "path": "/api/items/"}
        ).json()
        assert len(json.loads(after["body"])) == 3
    finally:
        client.post("/v1/runtime/stop")

    client.delete(f"/v1/examples/{example_id}")


def test_switching_example_stops_the_runtime(client: TestClient) -> None:
    first = _create(client, "Switch A", "scratch")
    second = _create(client, "Switch B", "scratch")

    client.post(f"/v1/examples/{first}/activate")
    assert client.post("/v1/runtime/start").json()["state"] == "running"

    client.post(f"/v1/examples/{second}/activate")
    assert client.get("/v1/runtime/status").json()["state"] == "stopped"

    client.delete(f"/v1/examples/{second}")
    client.delete(f"/v1/examples/{first}")

"""PRD 04: example and dataset import/export round-trips, plus the failure and
rollback paths that must never damage existing data.
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _new_example(client: TestClient, name: str, template: str = "scratch") -> str:
    created = client.post(
        "/v1/examples", json={"name": name, "fromTemplateId": template}
    ).json()
    client.post(f"/v1/examples/{created['id']}/activate")
    return created["id"]


def _get_file(client: TestClient, path: str) -> str:
    return client.get("/v1/files/content", params={"path": path}).json()["content"]


# -- Example import / export ---------------------------------------------
def test_example_round_trip_is_independent(client: TestClient) -> None:
    source = _new_example(client, "Export Source", "crud")
    views = _get_file(client, "demo/views.py")
    client.put(
        "/v1/files/content",
        json={"path": "demo/views.py", "content": views + "\nMARKER = 'round-trip'\n"},
    )
    client.post(
        "/v1/requests",
        json={
            "name": "List items",
            "method": "GET",
            "path": "/api/items/",
            "headers": [
                {"key": "Authorization", "value": "Bearer super-secret"},
                {"key": "Accept", "value": "application/json"},
            ],
        },
    )

    export = client.get(f"/v1/examples/{source}/export").json()
    assert export["format"] == "django-playground.example"
    assert export["version"] == 1
    assert "manage.py" in export["files"]
    assert "db.sqlite3" not in export["files"]
    assert "MARKER = 'round-trip'" in export["files"]["demo/views.py"]
    # Sensitive headers are stripped from the exported request.
    assert export["redactedSensitiveHeaders"] is True
    assert len(export["requests"]) == 1
    exported_headers = export["requests"][0]["headers"]
    assert [header["key"] for header in exported_headers] == ["Accept"]

    imported = client.post("/v1/examples/import", json=export)
    assert imported.status_code == 201, imported.text
    new_id = imported.json()["id"]
    assert new_id != source
    # The first saved request becomes the default test path.
    assert imported.json()["defaultRequestPath"] == "/api/items/"

    client.post(f"/v1/examples/{new_id}/activate")
    assert "MARKER = 'round-trip'" in _get_file(client, "demo/views.py")
    assert len(client.get("/v1/requests").json()["requests"]) == 1

    # Editing the import must not touch the source example.
    client.put(
        "/v1/files/content",
        json={"path": "demo/views.py", "content": "# changed in the import\n"},
    )
    client.post(f"/v1/examples/{source}/activate")
    assert "MARKER = 'round-trip'" in _get_file(client, "demo/views.py")
    assert len(client.get("/v1/requests").json()["requests"]) == 1


def test_builtin_example_can_be_exported(client: TestClient) -> None:
    payload = client.get("/v1/examples/crud/export").json()
    assert payload["format"] == "django-playground.example"
    assert payload["requests"] == []
    assert "manage.py" in payload["files"]


def test_export_can_include_dataset(client: TestClient) -> None:
    example_id = _new_example(client, "Export With Dataset", "crud")
    without = client.get(f"/v1/examples/{example_id}/export").json()
    assert "dataset" not in without

    with_dataset = client.get(
        f"/v1/examples/{example_id}/export", params={"includeDataset": "true"}
    ).json()
    records = with_dataset["dataset"]["records"]
    assert len(records) == 2
    assert all(record["model"] == "demo.item" for record in records)


def test_import_rejects_invalid_payloads_without_side_effects(client: TestClient) -> None:
    _new_example(client, "Import Guard", "scratch")
    before = len(client.get("/v1/examples").json()["personal"])

    base = {
        "format": "django-playground.example",
        "version": 1,
        "metadata": {"name": "Minimal"},
        "files": {"manage.py": "print('hi')\n"},
        "requests": [],
    }

    def bad(payload: dict) -> int:
        return client.post("/v1/examples/import", json=payload).status_code

    assert bad({**base, "format": "something-else"}) == 400
    assert bad({**base, "version": 999}) == 400
    assert bad({**base, "metadata": {"name": "  "}}) == 400
    assert bad({**base, "files": {}}) == 400
    assert bad({**base, "files": {"demo/views.py": "x"}}) == 400  # no manage.py
    assert bad({**base, "files": {"manage.py": "x", "../evil.py": "y"}}) == 400
    assert bad({**base, "files": {"manage.py": "x", "demo/notes.bin": "z"}}) == 400
    assert bad({**base, "files": {"manage.py": "x", "demo/views.py": 123}}) == 400
    assert bad({**base, "requests": [{"name": "x", "method": "GET", "path": "https://x/"}]}) == 400

    # Corrupt JSON and an oversized body are caught before any validation.
    assert (
        client.post(
            "/v1/examples/import",
            content="not json",
            headers={"content-type": "application/json"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/v1/examples/import",
            content=b"x" * (5 * 1024 * 1024 + 32),
            headers={"content-type": "application/json"},
        ).status_code
        == 413
    )

    assert len(client.get("/v1/examples").json()["personal"]) == before


def test_import_with_broken_python_is_saved_and_fails_at_runtime(client: TestClient) -> None:
    source = _new_example(client, "Broken Source", "crud")
    export = client.get(f"/v1/examples/{source}/export").json()
    export["files"]["demo/views.py"] = "def broken(\n"

    imported = client.post("/v1/examples/import", json=export)
    assert imported.status_code == 201
    client.post(f"/v1/examples/{imported.json()['id']}/activate")

    started = client.post("/v1/runtime/start").json()
    assert started["state"] == "error"
    client.post("/v1/runtime/stop")


# -- Dataset import / export ---------------------------------------------
def test_dataset_replace_round_trip(client: TestClient) -> None:
    example_id = _new_example(client, "Dataset Round Trip", "crud")

    exported = client.get(f"/v1/examples/{example_id}/dataset/export").json()
    assert exported["format"] == "django-playground.dataset"
    assert exported["sourceApp"] == "demo"
    assert len(exported["records"]) == 2

    preview = client.post(f"/v1/examples/{example_id}/dataset/preview", json=exported).json()
    assert preview["recordCount"] == 2
    assert preview["compatible"] is True

    # Change the data: delete one row through the real API.
    assert client.post("/v1/runtime/start").json()["state"] == "running"
    try:
        listing = client.post(
            "/v1/runtime/request", json={"method": "GET", "path": "/api/items/"}
        ).json()
        first_id = json.loads(listing["body"])[0]["id"]
        client.post(
            "/v1/runtime/request",
            json={"method": "DELETE", "path": f"/api/items/{first_id}/"},
        )
    finally:
        client.post("/v1/runtime/stop")
    assert client.get("/v1/database/tables/demo_item").json()["rowCount"] == 1

    result = client.post(f"/v1/examples/{example_id}/dataset/replace", json=exported).json()
    assert result["success"] is True
    assert result["loaded"] == 2
    assert client.get("/v1/database/tables/demo_item").json()["rowCount"] == 2


def test_dataset_schema_mismatch_keeps_old_data(client: TestClient) -> None:
    example_id = _new_example(client, "Dataset Bad", "crud")
    before = client.get("/v1/database/tables/demo_item").json()["rowCount"]

    incompatible = {
        "format": "django-playground.dataset",
        "version": 1,
        "sourceApp": "demo",
        "records": [{"model": "demo.ghost", "pk": 1, "fields": {"name": "x"}}],
    }
    preview = client.post(
        f"/v1/examples/{example_id}/dataset/preview", json=incompatible
    ).json()
    assert preview["compatible"] is False
    assert "demo.ghost" in preview["missingModels"]

    assert (
        client.post(
            f"/v1/examples/{example_id}/dataset/replace", json=incompatible
        ).status_code
        == 400
    )
    # The previous data is untouched after the failed replace.
    assert client.get("/v1/database/tables/demo_item").json()["rowCount"] == before

    # Malformed dataset files are rejected at preview time too.
    assert (
        client.post(
            f"/v1/examples/{example_id}/dataset/preview",
            json={"format": "nope", "version": 1, "records": []},
        ).status_code
        == 400
    )


def test_builtin_dataset_operations_are_forbidden(client: TestClient) -> None:
    assert client.get("/v1/examples/crud/dataset/export").status_code == 403
    assert (
        client.post(
            "/v1/examples/crud/dataset/preview",
            json={"format": "django-playground.dataset", "version": 1, "records": []},
        ).status_code
        == 403
    )

"""PRD 03: API tester request forwarding, saved requests, database explorer and
migration actions. Runs inside the runner container against real Django + SQLite.
"""
import json
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app

MODELS_WITH_FIELD = (
    "from django.db import models\n"
    "\n"
    "\n"
    "class Item(models.Model):\n"
    "    name = models.CharField(max_length=200)\n"
    '    description = models.TextField(blank=True, default="")\n'
    "    quantity = models.IntegerField(default=0)\n"
    "    created_at = models.DateTimeField(auto_now_add=True)\n"
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _new_example(client: TestClient, name: str, template: str) -> str:
    created = client.post(
        "/v1/examples", json={"name": name, "fromTemplateId": template}
    ).json()
    client.post(f"/v1/examples/{created['id']}/activate")
    return created["id"]


def _items(client: TestClient) -> list:
    result = client.post(
        "/v1/runtime/request", json={"method": "GET", "path": "/api/items/"}
    ).json()
    assert result["status"] == 200, result["body"]
    return json.loads(result["body"])


# -- API tester -----------------------------------------------------------
def test_api_crud_is_reflected_in_the_database(client: TestClient) -> None:
    _new_example(client, "API and DB", "crud")
    assert client.post("/v1/runtime/start").json()["state"] == "running"
    try:
        assert len(_items(client)) == 2

        # A spoofed Host header must be filtered before Django sees it; otherwise
        # ALLOWED_HOSTS would answer 400.
        spoofed = client.post(
            "/v1/runtime/request",
            json={
                "method": "GET",
                "path": "/api/items/",
                "headers": {"host": "evil.example.com"},
            },
        ).json()
        assert spoofed["status"] == 200

        created = client.post(
            "/v1/runtime/request",
            json={
                "method": "POST",
                "path": "/api/items/",
                "headers": {"content-type": "application/json"},
                "body": json.dumps({"name": "Created via API", "description": "prd03"}),
            },
        ).json()
        assert created["status"] == 201
        new_id = json.loads(created["body"])["id"]

        # The Database Explorer sees the new row immediately.
        assert client.get("/v1/database/tables/demo_item").json()["rowCount"] == 3

        patched = client.post(
            "/v1/runtime/request",
            json={
                "method": "PATCH",
                "path": f"/api/items/{new_id}/",
                "headers": {"content-type": "application/json"},
                "body": json.dumps({"name": "Patched name"}),
            },
        ).json()
        assert patched["status"] == 200
        assert json.loads(patched["body"])["name"] == "Patched name"

        rows = client.get(
            "/v1/database/tables/demo_item/rows", params={"limit": 100}
        ).json()
        name_index = rows["columns"].index("name")
        assert "Patched name" in [row[name_index] for row in rows["rows"]]

        deleted = client.post(
            "/v1/runtime/request",
            json={"method": "DELETE", "path": f"/api/items/{new_id}/"},
        ).json()
        assert deleted["status"] == 204
        assert client.get("/v1/database/tables/demo_item").json()["rowCount"] == 2

        # Real validation error keeps its 400 status and JSON body.
        invalid = client.post(
            "/v1/runtime/request",
            json={
                "method": "POST",
                "path": "/api/items/",
                "headers": {"content-type": "application/json"},
                "body": json.dumps({"name": ""}),
            },
        ).json()
        assert invalid["status"] == 400
        assert "name" in invalid["body"]
    finally:
        client.post("/v1/runtime/stop")


def test_request_when_server_stopped_is_clear(client: TestClient) -> None:
    _new_example(client, "Stopped server", "scratch")
    client.post("/v1/runtime/stop")
    response = client.post(
        "/v1/runtime/request", json={"method": "GET", "path": "/api/hello/"}
    )
    assert response.status_code == 409
    assert "run" in response.json()["detail"].lower()


def test_request_rejects_external_destination(client: TestClient) -> None:
    _new_example(client, "SSRF guard", "scratch")
    client.post("/v1/runtime/start")
    try:
        for bad in ("https://example.com/", "//example.com/x", "api/hello/"):
            response = client.post(
                "/v1/runtime/request", json={"method": "GET", "path": bad}
            )
            assert response.status_code == 409
    finally:
        client.post("/v1/runtime/stop")


# -- Saved requests -------------------------------------------------------
def test_saved_requests_lifecycle_and_isolation(client: TestClient) -> None:
    first = _new_example(client, "Requests A", "scratch")
    response = client.post(
        "/v1/requests",
        json={
            "name": "List items",
            "method": "GET",
            "path": "/api/items/",
            "headers": [{"key": "Accept", "value": "application/json"}],
        },
    )
    assert response.status_code == 201
    created = response.json()
    assert created["method"] == "GET"
    assert created["headers"][0] == {"key": "Accept", "value": "application/json"}

    listed = client.get("/v1/requests").json()["requests"]
    assert [item["name"] for item in listed] == ["List items"]

    updated = client.patch(
        f"/v1/requests/{created['id']}",
        json={"name": "Renamed", "method": "POST", "body": "{}"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"
    assert updated.json()["method"] == "POST"
    assert updated.json()["body"] == "{}"

    # A different example must not see the first example's requests.
    _new_example(client, "Requests B", "scratch")
    assert client.get("/v1/requests").json()["requests"] == []

    client.post(f"/v1/examples/{first}/activate")
    assert len(client.get("/v1/requests").json()["requests"]) == 1

    assert client.delete(f"/v1/requests/{created['id']}").status_code == 200
    assert client.get("/v1/requests").json()["requests"] == []
    assert client.delete(f"/v1/requests/{created['id']}").status_code == 404


def test_saved_request_validation(client: TestClient) -> None:
    _new_example(client, "Requests validation", "scratch")
    assert (
        client.post(
            "/v1/requests", json={"name": "x", "method": "FOO", "path": "/a/"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/v1/requests",
            json={"name": "x", "method": "GET", "path": "https://evil.example.com/"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/v1/requests", json={"name": "  ", "method": "GET", "path": "/a/"}
        ).status_code
        == 400
    )
    assert client.get("/v1/requests").json()["requests"] == []


# -- Database explorer ----------------------------------------------------
def test_database_explorer_metadata_and_pagination(client: TestClient) -> None:
    _new_example(client, "DB explorer", "crud")
    tables = client.get("/v1/database/tables").json()
    assert tables["available"] is True
    counts = {entry["name"]: entry["rowCount"] for entry in tables["tables"]}
    assert counts.get("demo_item") == 2

    detail = client.get("/v1/database/tables/demo_item").json()
    columns = {column["name"] for column in detail["columns"]}
    assert {"id", "name", "description"} <= columns
    assert detail["rowCount"] == 2

    page = client.get(
        "/v1/database/tables/demo_item/rows", params={"limit": 1, "offset": 0}
    ).json()
    assert page["total"] == 2
    assert len(page["rows"]) == 1
    assert page["limit"] == 1

    over_limit = client.get(
        "/v1/database/tables/demo_item/rows", params={"limit": 9999}
    )
    assert over_limit.status_code == 422

    # The module itself also clamps, as defence in depth.
    from app import database as db_module

    active_id = storage.read_state()["activeExampleId"]
    clamped = db_module.table_rows(
        storage.project_dir(active_id), "demo_item", limit=9999
    )
    assert clamped["limit"] == 100


def test_database_rejects_unknown_and_injection_tables(client: TestClient) -> None:
    _new_example(client, "DB guard", "crud")
    assert client.get("/v1/database/tables/does_not_exist").status_code == 404
    assert client.get("/v1/database/tables/demo_item;--").status_code == 404
    evil = quote('demo_item"; DROP TABLE demo_item; --', safe="")
    assert client.get(f"/v1/database/tables/{evil}").status_code == 404
    names = {entry["name"] for entry in client.get("/v1/database/tables").json()["tables"]}
    assert "demo_item" in names


def test_database_unavailable_before_migrations(client: TestClient) -> None:
    example_id = _new_example(client, "DB offline", "crud")
    # Remove the generated database to emulate a not-yet-migrated example.
    (storage.project_dir(example_id) / "db.sqlite3").unlink()
    tables = client.get("/v1/database/tables").json()
    assert tables == {"available": False, "tables": []}
    assert client.get("/v1/database/tables/demo_item").status_code == 409


# -- Migration actions ----------------------------------------------------
def test_apply_db_changes_adds_a_column(client: TestClient) -> None:
    _new_example(client, "Migrate ok", "crud")
    original = client.get(
        "/v1/files/content", params={"path": "demo/models.py"}
    ).json()["content"]
    assert "quantity" not in original
    try:
        write = client.put(
            "/v1/files/content",
            json={"path": "demo/models.py", "content": MODELS_WITH_FIELD},
        )
        assert write.status_code == 200

        result = client.post("/v1/database/migrate").json()
        assert result["success"] is True
        assert [step["command"] for step in result["steps"]] == [
            "python manage.py makemigrations demo",
            "python manage.py migrate --noinput",
        ]
        assert all(step["success"] for step in result["steps"])

        columns = {
            column["name"]
            for column in client.get("/v1/database/tables/demo_item").json()["columns"]
        }
        assert "quantity" in columns
    finally:
        client.put(
            "/v1/files/content",
            json={"path": "demo/models.py", "content": original},
        )


def test_apply_db_changes_reports_failure(client: TestClient) -> None:
    _new_example(client, "Migrate fail", "crud")
    original = client.get(
        "/v1/files/content", params={"path": "demo/models.py"}
    ).json()["content"]
    try:
        client.put(
            "/v1/files/content",
            json={"path": "demo/models.py", "content": "class Item(:\n"},
        )
        result = client.post("/v1/database/migrate").json()
        assert result["success"] is False
        assert result["steps"][0]["success"] is False
        assert result["steps"][0]["output"]
        assert result["restarted"] is False
    finally:
        client.put(
            "/v1/files/content",
            json={"path": "demo/models.py", "content": original},
        )

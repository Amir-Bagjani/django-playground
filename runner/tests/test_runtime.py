"""End-to-end tests that really start the Django child process.

These run inside the runner container where Django is installed:
    docker compose exec runner python -m pytest
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        created = test_client.post(
            "/v1/examples",
            json={"name": "Runtime Tests", "fromTemplateId": "scratch"},
        ).json()
        test_client.post(f"/v1/examples/{created['id']}/activate")
        yield test_client


def _get_content(client: TestClient, path: str) -> str:
    return client.get("/v1/files/content", params={"path": path}).json()["content"]


def test_workspace_defaults(client: TestClient) -> None:
    data = client.get("/v1/workspace").json()
    assert data["name"] == "Runtime Tests"
    assert data["defaultOpenFile"] == "demo/views.py"
    assert data["defaultRequestPath"] == "/api/hello/"
    assert data["readOnly"] is False
    paths = [entry["path"] for entry in client.get("/v1/files").json()["files"]]
    assert "demo/views.py" in paths
    assert "manage.py" in paths


def test_request_before_start_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/v1/runtime/request", json={"method": "GET", "path": "/api/hello/"}
    )
    assert response.status_code == 409


def test_api_rejects_path_traversal(client: TestClient) -> None:
    response = client.get("/v1/files/content", params={"path": "../../etc/passwd"})
    assert response.status_code == 400


def test_save_run_and_update_response(client: TestClient) -> None:
    original = _get_content(client, "demo/views.py")
    try:
        modified = original.replace('"Hello!"', '"Salam from test!"')
        assert modified != original

        saved = client.put(
            "/v1/files/content",
            json={"path": "demo/views.py", "content": modified},
        )
        assert saved.status_code == 200 and saved.json()["saved"] is True

        started = client.post("/v1/runtime/start")
        assert started.status_code == 200
        assert started.json()["state"] == "running"

        result = client.post(
            "/v1/runtime/request", json={"method": "GET", "path": "/api/hello/"}
        ).json()
        assert result["status"] == 200
        assert "Salam from test!" in result["body"]

        stopped = client.post("/v1/runtime/stop")
        assert stopped.json()["state"] == "stopped"
    finally:
        client.put("/v1/files/content", json={"path": "demo/views.py", "content": original})


def test_syntax_error_surfaces_without_crashing_control_api(client: TestClient) -> None:
    original = _get_content(client, "demo/views.py")
    try:
        broken = "def hello(request)\n    return None\n"
        client.put("/v1/files/content", json={"path": "demo/views.py", "content": broken})

        started = client.post("/v1/runtime/start")
        assert started.status_code == 200
        assert started.json()["state"] == "error"

        logs = client.get("/v1/runtime/logs").json()["lines"]
        assert any("Error" in line for line in logs)

        assert client.get("/health").json()["status"] == "ok"

        client.put("/v1/files/content", json={"path": "demo/views.py", "content": original})
        recovered = client.post("/v1/runtime/start")
        assert recovered.json()["state"] == "running"
        client.post("/v1/runtime/stop")
    finally:
        client.put("/v1/files/content", json={"path": "demo/views.py", "content": original})


def test_request_rejects_external_url(client: TestClient) -> None:
    assert client.post("/v1/runtime/start").json()["state"] == "running"
    try:
        for bad_path in ("https://example.com/", "//example.com/", "api/hello/"):
            response = client.post(
                "/v1/runtime/request", json={"method": "GET", "path": bad_path}
            )
            assert response.status_code == 409
    finally:
        client.post("/v1/runtime/stop")

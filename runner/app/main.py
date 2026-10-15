"""FastAPI control API for the Django Playground runner.

This API is intentionally *not* published to the host. Only the Next.js BFF
reaches it over the internal Docker network.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import database, examples, migrations, requests_store
from . import files as files_module
from . import runtime, storage
from .database import DatabaseError, DatabaseUnavailable, TableNotFound
from .examples import (
    ExampleError,
    ExampleNotFound,
    ExampleReadOnly,
    ExampleValidation,
)
from .files import PathError
from .requests_store import RequestNotFound, RequestValidation
from .runtime import RuntimeError_

DEFAULT_OPEN_FILE = "demo/views.py"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    examples.ensure_active_example()
    yield
    runtime.manager.stop()


app = FastAPI(title="Django Playground Runner", version="0.3.0", lifespan=lifespan)


# -- helpers --------------------------------------------------------------
class FileWrite(BaseModel):
    path: str
    content: str = Field(default="")


class ExampleCreate(BaseModel):
    name: str
    description: str | None = None
    fromTemplateId: str | None = None


class ExampleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class HttpRequestModel(BaseModel):
    method: str = "GET"
    path: str
    headers: dict[str, str] | None = None
    body: str | None = None


class SavedRequestCreate(BaseModel):
    name: str
    method: str = "GET"
    path: str
    headers: list[dict[str, str]] | None = None
    body: str | None = None


class SavedRequestUpdate(BaseModel):
    name: str | None = None
    method: str | None = None
    path: str | None = None
    headers: list[dict[str, str]] | None = None
    body: str | None = None


def _active_example() -> dict:
    meta = examples.active_example()
    if meta is None:
        meta = examples.ensure_active_example()
    return meta


def _workspace_payload(meta: dict | None = None) -> dict:
    meta = meta or _active_example()
    return {
        "id": meta["id"],
        "name": meta["name"],
        "description": meta.get("description", ""),
        "readOnly": bool(meta.get("readOnly", False)),
        "defaultOpenFile": DEFAULT_OPEN_FILE,
        "defaultRequestPath": examples.default_request_path(meta),
        "runtime": runtime.manager.status(),
    }


def _resolve(example_id: str | None):
    if example_id is None:
        meta = _active_example()
        return storage.project_dir(meta["id"]), False, meta
    try:
        return examples.resolve_example(example_id)
    except ExampleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# -- endpoints ------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "runner"}


@app.get("/v1/examples")
def list_examples() -> dict:
    return examples.list_examples()


@app.post("/v1/examples", status_code=status.HTTP_201_CREATED)
def create_example(payload: ExampleCreate) -> dict:
    try:
        meta = examples.create_example(
            payload.name, payload.description, payload.fromTemplateId
        )
    except ExampleValidation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return examples.decorate(meta)


@app.get("/v1/examples/{example_id}")
def get_example(example_id: str) -> dict:
    try:
        _root, read_only, meta = examples.resolve_example(example_id)
    except ExampleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    item = examples.decorate(meta)
    item["active"] = storage.read_state().get("activeExampleId") == example_id
    return item


@app.patch("/v1/examples/{example_id}")
def update_example(example_id: str, payload: ExampleUpdate) -> dict:
    try:
        meta = examples.update_example(example_id, payload.name, payload.description)
    except ExampleReadOnly as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ExampleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ExampleValidation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return examples.decorate(meta)


@app.delete("/v1/examples/{example_id}")
def delete_example(example_id: str) -> dict:
    try:
        examples.delete_example(example_id)
    except ExampleReadOnly as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ExampleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ExampleError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"deleted": True, "activeExampleId": storage.read_state().get("activeExampleId")}


@app.post("/v1/examples/{example_id}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicate_example(example_id: str) -> dict:
    try:
        meta = examples.duplicate_example(example_id)
    except ExampleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return examples.decorate(meta)


@app.post("/v1/examples/{example_id}/activate")
def activate_example(example_id: str) -> dict:
    try:
        meta = examples.activate_example(example_id)
    except ExampleReadOnly as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ExampleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _workspace_payload(meta)


@app.get("/v1/workspace")
def get_workspace() -> dict:
    return _workspace_payload()


@app.get("/v1/files")
def get_files(exampleId: str | None = Query(default=None)) -> dict:
    root, read_only, _meta = _resolve(exampleId)
    entries = []
    for entry in files_module.list_files(root):
        entries.append(
            {"path": entry["path"], "editable": entry["editable"] and not read_only}
        )
    return {"root": "project", "readOnly": read_only, "files": entries}


@app.get("/v1/files/content")
def get_file_content(
    path: str = Query(..., min_length=1), exampleId: str | None = Query(default=None)
) -> dict:
    root, read_only, _meta = _resolve(exampleId)
    try:
        content = files_module.read_text(root, path)
    except PathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": path, "content": content, "editable": not read_only}


@app.put("/v1/files/content")
def put_file_content(payload: FileWrite) -> dict:
    meta = _active_example()
    root = storage.project_dir(meta["id"])
    try:
        files_module.write_text(root, payload.path, payload.content)
    except PathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    meta["updatedAt"] = storage.now()
    storage.save_metadata(meta)
    return {"path": payload.path, "saved": True}


@app.post("/v1/runtime/start")
def runtime_start() -> dict:
    meta = _active_example()
    return runtime.manager.start(storage.project_dir(meta["id"]))


@app.post("/v1/runtime/stop")
def runtime_stop() -> dict:
    return runtime.manager.stop()


@app.get("/v1/runtime/status")
def runtime_status() -> dict:
    return runtime.manager.status()


@app.get("/v1/runtime/logs")
def runtime_logs(limit: int = Query(200, ge=1, le=1000)) -> dict:
    return {"lines": runtime.manager.logs(limit)}


@app.post("/v1/runtime/request")
def runtime_request(payload: HttpRequestModel) -> JSONResponse:
    try:
        result = runtime.manager.forward_request(
            method=payload.method,
            path=payload.path,
            headers=payload.headers,
            body=payload.body,
        )
    except RuntimeError_ as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return JSONResponse(result)


# -- saved requests -------------------------------------------------------
def _active_id() -> str:
    return _active_example()["id"]


@app.get("/v1/requests")
def list_saved_requests() -> dict:
    return {"requests": requests_store.list_requests(_active_id())}


@app.post("/v1/requests", status_code=status.HTTP_201_CREATED)
def create_saved_request(payload: SavedRequestCreate) -> dict:
    try:
        return requests_store.create_request(
            _active_id(),
            payload.name,
            payload.method,
            payload.path,
            payload.headers,
            payload.body,
        )
    except RequestValidation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/v1/requests/{request_id}")
def update_saved_request(request_id: str, payload: SavedRequestUpdate) -> dict:
    try:
        return requests_store.update_request(
            _active_id(),
            request_id,
            name=payload.name,
            method=payload.method,
            path=payload.path,
            headers=payload.headers,
            body=payload.body,
        )
    except RequestValidation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RequestNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/v1/requests/{request_id}")
def delete_saved_request(request_id: str) -> dict:
    try:
        requests_store.delete_request(_active_id(), request_id)
    except RequestNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"deleted": True}


# -- database explorer (read-only) ----------------------------------------
@app.get("/v1/database/tables")
def database_tables() -> dict:
    return database.list_tables(storage.project_dir(_active_id()))


@app.get("/v1/database/tables/{name}")
def database_table(name: str) -> dict:
    try:
        return database.table_detail(storage.project_dir(_active_id()), name)
    except TableNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatabaseUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DatabaseError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/v1/database/tables/{name}/rows")
def database_rows(
    name: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    try:
        return database.table_rows(storage.project_dir(_active_id()), name, limit, offset)
    except TableNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatabaseUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DatabaseError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/v1/database/migrate")
def database_migrate() -> dict:
    return migrations.run_migrations(storage.project_dir(_active_id()))

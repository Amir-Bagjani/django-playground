"""FastAPI control API for the Django Playground runner.

This API is intentionally *not* published to the host. Only the Next.js BFF
reaches it over the internal Docker network.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import files as files_module
from . import storage
from .files import PathError
from .runtime import RuntimeError_, RuntimeManager


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    meta = storage.ensure_scratch()
    runtime.ensure_database(storage.project_dir(meta["id"]))
    yield
    runtime.stop()


app = FastAPI(title="Django Playground Runner", version="0.1.0", lifespan=lifespan)
runtime = RuntimeManager()

DEFAULT_OPEN_FILE = "demo/views.py"


def _active_example() -> dict:
    meta = storage.active_example()
    if meta is None:
        meta = storage.ensure_scratch()
    return meta


def _active_project_root() -> Path:
    return storage.project_dir(_active_example()["id"])


# -- internal helpers -----------------------------------------------------
class FileWrite(BaseModel):
    path: str
    content: str = Field(default="")


class HttpRequestModel(BaseModel):
    method: str = "GET"
    path: str
    headers: dict[str, str] | None = None
    body: str | None = None


# -- endpoints ------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "runner"}


@app.get("/v1/workspace")
def get_workspace() -> dict:
    meta = _active_example()
    return {
        "id": meta["id"],
        "name": meta["name"],
        "description": meta.get("description", ""),
        "readOnly": bool(meta.get("readOnly", False)),
        "defaultOpenFile": DEFAULT_OPEN_FILE,
        "runtime": runtime.status(),
    }


@app.get("/v1/files")
def get_files() -> dict:
    root = _active_project_root()
    return {"root": "project", "files": files_module.list_files(root)}


@app.get("/v1/files/content")
def get_file_content(path: str = Query(..., min_length=1)) -> dict:
    root = _active_project_root()
    try:
        content = files_module.read_text(root, path)
    except PathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": path, "content": content, "editable": True}


@app.put("/v1/files/content")
def put_file_content(payload: FileWrite) -> dict:
    root = _active_project_root()
    try:
        files_module.write_text(root, payload.path, payload.content)
    except PathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    meta = _active_example()
    meta["updatedAt"] = storage.now()
    storage.save_metadata(meta)
    return {"path": payload.path, "saved": True}


@app.post("/v1/runtime/start")
def runtime_start() -> dict:
    root = _active_project_root()
    return runtime.start(root)


@app.post("/v1/runtime/stop")
def runtime_stop() -> dict:
    return runtime.stop()


@app.get("/v1/runtime/status")
def runtime_status() -> dict:
    return runtime.status()


@app.get("/v1/runtime/logs")
def runtime_logs(limit: int = Query(200, ge=1, le=1000)) -> dict:
    return {"lines": runtime.logs(limit)}


@app.post("/v1/runtime/request")
def runtime_request(payload: HttpRequestModel) -> JSONResponse:
    try:
        result = runtime.forward_request(
            method=payload.method,
            path=payload.path,
            headers=payload.headers,
            body=payload.body,
        )
    except RuntimeError_ as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return JSONResponse(result)

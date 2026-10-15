"""Per-example storage for saved API requests.

Saved requests belong to exactly one personal example and live next to its
metadata at ``/data/examples/<id>/requests.json``. They are deliberately not
part of the project directory, so they are not copied when an example is
duplicated and never appear in the file editor.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from . import storage

ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}

REQUESTS_FILENAME = "requests.json"


class RequestsError(Exception):
    """Base class for controlled saved-request failures."""


class RequestNotFound(RequestsError):
    pass


class RequestValidation(RequestsError):
    pass


def _path(example_id: str) -> Path:
    return storage.example_dir(example_id) / REQUESTS_FILENAME


def _normalize_method(method: str) -> str:
    normalized = (method or "").strip().upper()
    if normalized not in ALLOWED_METHODS:
        raise RequestValidation(f"Unsupported method '{method}'.")
    return normalized


def _normalize_path(path: str) -> str:
    path = (path or "").strip()
    if not path.startswith("/") or path.startswith("//") or "://" in path:
        raise RequestValidation("Path must be relative and start with a single '/'.")
    return path


def _normalize_headers(headers: Any) -> list[dict[str, str]]:
    if headers is None:
        return []
    if isinstance(headers, dict):
        headers = [{"key": key, "value": value} for key, value in headers.items()]
    if not isinstance(headers, list):
        raise RequestValidation("Headers must be a list of key/value pairs.")
    normalized: list[dict[str, str]] = []
    for item in headers:
        if not isinstance(item, dict):
            raise RequestValidation("Each header must be a key/value pair.")
        key = str(item.get("key", "")).strip()
        if not key:
            continue
        normalized.append({"key": key, "value": str(item.get("value", ""))})
    return normalized


def _normalize_name(name: str) -> str:
    name = (name or "").strip()
    if not name:
        raise RequestValidation("Request name is required.")
    return name


def list_requests(example_id: str) -> list[dict[str, Any]]:
    data = storage.read_json(_path(example_id), default=[])
    return data if isinstance(data, list) else []


def _write(example_id: str, items: list[dict[str, Any]]) -> None:
    storage.write_json(_path(example_id), items)


def get_request(example_id: str, request_id: str) -> dict[str, Any]:
    for item in list_requests(example_id):
        if item.get("id") == request_id:
            return item
    raise RequestNotFound(f"Saved request '{request_id}' was not found.")


def create_request(
    example_id: str,
    name: str,
    method: str,
    path: str,
    headers: Any = None,
    body: str | None = None,
) -> dict[str, Any]:
    item = {
        "id": storage.new_id(),
        "name": _normalize_name(name),
        "method": _normalize_method(method),
        "path": _normalize_path(path),
        "headers": _normalize_headers(headers),
        "body": body or "",
        "createdAt": storage.now(),
        "updatedAt": storage.now(),
    }
    items = list_requests(example_id)
    items.append(item)
    _write(example_id, items)
    return item


def update_request(
    example_id: str,
    request_id: str,
    name: str | None = None,
    method: str | None = None,
    path: str | None = None,
    headers: Any = None,
    body: str | None = None,
) -> dict[str, Any]:
    items = list_requests(example_id)
    for item in items:
        if item.get("id") != request_id:
            continue
        if name is not None:
            item["name"] = _normalize_name(name)
        if method is not None:
            item["method"] = _normalize_method(method)
        if path is not None:
            item["path"] = _normalize_path(path)
        if headers is not None:
            item["headers"] = _normalize_headers(headers)
        if body is not None:
            item["body"] = body
        item["updatedAt"] = storage.now()
        _write(example_id, items)
        return item
    raise RequestNotFound(f"Saved request '{request_id}' was not found.")


def delete_request(example_id: str, request_id: str) -> None:
    items = list_requests(example_id)
    remaining = [item for item in items if item.get("id") != request_id]
    if len(remaining) == len(items):
        raise RequestNotFound(f"Saved request '{request_id}' was not found.")
    _write(example_id, remaining)

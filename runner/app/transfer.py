"""Export a Django Playground example to a single versioned JSON file and import
one back as a brand-new personal example.

The format is deliberately small and versioned (``django-playground.example``).
Import never overwrites an existing example: it always creates a new UUID, and
it validates everything before writing a single file, so a bad payload cannot
leave a half-built example behind.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from . import datasets
from . import files as files_module
from . import examples, requests_store, runtime, storage
from .config import MAX_FILE_BYTES, MAX_IMPORT_BYTES, SKIP_DIRS, SKIP_FILES

FORMAT = "django-playground.example"
VERSION = 1

# Header names removed from exported / imported saved requests.
SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "proxy-authorization",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
}

# A fake root used only to validate that import paths stay relative.
VALIDATION_ROOT = Path("/__playground_import__")


class TransferError(Exception):
    """Base class for controlled import/export failures."""


class TransferValidation(TransferError):
    """The uploaded example file is malformed or unsafe."""


def _strip_sensitive_headers(headers: Any) -> tuple[list[dict[str, str]], list[str]]:
    if isinstance(headers, dict):
        headers = [{"key": key, "value": value} for key, value in headers.items()]
    kept: list[dict[str, str]] = []
    removed: list[str] = []
    for item in headers or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip()
        if not key:
            continue
        if key.lower() in SENSITIVE_HEADERS:
            removed.append(key)
            continue
        kept.append({"key": key, "value": str(item.get("value", ""))})
    return kept, removed


def export_example(example_id: str, include_dataset: bool = False) -> dict[str, Any]:
    root, read_only, meta = examples.resolve_example(example_id)

    files: dict[str, str] = {}
    for entry in files_module.list_files(root):
        if not entry["editable"]:
            continue
        try:
            files[entry["path"]] = files_module.read_text(root, entry["path"])
        except files_module.PathError:
            continue

    redacted = False
    requests: list[dict[str, Any]] = []
    if not read_only:
        for request in requests_store.list_requests(example_id):
            headers, removed = _strip_sensitive_headers(request.get("headers", []))
            redacted = redacted or bool(removed)
            requests.append(
                {
                    "name": request["name"],
                    "method": request["method"],
                    "path": request["path"],
                    "headers": headers,
                    "body": request.get("body") or "",
                }
            )

    payload: dict[str, Any] = {
        "format": FORMAT,
        "version": VERSION,
        "metadata": {
            "name": meta.get("name", ""),
            "description": meta.get("description", ""),
            "sourceTemplateId": meta.get("sourceTemplateId"),
        },
        "files": files,
        "requests": requests,
        "redactedSensitiveHeaders": redacted,
    }

    if include_dataset and not read_only:
        try:
            payload["dataset"] = datasets.export_dataset(example_id)
        except datasets.DatasetError as exc:
            payload.setdefault("warnings", []).append(f"Dataset was not included: {exc}")

    return payload


def validate_example_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise TransferValidation("The file is not a Django Playground example.")
    if payload.get("format") != FORMAT:
        raise TransferValidation("Unrecognized file format. Expected an exported example.")
    version = payload.get("version")
    if not isinstance(version, int) or not 1 <= version <= VERSION:
        raise TransferValidation(f"Unsupported example version: {version!r}.")

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise TransferValidation("The example metadata is missing or invalid.")
    name = str(metadata.get("name", "")).strip()
    if not name:
        raise TransferValidation("The example name is required.")
    description = str(metadata.get("description", "") or "").strip()

    raw_files = payload.get("files")
    if not isinstance(raw_files, dict) or not raw_files:
        raise TransferValidation("The example has no files.")
    if "manage.py" not in raw_files:
        raise TransferValidation("This is not a Django project (manage.py is missing).")

    files: dict[str, str] = {}
    total_bytes = 0
    for rel_path, content in raw_files.items():
        if not isinstance(rel_path, str) or not isinstance(content, str):
            raise TransferValidation("Every file must map a path to text content.")
        rel_path = rel_path.strip()
        if Path(rel_path).is_absolute():
            raise TransferValidation(f"Absolute paths are not allowed: {rel_path}")
        try:
            files_module.resolve_in_root(VALIDATION_ROOT, rel_path)
        except files_module.PathError as exc:
            raise TransferValidation(f"Invalid file path '{rel_path}': {exc}") from exc
        if not files_module.has_allowed_extension(rel_path):
            raise TransferValidation(f"This file type is not allowed: {rel_path}")
        parts = Path(rel_path).parts
        if any(part in SKIP_DIRS for part in parts):
            raise TransferValidation(f"This path is not allowed: {rel_path}")
        if Path(rel_path).name in SKIP_FILES:
            raise TransferValidation(f"This file is not allowed: {rel_path}")
        size = len(content.encode("utf-8"))
        if size > MAX_FILE_BYTES:
            raise TransferValidation(f"File '{rel_path}' is too large for the editor.")
        total_bytes += size
        files[rel_path] = content
    if total_bytes > MAX_IMPORT_BYTES:
        raise TransferValidation("The example is larger than the 5 MB import limit.")

    raw_requests = payload.get("requests") or []
    if not isinstance(raw_requests, list):
        raise TransferValidation("The 'requests' field must be a list.")
    requests: list[dict[str, Any]] = []
    for item in raw_requests:
        if not isinstance(item, dict):
            raise TransferValidation("Each saved request must be an object.")
        method = str(item.get("method", "")).upper()
        if method not in requests_store.ALLOWED_METHODS:
            raise TransferValidation(f"Unsupported request method: {item.get('method')!r}.")
        path = str(item.get("path", "")).strip()
        if not path.startswith("/") or path.startswith("//") or "://" in path:
            raise TransferValidation(f"Invalid request path: {item.get('path')!r}.")
        request_name = str(item.get("name", "")).strip()
        if not request_name:
            raise TransferValidation("Every saved request needs a name.")
        headers, _removed = _strip_sensitive_headers(item.get("headers") or [])
        requests.append(
            {
                "name": request_name,
                "method": method,
                "path": path,
                "headers": headers,
                "body": str(item.get("body") or ""),
            }
        )

    dataset = payload.get("dataset")
    if dataset is not None:
        try:
            datasets.validate_dataset(dataset)
        except datasets.DatasetValidation as exc:
            raise TransferValidation(f"The included dataset is invalid: {exc}") from exc

    return {
        "name": name,
        "description": description,
        "files": files,
        "requests": requests,
        "dataset": dataset,
    }


def import_example(payload: Any) -> dict[str, Any]:
    data = validate_example_payload(payload)

    example_id = storage.new_id()
    project = storage.project_dir(example_id)
    try:
        project.mkdir(parents=True, exist_ok=True)
        for rel_path, content in data["files"].items():
            files_module.write_text(project, rel_path, content)

        default_path = data["requests"][0]["path"] if data["requests"] else "/api/hello/"
        meta = {
            "id": example_id,
            "name": data["name"],
            "description": data["description"],
            "createdAt": storage.now(),
            "updatedAt": storage.now(),
            "sourceTemplateId": None,
            "readOnly": False,
            "defaultRequestPath": default_path,
        }
        storage.save_metadata(meta)

        runtime.ensure_database(project)

        if data["dataset"] is not None:
            try:
                datasets.replace_dataset(example_id, data["dataset"])
            except datasets.DatasetError as exc:
                raise TransferValidation(
                    f"The example's dataset could not be loaded: {exc}"
                ) from exc

        for request in data["requests"]:
            requests_store.create_request(
                example_id,
                request["name"],
                request["method"],
                request["path"],
                request["headers"],
                request["body"],
            )
        return meta
    except Exception:
        # Never leave a half-built example behind.
        storage.delete_example_dir(example_id)
        raise

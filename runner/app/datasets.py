"""Dataset import/export for the active example using Django JSON fixtures.

Export runs ``dumpdata demo``; import replaces the ``demo`` app data with
``flush`` + ``loaddata``. The database is backed up first, so a failed import
(migration, validation or loaddata error) leaves the previous data untouched.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from . import database, examples, runtime, storage
from .config import DATA_COMMAND_TIMEOUT_SECONDS, MAX_DATASET_RECORDS

DATASET_FORMAT = "django-playground.dataset"
DATASET_VERSION = 1
SOURCE_APP = "demo"
DB_FILENAME = "db.sqlite3"


class DatasetError(Exception):
    """Base class for controlled dataset failures."""


class DatasetValidation(DatasetError):
    """The uploaded dataset file is malformed."""


class DatasetReadOnly(DatasetError):
    """Datasets only exist for personal examples."""


def _personal_root(example_id: str) -> Path:
    root, read_only, _meta = examples.resolve_example(example_id)
    if read_only:
        raise DatasetReadOnly("Built-in examples are read-only and have no personal dataset.")
    return root


def _run(project_root: Path, args: list[str], db_path: Path | None = None) -> tuple[int, str, str]:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PLAYGROUND_DB_PATH"] = str(db_path or (project_root / DB_FILENAME))
    try:
        process = subprocess.run(
            [sys.executable, "manage.py", *args],
            cwd=str(project_root),
            env=env,
            capture_output=True,
            text=True,
            timeout=DATA_COMMAND_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return -1, "", f"[runner] Timed out after {DATA_COMMAND_TIMEOUT_SECONDS}s."
    except OSError as exc:  # pragma: no cover - defensive
        return -1, "", f"[runner] Could not run the command: {exc}"
    return process.returncode, process.stdout or "", process.stderr or ""


def _count_by_model(records: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for record in records:
        counts[record["model"]] = counts.get(record["model"], 0) + 1
    return counts


def _last_line(output: str) -> str:
    lines = [line.strip() for line in output.strip().splitlines() if line.strip()]
    return lines[-1] if lines else "Unknown error."


def validate_dataset(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise DatasetValidation("The file is not a Django Playground dataset.")
    if payload.get("format") != DATASET_FORMAT:
        raise DatasetValidation("Unrecognized file format. Expected a Django Playground dataset.")
    version = payload.get("version")
    if not isinstance(version, int) or not 1 <= version <= DATASET_VERSION:
        raise DatasetValidation(f"Unsupported dataset version: {version!r}.")
    records = payload.get("records")
    if not isinstance(records, list):
        raise DatasetValidation("The 'records' field must be a list.")
    if len(records) > MAX_DATASET_RECORDS:
        raise DatasetValidation(f"A dataset may contain at most {MAX_DATASET_RECORDS} records.")
    for record in records:
        if not isinstance(record, dict):
            raise DatasetValidation("Every record must be an object.")
        model = record.get("model")
        if not isinstance(model, str) or "." not in model:
            raise DatasetValidation("Every record needs a 'model' label like 'demo.item'.")
        if not isinstance(record.get("fields"), dict):
            raise DatasetValidation("Every record needs a 'fields' object.")
    return {"records": records}


def export_dataset(example_id: str) -> dict[str, Any]:
    root = _personal_root(example_id)
    if not (root / DB_FILENAME).exists():
        raise DatasetError("This example has no database yet. Run it or apply migrations first.")

    code, stdout, stderr = _run(root, ["dumpdata", SOURCE_APP, "--format", "json", "--indent", "2"])
    if code != 0:
        raise DatasetError(f"Could not export data: {_last_line(stderr or stdout)}")
    try:
        records = json.loads(stdout or "[]")
    except ValueError as exc:
        raise DatasetError(f"The exported data was not valid JSON: {exc}") from exc

    return {
        "format": DATASET_FORMAT,
        "version": DATASET_VERSION,
        "sourceApp": SOURCE_APP,
        "records": records,
    }


def preview_dataset(example_id: str, payload: Any) -> dict[str, Any]:
    records = validate_dataset(payload)["records"]
    counts = _count_by_model(records)

    root = _personal_root(example_id)
    tables = database.list_tables(root)
    available = bool(tables.get("available"))
    known = {entry["name"] for entry in tables.get("tables", [])}

    missing: list[str] = []
    for label in counts:
        app_label, _, model_name = label.partition(".")
        expected_table = f"{app_label}_{model_name.lower()}"
        if available and expected_table not in known:
            missing.append(label)

    return {
        "format": DATASET_FORMAT,
        "version": DATASET_VERSION,
        "sourceApp": SOURCE_APP,
        "recordCount": len(records),
        "records": [{"model": label, "count": count} for label, count in sorted(counts.items())],
        "databaseReady": available,
        "compatible": available and not missing,
        "missingModels": missing,
    }


def replace_dataset(example_id: str, payload: Any) -> dict[str, Any]:
    records = validate_dataset(payload)["records"]
    root = _personal_root(example_id)
    db_file = root / DB_FILENAME
    example_dir = storage.example_dir(example_id)

    was_running = runtime.manager.is_running
    runtime.manager.stop()

    had_database = db_file.exists() and db_file.stat().st_size > 0

    # Do the whole migration + flush + loaddata against a throwaway copy of the
    # database (or a brand-new file when there is none yet). The live database
    # is only swapped in, atomically, after every step has succeeded — so a
    # failure at any point leaves the previous data exactly as it was.
    handle, work_path = tempfile.mkstemp(prefix=".db-work-", dir=str(example_dir))
    os.close(handle)
    work_db = Path(work_path)
    if had_database:
        shutil.copy2(db_file, work_db)
    else:
        work_db.unlink()  # let Django create it fresh

    fixture_path: str | None = None
    try:
        code, stdout, stderr = _run(root, ["migrate", "--noinput"], work_db)
        if code != 0:
            raise DatasetError(f"Could not prepare the database: {_last_line(stderr or stdout)}")

        code, stdout, stderr = _run(root, ["flush", "--noinput"], work_db)
        if code != 0:
            raise DatasetError(f"Could not clear the existing data: {_last_line(stderr or stdout)}")

        handle, fixture_path = tempfile.mkstemp(
            prefix=".fixture-", suffix=".json", dir=str(example_dir)
        )
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(records, stream)

        code, stdout, stderr = _run(root, ["loaddata", fixture_path], work_db)
        if code != 0:
            raise DatasetError(f"The dataset was rejected: {_last_line(stderr or stdout)}")

        # Success: replace the live database with the validated copy.
        os.replace(work_db, db_file)
    finally:
        cleanup = [work_db]
        if fixture_path is not None:
            cleanup.append(Path(fixture_path))
        for path in cleanup:
            if path.exists():
                path.unlink()

    if was_running:
        runtime.manager.start(root)

    return {
        "success": True,
        "loaded": len(records),
        "records": [{"model": label, "count": count} for label, count in sorted(_count_by_model(records).items())],
        "restarted": was_running,
    }

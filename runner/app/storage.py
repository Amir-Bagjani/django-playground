"""Low-level example storage: paths, metadata, state and safe file copying.

This module knows nothing about built-in templates or runtime; it only manages
what lives on disk under ``/data``. Higher-level example operations live in
``app.examples``.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from .config import EXAMPLES_DIR, STATE_FILE


class StorageError(Exception):
    """Raised for controlled storage failures."""


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def example_dir(example_id: str) -> Path:
    return EXAMPLES_DIR / example_id


def project_dir(example_id: str) -> Path:
    return example_dir(example_id) / "project"


def metadata_path(example_id: str) -> Path:
    return example_dir(example_id) / "metadata.json"


def read_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text("utf-8"))
    except (ValueError, OSError):
        return {}


def write_state(state: dict[str, Any]) -> None:
    _atomic_write(STATE_FILE, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text("utf-8"))
    except (ValueError, OSError):
        return default


def write_json(path: Path, data: Any) -> None:
    _atomic_write(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def load_metadata(example_id: str) -> dict[str, Any] | None:
    path = metadata_path(example_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text("utf-8"))
    except (ValueError, OSError):
        return None


def save_metadata(meta: dict[str, Any]) -> None:
    _atomic_write(
        metadata_path(meta["id"]),
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
    )


def list_personal_ids() -> list[str]:
    if not EXAMPLES_DIR.is_dir():
        return []
    ids: list[str] = []
    for entry in sorted(EXAMPLES_DIR.iterdir()):
        if entry.is_dir() and (entry / "metadata.json").is_file():
            ids.append(entry.name)
    return ids


def copy_project(src: Path, dst: Path) -> None:
    """Copy project files, skipping caches, temp files and OS junk."""
    def _ignore(_directory: str, names: list[str]) -> set[str]:
        return {
            n
            for n in names
            if n in {"__pycache__", ".DS_Store", ".pytest_cache"} or n.endswith(".pyc")
        }

    shutil.copytree(src, dst, ignore=_ignore)


def delete_example_dir(example_id: str) -> None:
    target = example_dir(example_id)
    if not target.exists():
        return
    if target.parent != EXAMPLES_DIR:
        raise StorageError("Refusing to delete path outside the examples directory.")
    shutil.rmtree(target)

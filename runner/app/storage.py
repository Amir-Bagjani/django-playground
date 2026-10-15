"""Example storage: metadata, state and initialization from seed templates.

Phase 1 only manages the single default ``Scratch`` workspace, but the on-disk
layout already matches the multi-example layout described in the product brief
so later phases can extend it without migrating data.
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

from .config import EXAMPLES_DIR, SCRATCH_SEED, STATE_FILE


class StorageError(Exception):
    """Raised for controlled storage failures."""


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


def _copy_project(src: Path, dst: Path) -> None:
    def _ignore(_directory: str, names: list[str]) -> set[str]:
        return {n for n in names if n in {"__pycache__", ".DS_Store"} or n.endswith(".pyc")}

    shutil.copytree(src, dst, ignore=_ignore)


def active_example() -> dict[str, Any] | None:
    state = read_state()
    example_id = state.get("activeExampleId")
    if not example_id:
        return None
    meta = load_metadata(example_id)
    if meta is None or not project_dir(example_id).is_dir():
        return None
    return meta


def ensure_scratch() -> dict[str, Any]:
    """Return the active example, creating the Scratch workspace if needed."""
    EXAMPLES_DIR.mkdir(parents=True, exist_ok=True)

    existing = active_example()
    if existing is not None:
        return existing

    example_id = str(uuid.uuid4())
    target = project_dir(example_id)
    target.parent.mkdir(parents=True, exist_ok=True)

    if not SCRATCH_SEED.is_dir():
        raise StorageError(f"seed template not found: {SCRATCH_SEED}")
    _copy_project(SCRATCH_SEED, target)

    meta = {
        "id": example_id,
        "name": "Scratch",
        "description": "Default workspace for phase 1",
        "createdAt": now(),
        "updatedAt": now(),
        "sourceTemplateId": "scratch",
        "readOnly": False,
    }
    save_metadata(meta)
    write_state({"activeExampleId": example_id})
    return meta

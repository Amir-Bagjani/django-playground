"""Safe file access confined to a single example project root.

Every path coming from the UI is treated as hostile: it must be a relative
path that resolves (after following symlinks) to a location inside the example
root. Absolute paths, ``..`` traversal and symlinks that escape the root are
rejected.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .config import ALLOWED_EXTENSIONS, MAX_FILE_BYTES, SKIP_DIRS, SKIP_FILES


class PathError(Exception):
    """Raised when a path is rejected or a file operation is not allowed."""


def has_allowed_extension(rel_path: str) -> bool:
    return Path(rel_path).suffix.lower() in ALLOWED_EXTENSIONS


def resolve_in_root(root: Path, rel_path: str) -> Path:
    """Resolve ``rel_path`` against ``root`` and guarantee it stays inside."""
    if rel_path is None or not str(rel_path).strip():
        raise PathError("File path is empty.")
    rel = str(rel_path).strip()
    if os.path.isabs(rel) or rel.startswith("/") or rel.startswith("\\"):
        raise PathError("Absolute paths are not allowed.")
    if "://" in rel:
        raise PathError("URL paths are not allowed.")

    root_real = os.path.realpath(root)
    candidate = os.path.realpath(os.path.join(root_real, rel))
    if candidate != root_real and not candidate.startswith(root_real + os.sep):
        raise PathError("Path escapes the example root.")
    return Path(candidate)


def is_editable(rel_path: str) -> bool:
    return has_allowed_extension(rel_path)


def list_files(root: Path) -> list[dict[str, Any]]:
    root_real = os.path.realpath(root)
    files: list[dict[str, Any]] = []
    for dirpath, dirnames, filenames in os.walk(root_real):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            if name in SKIP_FILES:
                continue
            full = Path(dirpath) / name
            if os.path.islink(full) and not os.path.realpath(full).startswith(root_real + os.sep):
                continue
            rel = os.path.relpath(full, root_real).replace(os.sep, "/")
            files.append({"path": rel, "editable": is_editable(rel)})
    files.sort(key=lambda item: item["path"])
    return files


def read_text(root: Path, rel_path: str) -> str:
    if not is_editable(rel_path):
        raise PathError("This file type cannot be opened in the editor.")
    path = resolve_in_root(root, rel_path)
    if not path.is_file():
        raise PathError("File not found.")
    if path.stat().st_size > MAX_FILE_BYTES:
        raise PathError("File is too large for the editor.")
    try:
        return path.read_text("utf-8")
    except UnicodeDecodeError as exc:  # pragma: no cover - defensive
        raise PathError("File is not valid UTF-8 text.") from exc


def write_text(root: Path, rel_path: str, content: str) -> None:
    if not is_editable(rel_path):
        raise PathError("Writing to this file type is not allowed.")
    if not isinstance(content, str):
        raise PathError("File content must be text.")
    if len(content.encode("utf-8")) > MAX_FILE_BYTES:
        raise PathError("Content is too large to save.")

    path = resolve_in_root(root, rel_path)
    # Re-validate the parent after following any intermediate symlinks.
    parent_real = os.path.realpath(path.parent)
    root_real = os.path.realpath(root)
    if parent_real != root_real and not parent_real.startswith(root_real + os.sep):
        raise PathError("Parent path escapes the example root.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, "utf-8")

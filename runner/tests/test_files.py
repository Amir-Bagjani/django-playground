"""Unit tests for path validation and safe file access."""
import os
from pathlib import Path

import pytest

from app import files
from app.files import PathError


@pytest.fixture()
def root(tmp_path: Path) -> Path:
    project = tmp_path / "project"
    (project / "demo").mkdir(parents=True)
    (project / "demo" / "views.py").write_text("VALUE = 1\n", encoding="utf-8")
    return project


def test_reads_normal_relative_path(root: Path) -> None:
    assert files.read_text(root, "demo/views.py") == "VALUE = 1\n"


def test_write_then_read_roundtrip(root: Path) -> None:
    files.write_text(root, "demo/views.py", "VALUE = 2\n")
    assert files.read_text(root, "demo/views.py") == "VALUE = 2\n"


def test_rejects_absolute_path(root: Path) -> None:
    with pytest.raises(PathError):
        files.read_text(root, "/etc/passwd")


def test_rejects_parent_traversal(root: Path) -> None:
    with pytest.raises(PathError):
        files.read_text(root, "../../etc/passwd")


def test_rejects_nested_traversal(root: Path) -> None:
    with pytest.raises(PathError):
        files.write_text(root, "demo/../../../etc/passwd", "x")


def test_rejects_symlink_escape(root: Path, tmp_path: Path) -> None:
    outside = tmp_path / "secret.txt"
    outside.write_text("top secret", encoding="utf-8")
    link = root / "link.txt"
    os.symlink(outside, link)
    with pytest.raises(PathError):
        files.read_text(root, "link.txt")


def test_rejects_disallowed_extension(root: Path) -> None:
    (root / "db.sqlite3").write_bytes(b"\x00\x01")
    with pytest.raises(PathError):
        files.read_text(root, "db.sqlite3")


def test_list_files_marks_editable_and_skips_binary(root: Path) -> None:
    (root / "db.sqlite3").write_bytes(b"\x00\x01")
    entries = {entry["path"]: entry["editable"] for entry in files.list_files(root)}
    assert entries["demo/views.py"] is True
    assert "db.sqlite3" not in entries

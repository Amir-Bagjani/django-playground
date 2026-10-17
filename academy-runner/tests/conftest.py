"""Shared fixtures for Academy runner tests.

These tests exercise the real MySQL 8.4 (+ Django 6.1 ORM) path inside the
Compose network. They are scoped to the new Academy module only; no legacy
Django Playground tests are run.

Every test gets its own progress database file so the durable volume is never
touched by the suite.
"""
from __future__ import annotations

import pytest

from app import config, exercises, seeds


@pytest.fixture(autouse=True)
def isolated_progress(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROGRESS_DB_PATH", tmp_path / "academy_progress.sqlite3")
    yield


def _reset_fixture(exercise_id: str):
    spec = exercises.get_spec(exercise_id)
    assert spec is not None
    seeds.reset(spec)
    return spec


@pytest.fixture()
def sql_spec():
    spec = _reset_fixture("first-query-sql")
    yield spec
    seeds.reset(spec)


@pytest.fixture()
def orm_spec():
    spec = _reset_fixture("first-query-orm")
    yield spec
    seeds.reset(spec)


@pytest.fixture()
def mastery_spec():
    spec = _reset_fixture("first-query-mastery")
    yield spec
    seeds.reset(spec)

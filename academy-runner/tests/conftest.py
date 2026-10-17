"""Shared fixtures for Academy runner tests.

These tests exercise the real MySQL 8.4 (+ Django 6.1 ORM) path inside the
Compose network. They are scoped to the new Academy module only; no legacy
Django Playground tests are run.
"""
from __future__ import annotations

import pytest

from app import exercises, seeds


@pytest.fixture()
def sql_spec():
    spec = exercises.get_spec("first-query-sql")
    assert spec is not None
    seeds.reset(spec)
    yield spec
    seeds.reset(spec)


@pytest.fixture()
def orm_spec():
    spec = exercises.get_spec("first-query-orm")
    assert spec is not None
    seeds.reset(spec)
    yield spec
    seeds.reset(spec)

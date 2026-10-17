"""Minimal Django settings for the ORM child process.

Deliberately isolated from the API process and from the legacy Django
Playground. The connection targets the exercise's disposable MySQL schema
through the restricted exercise user, with charset and isolation level pinned
so Django and the MySQL server agree (both REPEATABLE READ).
"""
from __future__ import annotations

import os

from . import config

SECRET_KEY = "academy-runner-orm-child-local-only"
DEBUG = False
ALLOWED_HOSTS: list[str] = []

INSTALLED_APPS = ["app.orm_app"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.environ.get("ACADEMY_ORM_SCHEMA", ""),
        "USER": os.environ.get("ACADEMY_ORM_USER", ""),
        "PASSWORD": os.environ.get("ACADEMY_ORM_PASSWORD", ""),
        "HOST": config.DB_HOST,
        "PORT": str(config.DB_PORT),
        "OPTIONS": {
            "charset": config.DB_CHARSET,
            "isolation_level": config.DTO_ISOLATION_LEVEL,
        },
    }
}

USE_TZ = True
TIME_ZONE = "UTC"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

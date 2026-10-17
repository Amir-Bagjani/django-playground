"""Exercise registry for the Academy runner.

Public metadata (title, instructions, starter code, public criteria, hints) is
read from the authored content mounted read-only at ``config.CONTENT_DIR``.
Execution behaviour (schema, restricted user, kind, validators) lives here in
code and is keyed by exercise id in :data:`SPECS`.

Only exercises present in :data:`SPECS` are executable. Other authored
exercise manifests (for example the ForeignKey authoring sample) are ignored by
the runtime, so no validator is fabricated for them.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from . import config


@dataclass(frozen=True)
class Spec:
    id: str
    schema: str
    user: str
    kind: str  # "sql" | "django-orm"


SPECS: dict[str, Spec] = {
    "first-query-sql": Spec(
        id="first-query-sql",
        schema="academy_first_query_sql",
        user="acad_first_query_sql",
        kind="sql",
    ),
    "first-query-orm": Spec(
        id="first-query-orm",
        schema="academy_first_query_orm",
        user="acad_first_query_orm",
        kind="django-orm",
    ),
}


def all_specs() -> list[Spec]:
    return list(SPECS.values())


def get_spec(exercise_id: str) -> Spec | None:
    return SPECS.get(exercise_id)


def _first_heading(markdown: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return ""


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _load_public() -> dict[str, dict]:
    public: dict[str, dict] = {}
    if not config.CONTENT_DIR.is_dir():
        return public
    for manifest in sorted(config.CONTENT_DIR.rglob("exercises/*/exercise.json")):
        try:
            obj = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        exercise_id = obj.get("id")
        if exercise_id not in SPECS:
            continue
        directory = manifest.parent
        try:
            instructions = _read(directory / obj["instructions_file"])
            starters = [
                {
                    "name": name,
                    "language": "sql" if name.endswith(".sql") else "python",
                    "content": _read(directory / name),
                }
                for name in obj.get("starter_files", [])
            ]
        except (OSError, KeyError):
            continue
        public[exercise_id] = {
            "id": exercise_id,
            "lesson_id": obj.get("lesson_id"),
            "level": obj.get("level"),
            "kind": obj.get("kind"),
            "title_fa": _first_heading(instructions) or exercise_id,
            "instructions_markdown": instructions,
            "starter": starters,
            "criteria": [c for c in obj.get("criteria", []) if c.get("visibility") == "public"],
            "hints": obj.get("hints", []),
            "time_limit_seconds": obj.get("time_limit_seconds"),
        }
    return public


_PUBLIC = _load_public()


def list_public() -> list[dict]:
    return list(_PUBLIC.values())


def get_public(exercise_id: str) -> dict | None:
    return _PUBLIC.get(exercise_id)


def public_for_lesson(lesson_id: str) -> list[dict]:
    return [item for item in _PUBLIC.values() if item.get("lesson_id") == lesson_id]

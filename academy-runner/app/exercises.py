"""Instructor-only exercise registry for the Academy runner.

Public metadata (title, instructions, starter code, public criteria, hint
*count*) is read from the authored content mounted read-only at
``config.CONTENT_DIR``. Execution behaviour (schema, restricted user, kind,
level, validator id/version, dataset) lives here in code, keyed by exercise id.

An authored manifest becomes **executable** only when its ``kind``, ``level``,
``lesson_id`` and ``validator.id``/``validator.version`` match the coded spec
exactly. This is what the PRD calls "a validator registry by exact ID, version
and kind": a mismatch never silently grades a learner with the wrong validator —
the exercise is simply not executable and the reason is recorded.

Hint *text* is deliberately not part of the public metadata: hints are served
one at a time by the ``hints/next`` endpoint. Reference solutions and hidden
tests never leave this process.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from . import config


@dataclass(frozen=True)
class Spec:
    id: str
    lesson_id: str
    schema: str
    user: str
    kind: str  # "sql" | "django-orm" | "erd"
    level: str  # "practice" | "problem-solving" | "mastery"
    dataset: str  # "products" | "books" | "" (ERD has no dataset)
    required_for_completion: bool
    validator_id: str
    validator_version: int
    hint_cap: int | None = None


# The coded registry. ``validator_version`` is the assessment version recorded
# with a pass; a content edit that changes pass criteria must bump it here and
# in the manifest together.
DECLARED: dict[str, Spec] = {
    "first-query-sql": Spec(
        id="first-query-sql",
        lesson_id="DB-00-008",
        schema="academy_first_query_sql",
        user="acad_first_query_sql",
        kind="sql",
        level="practice",
        dataset="products",
        required_for_completion=True,
        validator_id="first-query-sql-validator",
        validator_version=1,
    ),
    "first-query-orm": Spec(
        id="first-query-orm",
        lesson_id="DB-00-008",
        schema="academy_first_query_orm",
        user="acad_first_query_orm",
        kind="django-orm",
        level="problem-solving",
        dataset="products",
        required_for_completion=True,
        validator_id="first-query-orm-validator",
        validator_version=1,
    ),
    "first-query-mastery": Spec(
        id="first-query-mastery",
        lesson_id="DB-00-008",
        schema="academy_first_query_mastery",
        user="acad_first_query_mastery",
        kind="sql",
        level="mastery",
        dataset="books",
        required_for_completion=False,
        validator_id="first-query-mastery-validator",
        validator_version=1,
        # Mastery exposes fewer hints than the introductory levels.
        hint_cap=config.MASTERY_MAX_HINTS,
    ),
    # First ERD exercise (PRD-04). ERD designs carry no MySQL dataset: the graph
    # document itself is the submission and validation is purely structural.
    "erd-customer-order": Spec(
        id="erd-customer-order",
        lesson_id="DB-03-002",
        schema="",
        user="",
        kind="erd",
        level="practice",
        dataset="",
        required_for_completion=True,
        validator_id="erd-schema-validator",
        validator_version=1,
    ),
}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _first_heading(markdown: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return ""


def _language(filename: str) -> str:
    if filename.endswith(".sql"):
        return "sql"
    if filename.endswith(".json"):
        return "json"
    return "python"


def _manifest_issue(spec: Spec, manifest: dict) -> str | None:
    """Return a human-readable reason if the manifest does not match the spec."""
    validator = manifest.get("validator") or {}
    checks = [
        ("kind", manifest.get("kind"), spec.kind),
        ("level", manifest.get("level"), spec.level),
        ("lesson_id", manifest.get("lesson_id"), spec.lesson_id),
        ("validator.id", validator.get("id"), spec.validator_id),
        ("validator.version", validator.get("version"), spec.validator_version),
    ]
    for field, actual, expected in checks:
        if actual != expected:
            return f"{field}: manifest has {actual!r}, registry expects {expected!r}"
    return None


@dataclass(frozen=True)
class _Authored:
    spec: Spec
    public: dict
    hints: list[dict]


def _load() -> tuple[dict[str, _Authored], list[str]]:
    authored: dict[str, _Authored] = {}
    issues: list[str] = []
    if not config.CONTENT_DIR.is_dir():
        return authored, issues

    for manifest_path in sorted(config.CONTENT_DIR.rglob("exercises/*/exercise.json")):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            issues.append(f"{manifest_path}: cannot read manifest: {exc}")
            continue
        exercise_id = manifest.get("id")
        spec = DECLARED.get(exercise_id)
        if spec is None:
            # Authored-only specimen without a coded validator: intentionally
            # not executable and not an error.
            continue
        issue = _manifest_issue(spec, manifest)
        if issue is not None:
            issues.append(f"{exercise_id}: {issue}")
            continue
        directory = manifest_path.parent
        try:
            instructions = _read(directory / manifest["instructions_file"])
            starters = [
                {
                    "name": name,
                    "language": _language(name),
                    "content": _read(directory / name),
                }
                for name in manifest.get("starter_files", [])
            ]
        except (OSError, KeyError) as exc:
            issues.append(f"{exercise_id}: cannot read instructions/starter: {exc}")
            continue

        hints = list(manifest.get("hints", []))
        total = len(hints)
        if spec.hint_cap is not None:
            total = min(total, spec.hint_cap)

        public = {
            "id": exercise_id,
            "lesson_id": spec.lesson_id,
            "level": spec.level,
            "kind": spec.kind,
            "required_for_completion": spec.required_for_completion,
            "assessment_version": spec.validator_version,
            "title_fa": _first_heading(instructions) or exercise_id,
            "instructions_markdown": instructions,
            "starter": starters,
            "criteria": [
                criterion
                for criterion in manifest.get("criteria", [])
                if criterion.get("visibility") == "public"
            ],
            # Only the count is public; the text is served on request.
            "hint_count": total,
            "time_limit_seconds": manifest.get("time_limit_seconds"),
        }
        authored[exercise_id] = _Authored(spec=spec, public=public, hints=hints)

    return authored, issues


_AUTHORED, REGISTRY_ISSUES = _load()


def registry_issues() -> list[str]:
    return list(REGISTRY_ISSUES)


def all_specs() -> list[Spec]:
    return [entry.spec for entry in _AUTHORED.values()]


def get_spec(exercise_id: str) -> Spec | None:
    entry = _AUTHORED.get(exercise_id)
    return entry.spec if entry else None


def list_public() -> list[dict]:
    return [entry.public for entry in _AUTHORED.values()]


def get_public(exercise_id: str) -> dict | None:
    entry = _AUTHORED.get(exercise_id)
    return entry.public if entry else None


def hints_for(exercise_id: str) -> list[dict]:
    """Ordered hint bank, capped for Mastery. Instructor-side only."""
    entry = _AUTHORED.get(exercise_id)
    if entry is None:
        return []
    return entry.hints


def hint_total(exercise_id: str) -> int:
    return int((get_public(exercise_id) or {}).get("hint_count", 0))


def public_for_lesson(lesson_id: str) -> list[dict]:
    return [item for item in list_public() if item.get("lesson_id") == lesson_id]

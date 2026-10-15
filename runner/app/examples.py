"""High-level example management: built-in templates and personal examples.

Built-in examples are read-only seed templates that ship inside the image.
Personal examples live under ``/data/examples/<uuid>/`` and are fully editable.
Exactly one example is active at any moment.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from . import runtime, storage
from .config import SEEDS_DIR

BLANK_TEMPLATE_ID = "scratch"

# Built-in templates shown in the sidebar, in display order.
BUILTIN_ORDER = ["hello", "orm", "crud"]

# All templates a personal example can be created from (blank + built-ins).
TEMPLATES: dict[str, dict[str, Any]] = {
    "scratch": {
        "name": "Blank",
        "description": "An empty Django project with a single GET /api/hello/ endpoint.",
        "pathHint": "/api/hello/",
    },
    "hello": {
        "name": "Hello World API",
        "description": "A minimal Django JSON endpoint at GET /api/hello/.",
        "pathHint": "/api/hello/",
    },
    "orm": {
        "name": "Models & ORM",
        "description": "A Book model, a migration with sample rows and GET /api/books/.",
        "pathHint": "/api/books/",
    },
    "crud": {
        "name": "CRUD API",
        "description": "A DRF Item model with list/detail, POST, PATCH and DELETE at /api/items/.",
        "pathHint": "/api/items/",
    },
}


class ExampleError(Exception):
    """Base class for controlled example failures."""


class ExampleNotFound(ExampleError):
    pass


class ExampleReadOnly(ExampleError):
    pass


class ExampleValidation(ExampleError):
    pass


def is_builtin(example_id: str) -> bool:
    return example_id in BUILTIN_ORDER


def _template_meta(template_id: str, read_only: bool) -> dict[str, Any]:
    template = TEMPLATES[template_id]
    return {
        "id": template_id,
        "name": template["name"],
        "description": template["description"],
        "readOnly": read_only,
        "sourceTemplateId": template_id,
        "defaultRequestPath": template["pathHint"],
    }


def default_request_path(meta: dict[str, Any]) -> str:
    template_id = meta.get("sourceTemplateId") or BLANK_TEMPLATE_ID
    template = TEMPLATES.get(template_id)
    if template is not None:
        return template["pathHint"]
    return TEMPLATES[BLANK_TEMPLATE_ID]["pathHint"]


def decorate(meta: dict[str, Any]) -> dict[str, Any]:
    decorated = dict(meta)
    decorated["readOnly"] = bool(meta.get("readOnly", False))
    decorated["defaultRequestPath"] = default_request_path(meta)
    return decorated


def _seed_dir(template_id: str) -> Path:
    return SEEDS_DIR / template_id


def resolve_example(example_id: str) -> tuple[Path, bool, dict[str, Any]]:
    """Return ``(project_root, read_only, meta)`` for a built-in or personal id."""
    if is_builtin(example_id):
        seed = _seed_dir(example_id)
        if not seed.is_dir():
            raise ExampleNotFound(f"Built-in template '{example_id}' is missing.")
        return seed, True, _template_meta(example_id, read_only=True)

    meta = storage.load_metadata(example_id)
    if meta is None:
        raise ExampleNotFound(f"Example '{example_id}' was not found.")
    root = storage.project_dir(example_id)
    if not root.is_dir():
        raise ExampleNotFound(f"Example '{example_id}' has no project files.")
    return root, False, meta


def list_examples() -> dict[str, Any]:
    state = storage.read_state()
    active_id = state.get("activeExampleId")

    built_in = [_template_meta(tid, read_only=True) for tid in BUILTIN_ORDER]

    personal: list[dict[str, Any]] = []
    for example_id in storage.list_personal_ids():
        meta = storage.load_metadata(example_id)
        if meta is None:
            continue
        item = decorate(meta)
        item["active"] = example_id == active_id
        personal.append(item)
    personal.sort(key=lambda item: item.get("updatedAt", ""), reverse=True)

    templates = [_template_meta(tid, read_only=False) for tid in TEMPLATES]
    for template in templates:
        template["id"] = template["sourceTemplateId"]

    return {
        "builtIn": built_in,
        "personal": personal,
        "templates": templates,
        "activeExampleId": active_id,
    }


def active_example() -> dict[str, Any] | None:
    state = storage.read_state()
    example_id = state.get("activeExampleId")
    if not example_id or is_builtin(example_id):
        return None
    meta = storage.load_metadata(example_id)
    if meta is None or not storage.project_dir(example_id).is_dir():
        return None
    return meta


def ensure_active_example() -> dict[str, Any]:
    """Guarantee a valid active personal example exists and its DB is ready."""
    current = active_example()
    if current is not None:
        runtime.ensure_database(storage.project_dir(current["id"]))
        return current

    personal_ids = storage.list_personal_ids()
    if personal_ids:
        metas = [m for m in (storage.load_metadata(i) for i in personal_ids) if m]
        if metas:
            metas.sort(key=lambda m: m.get("updatedAt", ""), reverse=True)
            chosen = metas[0]
            storage.write_state({"activeExampleId": chosen["id"]})
            runtime.ensure_database(storage.project_dir(chosen["id"]))
            return chosen

    created = create_example("Scratch", "Default workspace", BLANK_TEMPLATE_ID)
    storage.write_state({"activeExampleId": created["id"]})
    return created


def create_example(
    name: str,
    description: str | None = None,
    from_template_id: str | None = None,
) -> dict[str, Any]:
    name = (name or "").strip()
    if not name:
        raise ExampleValidation("Example name is required.")

    template_id = from_template_id or BLANK_TEMPLATE_ID
    if template_id not in TEMPLATES:
        raise ExampleValidation(f"Unknown template '{template_id}'.")
    seed = _seed_dir(template_id)
    if not seed.is_dir():
        raise ExampleValidation(f"Template '{template_id}' is not available.")

    example_id = storage.new_id()
    project = storage.project_dir(example_id)
    storage.copy_project(seed, project)

    meta = {
        "id": example_id,
        "name": name,
        "description": (description or "").strip(),
        "createdAt": storage.now(),
        "updatedAt": storage.now(),
        "sourceTemplateId": template_id,
        "readOnly": False,
    }
    storage.save_metadata(meta)
    runtime.ensure_database(project)
    return meta


def duplicate_example(source_id: str) -> dict[str, Any]:
    root, _read_only, meta = resolve_example(source_id)
    example_id = storage.new_id()
    project = storage.project_dir(example_id)
    # Copies project files. For a personal source this also copies its SQLite
    # database, so the duplicate gets a fully independent database file.
    storage.copy_project(root, project)

    new_meta = {
        "id": example_id,
        "name": f"{meta.get('name', 'Example')} (copy)",
        "description": meta.get("description", ""),
        "createdAt": storage.now(),
        "updatedAt": storage.now(),
        "sourceTemplateId": meta.get("sourceTemplateId") or source_id,
        "readOnly": False,
    }
    storage.save_metadata(new_meta)
    runtime.ensure_database(project)
    return new_meta


def update_example(
    example_id: str,
    name: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    if is_builtin(example_id):
        raise ExampleReadOnly("Built-in examples are read-only.")
    meta = storage.load_metadata(example_id)
    if meta is None:
        raise ExampleNotFound(f"Example '{example_id}' was not found.")

    if name is not None:
        name = name.strip()
        if not name:
            raise ExampleValidation("Example name is required.")
        meta["name"] = name
    if description is not None:
        meta["description"] = description.strip()
    meta["updatedAt"] = storage.now()
    storage.save_metadata(meta)
    return meta


def delete_example(example_id: str) -> None:
    if is_builtin(example_id):
        raise ExampleReadOnly("Built-in examples cannot be deleted.")
    meta = storage.load_metadata(example_id)
    if meta is None:
        raise ExampleNotFound(f"Example '{example_id}' was not found.")

    current = storage.read_state().get("activeExampleId")
    was_active = current == example_id
    if was_active:
        runtime.manager.stop()

    storage.delete_example_dir(example_id)

    if was_active:
        storage.write_state({"activeExampleId": None})
        ensure_active_example()


def activate_example(example_id: str) -> dict[str, Any]:
    if is_builtin(example_id):
        raise ExampleReadOnly("Built-in examples are read-only; create a copy first.")
    meta = storage.load_metadata(example_id)
    if meta is None:
        raise ExampleNotFound(f"Example '{example_id}' was not found.")
    if not storage.project_dir(example_id).is_dir():
        raise ExampleNotFound(f"Example '{example_id}' has no project files.")

    runtime.manager.stop()
    storage.write_state({"activeExampleId": example_id})
    runtime.ensure_database(storage.project_dir(example_id))
    return meta

"""Progressive project registry (PRD-05).

A project is a content-driven sequence of **milestones**. Authored content lives
as a manifest under ``config.PROJECTS_DIR/<id>.json`` plus per-milestone files at
``<id>/milestones/<milestone-id>/``. Execution behaviour (which MySQL schema, is
it gradable, which validator version) lives here in code, exactly like the
exercise registry: an authored milestone becomes executable only when its
``stage_kind`` and ``validator.id``/``version`` match the coded spec.

Adding a new project or milestone therefore only adds content files; no new
routes or per-project logic are needed.

A milestone without a coded ``stage_kind`` is **planning-only**: it is shown for
roadmap context but is not gradable and does not gate execution.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from . import config
from .exercises import Spec


@dataclass(frozen=True)
class MilestoneSpec:
    id: str
    project_id: str
    stage_kind: str  # "erd" | "sql" | "orm" | "" (planning-only)
    checkpoint_id: str
    depends_on: tuple[str, ...]
    schema: str = ""
    user: str = ""
    validator_id: str = ""
    validator_version: int = 1
    required: bool = True

    def engine_spec(self) -> Spec:
        """A `checks`/engine-compatible view of this milestone.

        Criteria and hint availability are always supplied explicitly when a
        project milestone is graded, so the exercise registry is never consulted
        for a project milestone.
        """
        kind = {"erd": "erd", "sql": "sql", "orm": "django-orm"}.get(self.stage_kind, "sql")
        return Spec(
            id=self.id,
            lesson_id=f"project:{self.project_id}",
            schema=self.schema,
            user=self.user,
            kind=kind,
            level="problem-solving",
            dataset="",
            required_for_completion=self.required,
            validator_id=self.validator_id,
            validator_version=self.validator_version,
        )


# Coded execution registry. Keys are milestone ids. Only milestones listed here
# are executable; the rest of a manifest stays planning-only.
DECLARED_MILESTONES: dict[str, MilestoneSpec] = {
    "booking-erd": MilestoneSpec(
        id="booking-erd",
        project_id="booking",
        stage_kind="erd",
        checkpoint_id="booking-erd-cp",
        depends_on=("booking-requirements",),
        validator_id="booking-erd-validator",
        validator_version=1,
    ),
    "booking-schema": MilestoneSpec(
        id="booking-schema",
        project_id="booking",
        stage_kind="sql",
        checkpoint_id="booking-schema-cp",
        depends_on=("booking-erd",),
        schema="academy_project_booking_schema",
        user="acad_project_booking_schema",
        validator_id="booking-schema-validator",
        validator_version=1,
    ),
    "booking-models": MilestoneSpec(
        id="booking-models",
        project_id="booking",
        stage_kind="orm",
        checkpoint_id="booking-models-cp",
        depends_on=("booking-schema",),
        schema="academy_project_booking_models",
        user="acad_project_booking_models",
        validator_id="booking-models-validator",
        validator_version=1,
    ),
}


@dataclass(frozen=True)
class _AuthoredMilestone:
    spec: MilestoneSpec
    public: dict
    hints: list[dict]
    criteria_all: list[dict]
    criteria_public: list[dict]


@dataclass(frozen=True)
class _AuthoredProject:
    id: str
    public: dict
    milestones: dict[str, _AuthoredMilestone]
    order: tuple[str, ...]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _language(filename: str) -> str:
    if filename.endswith(".sql"):
        return "sql"
    if filename.endswith(".json"):
        return "json"
    return "python"


def _first_heading(markdown: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return ""


def _public_criteria(manifest_milestone: dict) -> list[dict]:
    return [
        {
            "id": c.get("id"),
            "description_fa": c.get("description_fa"),
            "visibility": c.get("visibility"),
            "evaluation": c.get("evaluation", "auto"),
            "rubric_fa": c.get("rubric_fa"),
        }
        for c in manifest_milestone.get("criteria", [])
        if c.get("visibility") == "public"
    ]


def _all_criteria(manifest_milestone: dict) -> list[dict]:
    return [
        {
            "id": c.get("id"),
            "description_fa": c.get("description_fa"),
            "visibility": c.get("visibility"),
            "evaluation": c.get("evaluation", "auto"),
            "rubric_fa": c.get("rubric_fa"),
        }
        for c in manifest_milestone.get("criteria", [])
    ]


def _milestone_issue(manifest_milestone: dict, spec: MilestoneSpec) -> str | None:
    validator = manifest_milestone.get("validator") or {}
    expected_stage = spec.stage_kind
    checks = [
        ("stage_kind", manifest_milestone.get("stage_kind"), expected_stage),
        ("checkpoint_id", manifest_milestone.get("checkpoint_id"), spec.checkpoint_id),
        ("validator.id", validator.get("id"), spec.validator_id),
        ("validator.version", validator.get("version"), spec.validator_version),
    ]
    for field, actual, expected in checks:
        if actual != expected:
            return f"{field}: manifest has {actual!r}, registry expects {expected!r}"
    return None


def _load() -> tuple[dict[str, _AuthoredProject], list[str]]:
    authored: dict[str, _AuthoredProject] = {}
    issues: list[str] = []
    if not config.PROJECTS_DIR.is_dir():
        return authored, issues

    for manifest_path in sorted(config.PROJECTS_DIR.glob("*.json")):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            issues.append(f"{manifest_path}: cannot read project manifest: {exc}")
            continue
        project_id = manifest.get("id")
        if not project_id:
            issues.append(f"{manifest_path}: project manifest has no id")
            continue
        if project_id in authored:
            issues.append(f"{manifest_path}: duplicate project id {project_id}")
            continue

        project_dir = manifest_path.parent / project_id
        milestones: dict[str, _AuthoredMilestone] = {}
        order: list[str] = []
        for manifest_milestone in manifest.get("milestones", []):
            mid = manifest_milestone.get("id")
            if not mid:
                issues.append(f"{project_id}: milestone without id")
                continue
            order.append(mid)
            spec = DECLARED_MILESTONES.get(mid)
            if spec is None or not manifest_milestone.get("stage_kind"):
                # Planning-only milestone: roadmap context only, not executable.
                continue
            issue = _milestone_issue(manifest_milestone, spec)
            if issue is not None:
                issues.append(f"{mid}: {issue}")
                continue
            mdir = project_dir / "milestones" / mid
            try:
                instructions = _read(mdir / manifest_milestone["instructions_file"])
                starters = [
                    {"name": name, "language": _language(name), "content": _read(mdir / name)}
                    for name in manifest_milestone.get("starter_files", [])
                ]
            except (OSError, KeyError) as exc:
                issues.append(f"{mid}: cannot read instructions/starter: {exc}")
                continue

            example_graph = None
            example_file = manifest_milestone.get("example_file")
            if example_file:
                try:
                    example_graph = json.loads((mdir / example_file).read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError) as exc:
                    issues.append(f"{mid}: cannot read example_file {example_file}: {exc}")

            hints = list(manifest_milestone.get("hints", []))
            criteria_all = _all_criteria(manifest_milestone)
            criteria_public = _public_criteria(manifest_milestone)
            public = {
                "id": mid,
                "project_id": project_id,
                "title_fa": manifest_milestone.get("title_fa", mid),
                "description_fa": manifest_milestone.get("description_fa", ""),
                "objectives_fa": manifest_milestone.get("objectives_fa", []),
                "acceptance_criteria_fa": manifest_milestone.get("acceptance_criteria_fa", []),
                "stage_kind": spec.stage_kind,
                "checkpoint_id": spec.checkpoint_id,
                "depends_on": list(manifest_milestone.get("depends_on", [])),
                "assessment_version": spec.validator_version,
                "title": _first_heading(instructions) or manifest_milestone.get("title_fa", mid),
                "instructions_markdown": instructions,
                "starter": starters,
                "example_graph": example_graph,
                "criteria": criteria_public,
                "hint_count": len(hints),
            }
            milestones[mid] = _AuthoredMilestone(
                spec=spec,
                public=public,
                hints=hints,
                criteria_all=criteria_all,
                criteria_public=criteria_public,
            )

        # Executable milestones in manifest order, planning-only ones excluded.
        executable_order = tuple(mid for mid in order if mid in milestones)
        public_project = {
            "id": project_id,
            "title_fa": manifest.get("title_fa", project_id),
            "status": manifest.get("status", "planned"),
            "domain": manifest.get("domain", ""),
            "detail_level": manifest.get("detail_level", ""),
            "description_fa": manifest.get("description_fa", ""),
            # Full milestone sequence (planning-only included) so the UI can show
            # the roadmap; executable ones carry stage_kind.
            "milestones": [
                milestones[mid].public
                if mid in milestones
                else {
                    "id": mid,
                    "project_id": project_id,
                    "title_fa": next(
                        (
                            m.get("title_fa", mid)
                            for m in manifest.get("milestones", [])
                            if m.get("id") == mid
                        ),
                        mid,
                    ),
                    "stage_kind": "",
                    "checkpoint_id": next(
                        (
                            m.get("checkpoint_id", "")
                            for m in manifest.get("milestones", [])
                            if m.get("id") == mid
                        ),
                        "",
                    ),
                    "depends_on": next(
                        (
                            m.get("depends_on", [])
                            for m in manifest.get("milestones", [])
                            if m.get("id") == mid
                        ),
                        [],
                    ),
                    "acceptance_criteria_fa": next(
                        (
                            m.get("acceptance_criteria_fa", [])
                            for m in manifest.get("milestones", [])
                            if m.get("id") == mid
                        ),
                        [],
                    ),
                    "criteria": [],
                    "hint_count": 0,
                    "executable": False,
                }
                for mid in order
            ],
            "executable_milestones": list(executable_order),
        }
        # Mark executable milestones so the UI can enable actions.
        for milestone in public_project["milestones"]:
            milestone.setdefault("executable", bool(milestone.get("stage_kind")))
        authored[project_id] = _AuthoredProject(
            id=project_id, public=public_project, milestones=milestones, order=executable_order
        )
    return authored, issues


_AUTHORED, REGISTRY_ISSUES = _load()


def registry_issues() -> list[str]:
    return list(REGISTRY_ISSUES)


def all_projects() -> list[_AuthoredProject]:
    return list(_AUTHORED.values())


def get_project(project_id: str) -> _AuthoredProject | None:
    return _AUTHORED.get(project_id)


def get_milestone(project_id: str, milestone_id: str) -> _AuthoredMilestone | None:
    project = _AUTHORED.get(project_id)
    if project is None:
        return None
    return project.milestones.get(milestone_id)


def list_public() -> list[dict]:
    return [project.public for project in _AUTHORED.values()]


def get_public(project_id: str) -> dict | None:
    project = _AUTHORED.get(project_id)
    return project.public if project else None


def milestone_public(project_id: str, milestone_id: str) -> dict | None:
    milestone = get_milestone(project_id, milestone_id)
    return milestone.public if milestone else None


def hints_for(project_id: str, milestone_id: str) -> list[dict]:
    milestone = get_milestone(project_id, milestone_id)
    return milestone.hints if milestone else []


def criteria_for(project_id: str, milestone_id: str) -> list[dict]:
    """All authored criteria (used for grading; includes any non-public ones)."""
    milestone = get_milestone(project_id, milestone_id)
    return milestone.criteria_all if milestone else []


def executable_milestone_ids(project_id: str) -> tuple[str, ...]:
    project = get_project(project_id)
    return project.order if project else ()


def _stage_milestone(project_id: str, stage: str) -> _AuthoredMilestone | None:
    project = get_project(project_id)
    if project is None:
        return None
    for milestone in project.milestones.values():
        if milestone.spec.stage_kind == stage:
            return milestone
    return None


def initial_workspace_state(project_id: str) -> dict:
    """The content-pack-defined starter workspace for a project (PRD-05 Reset).

    ERD starters are JSON graphs (parsed); SQL/ORM starters are text. This is the
    state Reset restores and the state a fresh project starts from.
    """
    state: dict = {"erd": None, "sql": "", "orm": "", "notes": ""}
    erd = _stage_milestone(project_id, "erd")
    if erd and erd.public.get("starter"):
        try:
            state["erd"] = json.loads(erd.public["starter"][0]["content"])
        except json.JSONDecodeError:
            state["erd"] = None
    for stage in ("sql", "orm"):
        milestone = _stage_milestone(project_id, stage)
        if milestone and milestone.public.get("starter"):
            state[stage] = milestone.public["starter"][0]["content"]
    return state

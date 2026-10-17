"""Durable project workspace / checkpoint / milestone-progress store (PRD-05).

Reuses the same app-owned SQLite file and lock as :mod:`app.progress` (one
writer, no cross-module race) but keeps a distinct set of tables:

* ``project_workspaces`` — the learner's live, auto-saved working state. This is
  a *draft*: editing it never earns progress and never creates a checkpoint.
* ``project_milestone_passes`` — learning progress, keyed by
  ``(project_id, milestone_id, assessment_version)`` and kept as history, exactly
  like exercise passes. Reset/Restore never delete these.
* ``project_checkpoints`` — a *validated* snapshot captured only when a milestone
  passes. Keyed by assessment version, so a newer checkpoint never overwrites an
  older valid one.

Workspace and checkpoints are stored **per project** and are structurally
independent: reading or resetting one project never touches another.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from . import progress, projects


def _ensure(connection: sqlite3.Connection) -> None:
    progress._ensure_schema(connection)


def save_workspace(*, project_id: str, state: dict, current_milestone: str) -> None:
    with progress._LOCK, progress._connect() as connection:
        _ensure(connection)
        connection.execute(
            "INSERT INTO project_workspaces (project_id, state, current_milestone, updated_at) "
            "VALUES (?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET "
            "state = excluded.state, current_milestone = excluded.current_milestone, "
            "updated_at = excluded.updated_at",
            (
                project_id,
                json.dumps(state, ensure_ascii=False, default=str),
                current_milestone,
                progress._now(),
            ),
        )
        connection.commit()


def get_workspace(*, project_id: str) -> dict[str, Any] | None:
    with progress._LOCK, progress._connect() as connection:
        _ensure(connection)
        row = connection.execute(
            "SELECT state, current_milestone, updated_at FROM project_workspaces "
            "WHERE project_id = ?",
            (project_id,),
        ).fetchone()
    if row is None:
        return None
    try:
        state = json.loads(row["state"])
    except json.JSONDecodeError:
        state = None
    return {
        "state": state,
        "currentMilestone": row["current_milestone"],
        "updatedAt": row["updated_at"],
    }


def clear_workspace(*, project_id: str) -> None:
    """Remove the live workspace so the next read falls back to the starter.

    Does not touch milestone passes or checkpoints.
    """
    with progress._LOCK, progress._connect() as connection:
        _ensure(connection)
        connection.execute(
            "DELETE FROM project_workspaces WHERE project_id = ?", (project_id,)
        )
        connection.commit()


def record_milestone_pass(
    *, project_id: str, milestone_id: str, checkpoint_id: str, assessment_version: int
) -> None:
    with progress._LOCK, progress._connect() as connection:
        _ensure(connection)
        connection.execute(
            "INSERT OR IGNORE INTO project_milestone_passes (project_id, milestone_id, "
            "checkpoint_id, assessment_version, passed_at) VALUES (?, ?, ?, ?, ?)",
            (project_id, milestone_id, checkpoint_id, assessment_version, progress._now()),
        )
        connection.commit()


def save_checkpoint(
    *,
    project_id: str,
    checkpoint_id: str,
    milestone_id: str,
    assessment_version: int,
    content_version: str,
    workspace: dict,
    db_snapshot: dict | None,
) -> None:
    with progress._LOCK, progress._connect() as connection:
        _ensure(connection)
        connection.execute(
            "INSERT INTO project_checkpoints (project_id, checkpoint_id, milestone_id, "
            "assessment_version, content_version, workspace, db_snapshot, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, checkpoint_id, "
            "assessment_version) DO UPDATE SET workspace = excluded.workspace, "
            "db_snapshot = excluded.db_snapshot, content_version = excluded.content_version, "
            "created_at = excluded.created_at",
            (
                project_id,
                checkpoint_id,
                milestone_id,
                assessment_version,
                content_version,
                json.dumps(workspace, ensure_ascii=False, default=str),
                json.dumps(db_snapshot, ensure_ascii=False, default=str) if db_snapshot is not None else None,
                progress._now(),
            ),
        )
        connection.commit()


def _latest_per_checkpoint(
    connection: sqlite3.Connection, project_id: str
) -> dict[str, dict[str, Any]]:
    rows = connection.execute(
        "SELECT checkpoint_id, milestone_id, assessment_version, content_version, "
        "workspace, db_snapshot, created_at FROM project_checkpoints "
        "WHERE project_id = ?",
        (project_id,),
    ).fetchall()
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        current = latest.get(row["checkpoint_id"])
        if current is None or row["assessment_version"] > current["assessmentVersion"]:
            latest[row["checkpoint_id"]] = {
                "checkpointId": row["checkpoint_id"],
                "milestoneId": row["milestone_id"],
                "assessmentVersion": row["assessment_version"],
                "contentVersion": row["content_version"],
                "workspace": json.loads(row["workspace"]) if row["workspace"] else None,
                "dbSnapshot": json.loads(row["db_snapshot"]) if row["db_snapshot"] else None,
                "createdAt": row["created_at"],
            }
    return latest


def get_checkpoint(*, project_id: str, checkpoint_id: str) -> dict[str, Any] | None:
    with progress._LOCK, progress._connect() as connection:
        _ensure(connection)
        latest = _latest_per_checkpoint(connection, project_id)
    return latest.get(checkpoint_id)


def list_checkpoints(*, project_id: str) -> list[dict[str, Any]]:
    """Public checkpoint summaries for one project (no snapshot payloads)."""
    with progress._LOCK, progress._connect() as connection:
        _ensure(connection)
        latest = _latest_per_checkpoint(connection, project_id)
    return sorted(
        (
            {
                "checkpointId": entry["checkpointId"],
                "milestoneId": entry["milestoneId"],
                "assessmentVersion": entry["assessmentVersion"],
                "contentVersion": entry["contentVersion"],
                "createdAt": entry["createdAt"],
                "hasDbSnapshot": entry["dbSnapshot"] is not None,
            }
            for entry in latest.values()
        ),
        key=lambda item: item["createdAt"],
    )


def _milestone_passes(
    connection: sqlite3.Connection, project_id: str
) -> dict[str, dict[str, Any]]:
    rows = connection.execute(
        "SELECT milestone_id, checkpoint_id, assessment_version, passed_at "
        "FROM project_milestone_passes WHERE project_id = ?",
        (project_id,),
    ).fetchall()
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        current = latest.get(row["milestone_id"])
        if current is None or row["assessment_version"] > current["assessmentVersion"]:
            latest[row["milestone_id"]] = {
                "checkpointId": row["checkpoint_id"],
                "assessmentVersion": row["assessment_version"],
                "passedAt": row["passed_at"],
            }
    return latest


def progress_snapshot(*, project_id: str) -> dict[str, Any]:
    """Project learning progress — independent of the current workspace.

    Milestones are ordered by the authored sequence; a milestone is ``available``
    when every *executable* dependency has been passed under its current
    assessment version (planning-only dependencies never gate execution).
    """
    authored = projects.get_project(project_id)
    if authored is None:
        return {"projectId": project_id, "milestones": {}, "totals": {}}
    with progress._LOCK, progress._connect() as connection:
        _ensure(connection)
        passes = _milestone_passes(connection, project_id)
        checkpoints = _latest_per_checkpoint(connection, project_id)

    milestone_states: dict[str, dict[str, Any]] = {}
    passed_count = 0
    for milestone_id in authored.order:
        spec = projects.get_milestone(project_id, milestone_id)
        assert spec is not None
        info = passes.get(milestone_id)
        passed = info is not None
        passed_version = info["assessmentVersion"] if info else None
        legacy = bool(
            passed and passed_version is not None and passed_version < spec.spec.validator_version
        )
        if passed:
            passed_count += 1
        checkpoint = checkpoints.get(spec.spec.checkpoint_id)
        dependencies = [
            dep for dep in spec.spec.depends_on if dep in authored.milestones
        ]
        available = all(
            (dep in passes and passes[dep]["assessmentVersion"] >= authored.milestones[dep]
             .spec.validator_version)
            for dep in dependencies
        )
        milestone_states[milestone_id] = {
            "milestoneId": milestone_id,
            "passed": passed,
            "passedAssessmentVersion": passed_version,
            "currentAssessmentVersion": spec.spec.validator_version,
            "legacy": legacy,
            "available": available,
            "dependencies": spec.spec.depends_on,
            "checkpointId": spec.spec.checkpoint_id,
            "checkpointAvailable": checkpoint is not None,
        }
    return {
        "projectId": project_id,
        "milestones": milestone_states,
        "totals": {
            "executableMilestones": len(authored.order),
            "passedMilestones": passed_count,
            "checkpoints": sum(1 for s in milestone_states.values() if s["checkpointAvailable"]),
        },
    }

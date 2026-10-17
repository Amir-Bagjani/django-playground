"""Academy runner control API.

Not published to the host: only the Next.js BFF reaches it over the internal
Compose network. It owns the disposable MySQL exercise schemas, runs learner
SQL/ORM submissions in a controlled way, records durable progress and never
returns validator reference files.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import (
    checks,
    config,
    db,
    erd_checks,
    exercises,
    orm_engine,
    progress,
    project_checks,
    project_store,
    projects,
    seeds,
    sql_engine,
)
from .db import DbUnavailable


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    db.wait_for_mysql()
    for spec in exercises.all_specs():
        # ERD exercises own no MySQL dataset; there is nothing to seed.
        if spec.kind == "erd":
            continue
        seeds.ensure_seeded(spec)
    progress.schema_version()
    yield


app = FastAPI(title="Academy Runner", version="0.4.0", lifespan=lifespan)


class Submission(BaseModel):
    exerciseId: str
    source: str = Field(default="")


class EvaluateRequest(BaseModel):
    exerciseId: str | None = None
    source: str = Field(default="")
    graph: dict[str, Any] | None = None


class DraftRequest(BaseModel):
    graph: dict[str, Any]

    model_config = {"extra": "forbid"}


class HintsRequest(BaseModel):
    revealed: int = 0


class WorkspaceRequest(BaseModel):
    state: dict[str, Any] | None = None
    currentMilestone: str | None = None

    model_config = {"extra": "forbid"}


class MilestoneEvaluateRequest(BaseModel):
    state: dict[str, Any] | None = None

    model_config = {"extra": "forbid"}


def _spec_or_404(exercise_id: str) -> exercises.Spec:
    spec = exercises.get_spec(exercise_id)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"Unknown exercise '{exercise_id}'")
    return spec


def _project_or_404(project_id: str) -> dict[str, Any]:
    public = projects.get_public(project_id)
    if public is None:
        raise HTTPException(status_code=404, detail=f"Unknown project '{project_id}'")
    return public


def _milestone_or_404(project_id: str, milestone_id: str) -> dict[str, Any]:
    _project_or_404(project_id)
    public = projects.milestone_public(project_id, milestone_id)
    if public is None:
        raise HTTPException(status_code=404, detail=f"Unknown milestone '{milestone_id}'")
    return public


def _default_current_milestone(project_id: str) -> str:
    executable = projects.executable_milestone_ids(project_id)
    return executable[0] if executable else ""


def _workspace_response(project_id: str) -> dict[str, Any]:
    stored = project_store.get_workspace(project_id=project_id)
    stored_state = (stored or {}).get("state")
    state = stored_state if stored_state else projects.initial_workspace_state(project_id)
    return {
        "projectId": project_id,
        "state": state,
        "currentMilestone": (stored or {}).get("currentMilestone")
        or _default_current_milestone(project_id),
        "updatedAt": (stored or {}).get("updatedAt"),
    }


def _project_detail(project_id: str) -> dict[str, Any]:
    detail = dict(_project_or_404(project_id))
    detail["workspace"] = _workspace_response(project_id)
    detail["progress"] = project_store.progress_snapshot(project_id=project_id)
    return detail


def _system_error(exc: Exception) -> dict[str, Any]:
    return {"status": "system_error", "error": f"خطای سیستمی دیتابیس: {exc}"}


def _run_check(spec: exercises.Spec, source: str) -> dict[str, Any]:
    if spec.kind == "sql":
        return sql_engine.check(spec, source)
    if spec.kind == "django-orm":
        return orm_engine.check(spec, source)
    raise HTTPException(status_code=400, detail="Exercise kind is not supported yet")


def _run_erd(spec: exercises.Spec, graph: Any) -> dict[str, Any]:
    return erd_checks.build_payload(spec, graph)


def _persist(spec: exercises.Spec, result: dict[str, Any]) -> None:
    outcome = result.get("outcome", "")
    passed = bool(result.get("passed"))
    progress.record_attempt(
        exercise_id=spec.id,
        lesson_id=spec.lesson_id,
        level=spec.level,
        assessment_version=spec.validator_version,
        status=result.get("status", ""),
        outcome=outcome,
        passed=passed,
        checks=result.get("checks", []),
    )
    if passed and outcome == "success":
        progress.record_pass(
            exercise_id=spec.id,
            lesson_id=spec.lesson_id,
            level=spec.level,
            assessment_version=spec.validator_version,
        )


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        db.wait_for_mysql(attempts=1, delay=0.0)
        mysql_ready = True
    except DbUnavailable:
        mysql_ready = False
    return {
        "status": "ok",
        "service": "academy-runner",
        "mysql": mysql_ready,
        "registryIssues": exercises.registry_issues(),
        "projectRegistryIssues": projects.registry_issues(),
    }


@app.get("/v1/exercises")
def list_exercises() -> dict[str, Any]:
    return {"exercises": exercises.list_public()}


@app.get("/v1/exercises/{exercise_id}")
def get_exercise(exercise_id: str) -> dict[str, Any]:
    _spec_or_404(exercise_id)
    public = exercises.get_public(exercise_id)
    if public is None:
        raise HTTPException(status_code=404, detail=f"No public metadata for '{exercise_id}'")
    return public


@app.get("/v1/exercises/{exercise_id}/schema")
def exercise_schema(exercise_id: str) -> dict[str, Any]:
    spec = _spec_or_404(exercise_id)
    if spec.kind == "erd":
        raise HTTPException(status_code=400, detail="ERD exercises have no SQL schema")
    try:
        return db.schema_preview(spec.schema)
    except DbUnavailable as exc:
        return _system_error(exc)


@app.post("/v1/exercises/{exercise_id}/reset")
def reset_exercise(exercise_id: str) -> dict[str, Any]:
    spec = _spec_or_404(exercise_id)
    if spec.kind == "erd":
        # Reset restores the exercise starter state for the *draft* only; earned
        # progress and revealed hints are untouched.
        progress.clear_draft(exercise_id=exercise_id)
        return {"status": "ok", "exerciseId": exercise_id}
    try:
        with sql_engine.LOCK:
            seeds.reset(spec)
    except DbUnavailable as exc:
        return _system_error(exc)
    return {"status": "ok", "exerciseId": exercise_id}


@app.get("/v1/exercises/{exercise_id}/draft")
def get_draft(exercise_id: str) -> dict[str, Any]:
    _spec_or_404(exercise_id)
    draft = progress.get_draft(exercise_id=exercise_id)
    return {
        "exerciseId": exercise_id,
        "graph": (draft or {}).get("graph"),
        "updatedAt": (draft or {}).get("updatedAt"),
    }


@app.put("/v1/exercises/{exercise_id}/draft")
def put_draft(exercise_id: str, payload: DraftRequest) -> dict[str, Any]:
    _spec_or_404(exercise_id)
    encoded = json.dumps(payload.graph, ensure_ascii=False)
    if len(encoded.encode("utf-8")) > config.DRAFT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Draft is too large")
    progress.save_draft(exercise_id=exercise_id, graph=encoded)
    return {"status": "ok", "exerciseId": exercise_id}


@app.post("/v1/exercises/{exercise_id}/hints/next")
def next_hint(exercise_id: str, payload: HintsRequest) -> dict[str, Any]:
    _spec_or_404(exercise_id)
    hints = exercises.hints_for(exercise_id)
    total = exercises.hint_total(exercise_id)
    revealed = max(0, min(int(payload.revealed), total))
    if revealed >= total:
        return {
            "exerciseId": exercise_id,
            "hint": None,
            "revealed": revealed,
            "total": total,
            "canRequestMore": False,
        }
    hint = hints[revealed]
    return {
        "exerciseId": exercise_id,
        "hint": {"id": hint.get("id"), "text_fa": hint.get("text_fa")},
        "revealed": revealed + 1,
        "total": total,
        "canRequestMore": revealed + 1 < total,
    }


@app.get("/v1/projects")
def list_projects() -> dict[str, Any]:
    return {"projects": projects.list_public()}


@app.get("/v1/projects/{project_id}")
def get_project(project_id: str) -> dict[str, Any]:
    return _project_detail(project_id)


@app.get("/v1/projects/{project_id}/workspace")
def get_workspace(project_id: str) -> dict[str, Any]:
    _project_or_404(project_id)
    return _workspace_response(project_id)


@app.put("/v1/projects/{project_id}/workspace")
def put_workspace(project_id: str, payload: WorkspaceRequest) -> dict[str, Any]:
    _project_or_404(project_id)
    state = payload.state or {}
    encoded = json.dumps(state, ensure_ascii=False)
    if len(encoded.encode("utf-8")) > config.WORKSPACE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Workspace is too large")
    current = payload.currentMilestone or _default_current_milestone(project_id)
    project_store.save_workspace(project_id=project_id, state=state, current_milestone=current)
    return {"status": "ok", "projectId": project_id, "currentMilestone": current}


@app.post("/v1/projects/{project_id}/milestones/{milestone_id}/evaluate")
def evaluate_milestone(
    project_id: str, milestone_id: str, payload: MilestoneEvaluateRequest
) -> dict[str, Any]:
    _milestone_or_404(project_id, milestone_id)
    progress_state = project_store.progress_snapshot(project_id=project_id)
    milestone_state = progress_state["milestones"].get(milestone_id)
    if milestone_state is not None and not milestone_state["available"]:
        raise HTTPException(
            status_code=409,
            detail="Milestone is locked until its prerequisites pass",
        )

    if payload.state is not None:
        state = payload.state
    else:
        state = (project_store.get_workspace(project_id=project_id) or {}).get("state") or {}

    try:
        result = project_checks.evaluate(project_id, milestone_id, state)
    except DbUnavailable as exc:
        result = checks.system_error_payload(
            projects.get_milestone(project_id, milestone_id).spec.engine_spec(),
            f"خطای سیستمی دیتابیس: {exc}",
        )
    if result is None:
        raise HTTPException(status_code=404, detail=f"Unknown milestone '{milestone_id}'")

    project_store.save_workspace(
        project_id=project_id, state=state, current_milestone=milestone_id
    )
    if result.get("passed"):
        milestone = projects.get_milestone(project_id, milestone_id)
        assert milestone is not None
        project_store.record_milestone_pass(
            project_id=project_id,
            milestone_id=milestone_id,
            checkpoint_id=milestone.spec.checkpoint_id,
            assessment_version=milestone.spec.validator_version,
        )
        snapshot = project_checks.capture_db_snapshot(project_id, milestone_id)
        project_store.save_checkpoint(
            project_id=project_id,
            checkpoint_id=milestone.spec.checkpoint_id,
            milestone_id=milestone_id,
            assessment_version=milestone.spec.validator_version,
            content_version=f"{project_id}@{milestone.spec.validator_version}",
            workspace=state,
            db_snapshot=snapshot,
        )
        result["checkpointId"] = milestone.spec.checkpoint_id
    result["progress"] = project_store.progress_snapshot(project_id=project_id)
    return result


@app.get("/v1/projects/{project_id}/checkpoints")
def list_checkpoints(project_id: str) -> dict[str, Any]:
    _project_or_404(project_id)
    return {
        "projectId": project_id,
        "checkpoints": project_store.list_checkpoints(project_id=project_id),
    }


@app.post("/v1/projects/{project_id}/checkpoints/{checkpoint_id}/restore")
def restore_checkpoint(project_id: str, checkpoint_id: str) -> dict[str, Any]:
    _project_or_404(project_id)
    checkpoint = project_store.get_checkpoint(
        project_id=project_id, checkpoint_id=checkpoint_id
    )
    if checkpoint is None:
        raise HTTPException(status_code=404, detail=f"No checkpoint '{checkpoint_id}'")
    try:
        project_checks.restore_db_snapshot(
            project_id, checkpoint["milestoneId"], checkpoint["dbSnapshot"]
        )
    except project_checks.project_db.ProjectDbError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    project_store.save_workspace(
        project_id=project_id,
        state=checkpoint["workspace"] or {},
        current_milestone=checkpoint["milestoneId"],
    )
    return {
        "status": "ok",
        "projectId": project_id,
        "checkpointId": checkpoint_id,
        "workspace": _workspace_response(project_id),
    }


@app.post("/v1/projects/{project_id}/reset")
def reset_project(project_id: str) -> dict[str, Any]:
    """Reset the live workspace to the starter. Progress and checkpoints stay."""
    _project_or_404(project_id)
    try:
        project_checks.reset_project_databases(project_id)
    except project_checks.project_db.ProjectDbError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    project_store.clear_workspace(project_id=project_id)
    return {
        "status": "ok",
        "projectId": project_id,
        "workspace": _workspace_response(project_id),
        "progress": project_store.progress_snapshot(project_id=project_id),
    }


@app.post("/v1/projects/{project_id}/milestones/{milestone_id}/hints/next")
def next_project_hint(project_id: str, milestone_id: str, payload: HintsRequest) -> dict[str, Any]:
    _milestone_or_404(project_id, milestone_id)
    hints = projects.hints_for(project_id, milestone_id)
    total = len(hints)
    revealed = max(0, min(int(payload.revealed), total))
    if revealed >= total:
        return {
            "projectId": project_id,
            "milestoneId": milestone_id,
            "hint": None,
            "revealed": revealed,
            "total": total,
            "canRequestMore": False,
        }
    hint = hints[revealed]
    return {
        "projectId": project_id,
        "milestoneId": milestone_id,
        "hint": {"id": hint.get("id"), "text_fa": hint.get("text_fa")},
        "revealed": revealed + 1,
        "total": total,
        "canRequestMore": revealed + 1 < total,
    }


@app.get("/v1/progress")
def get_progress() -> dict[str, Any]:
    return progress.snapshot()


@app.post("/v1/exercises/{exercise_id}/evaluate")
def evaluate_exercise(exercise_id: str, payload: EvaluateRequest) -> dict[str, Any]:
    spec = _spec_or_404(exercise_id)
    if payload.exerciseId is not None and payload.exerciseId != exercise_id:
        raise HTTPException(status_code=400, detail="exerciseId in body does not match path")
    try:
        if spec.kind == "erd":
            if payload.graph is None:
                raise HTTPException(status_code=400, detail="ERD exercise requires a graph document")
            result = _run_erd(spec, payload.graph)
        else:
            result = _run_check(spec, payload.source)
    except DbUnavailable as exc:
        result = checks.system_error_payload(spec, f"خطای سیستمی دیتابیس: {exc}")
    _persist(spec, result)
    result["progress"] = progress.snapshot()["lessons"].get(spec.lesson_id)
    return result


@app.post("/v1/runtime/sql/execute")
def sql_execute(payload: Submission) -> dict[str, Any]:
    spec = _spec_or_404(payload.exerciseId)
    if spec.kind != "sql":
        raise HTTPException(status_code=400, detail="Exercise is not a SQL exercise")
    try:
        return sql_engine.execute(spec, payload.source)
    except DbUnavailable as exc:
        return _system_error(exc)


@app.post("/v1/runtime/sql/check")
def sql_check(payload: Submission) -> dict[str, Any]:
    spec = _spec_or_404(payload.exerciseId)
    if spec.kind != "sql":
        raise HTTPException(status_code=400, detail="Exercise is not a SQL exercise")
    try:
        return sql_engine.check(spec, payload.source)
    except DbUnavailable as exc:
        return checks.system_error_payload(spec, f"خطای سیستمی دیتابیس: {exc}")


@app.post("/v1/runtime/orm/execute")
def orm_execute(payload: Submission) -> dict[str, Any]:
    spec = _spec_or_404(payload.exerciseId)
    if spec.kind != "django-orm":
        raise HTTPException(status_code=400, detail="Exercise is not an ORM exercise")
    try:
        return orm_engine.execute(spec, payload.source)
    except DbUnavailable as exc:
        return _system_error(exc)


@app.post("/v1/runtime/orm/check")
def orm_check(payload: Submission) -> dict[str, Any]:
    spec = _spec_or_404(payload.exerciseId)
    if spec.kind != "django-orm":
        raise HTTPException(status_code=400, detail="Exercise is not an ORM exercise")
    try:
        return orm_engine.check(spec, payload.source)
    except DbUnavailable as exc:
        return checks.system_error_payload(spec, f"خطای سیستمی دیتابیس: {exc}")

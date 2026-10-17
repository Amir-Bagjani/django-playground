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

from . import checks, config, db, erd_checks, exercises, orm_engine, progress, seeds, sql_engine
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


app = FastAPI(title="Academy Runner", version="0.3.0", lifespan=lifespan)


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


def _spec_or_404(exercise_id: str) -> exercises.Spec:
    spec = exercises.get_spec(exercise_id)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"Unknown exercise '{exercise_id}'")
    return spec


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

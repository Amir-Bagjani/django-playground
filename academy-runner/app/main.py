"""Academy runner control API.

Not published to the host: only the Next.js BFF reaches it over the internal
Compose network. It owns the disposable MySQL exercise schemas, runs learner
SQL/ORM submissions in a controlled way and never returns validator reference
files.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import config, db, exercises, orm_engine, seeds, sql_engine
from .db import DbUnavailable


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    db.wait_for_mysql()
    for spec in exercises.all_specs():
        seeds.ensure_seeded(spec)
    yield


app = FastAPI(title="Academy Runner", version="0.1.0", lifespan=lifespan)


class Submission(BaseModel):
    exerciseId: str
    source: str = Field(default="")


def _spec_or_404(exercise_id: str) -> exercises.Spec:
    spec = exercises.get_spec(exercise_id)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"Unknown exercise '{exercise_id}'")
    return spec


def _system_error(exc: Exception) -> dict[str, Any]:
    return {"status": "system_error", "error": f"خطای سیستمی دیتابیس: {exc}"}


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        db.wait_for_mysql(attempts=1, delay=0.0)
        mysql_ready = True
    except DbUnavailable:
        mysql_ready = False
    return {"status": "ok", "service": "academy-runner", "mysql": mysql_ready}


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
    try:
        return db.schema_preview(spec.schema)
    except DbUnavailable as exc:
        return _system_error(exc)


@app.post("/v1/exercises/{exercise_id}/reset")
def reset_exercise(exercise_id: str) -> dict[str, Any]:
    spec = _spec_or_404(exercise_id)
    try:
        with sql_engine.LOCK:
            seeds.reset(spec)
    except DbUnavailable as exc:
        return _system_error(exc)
    return {"status": "ok", "exerciseId": exercise_id}


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
        return _system_error(exc)


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
        return _system_error(exc)

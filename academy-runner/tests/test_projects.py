"""Progressive projects: autosave, checkpoints, restore, reset, gating (PRD-05).

Real MySQL + Django migrations inside the Compose network. Scoped to the new
project module only; no legacy Django Playground tests are run.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import project_db, project_store, projects
from app.main import app

PROJECT = "booking"


def attr(aid: str, name: str, type_: str, *, pk: bool = False, unique: bool = False, nullable: bool = True) -> dict:
    return {"id": aid, "name": name, "type": type_, "nullable": nullable, "primaryKey": pk, "unique": unique}


def booking_erd_graph() -> dict:
    return {
        "schema_version": 1,
        "entities": [
            {
                "id": "e_rooms",
                "name": "rooms",
                "attributes": [
                    attr("r1", "id", "INT", pk=True, unique=True, nullable=False),
                    attr("r2", "room_number", "VARCHAR(20)", nullable=False),
                    attr("r3", "capacity", "INT", nullable=False),
                ],
            },
            {
                "id": "e_bookings",
                "name": "bookings",
                "attributes": [
                    attr("b1", "id", "INT", pk=True, unique=True, nullable=False),
                    attr("b2", "room_id", "INT", nullable=False),
                    attr("b3", "guest_name", "VARCHAR(120)", nullable=False),
                    attr("b4", "check_in", "DATE", nullable=False),
                    attr("b5", "check_out", "DATE", nullable=False),
                ],
            },
        ],
        "relationships": [
            {
                "id": "r1",
                "fromEntityId": "e_rooms",
                "toEntityId": "e_bookings",
                "fromCardinality": "one",
                "toCardinality": "many",
                "optionality": "mandatory",
                "foreignKeyAttributeId": "b2",
            }
        ],
    }


BOOKING_SQL = """
CREATE TABLE rooms (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_number VARCHAR(20) NOT NULL,
  capacity INT NOT NULL,
  PRIMARY KEY (id)
);
CREATE TABLE bookings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id INT UNSIGNED NOT NULL,
  guest_name VARCHAR(120) NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_bookings_room FOREIGN KEY (room_id) REFERENCES rooms(id)
);
INSERT INTO rooms (room_number, capacity) VALUES ('101', 2), ('102', 3);
INSERT INTO bookings (room_id, guest_name, check_in, check_out) VALUES
  (1, 'Ali', '2026-01-01', '2026-01-03'),
  (2, 'Sara', '2026-02-01', '2026-02-05');
"""

BOOKING_MODELS = """
from django.db import models


class Room(models.Model):
    room_number = models.CharField(max_length=20)
    capacity = models.PositiveIntegerField()


class Booking(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="bookings")
    guest_name = models.CharField(max_length=120)
    check_in = models.DateField()
    check_out = models.DateField()
"""


def statuses(result: dict) -> dict[str, str]:
    return {check["criterionId"]: check["status"] for check in result["checks"]}


def test_registry_exposes_executable_milestones_and_planning_only():
    public = projects.get_public(PROJECT)
    assert public is not None
    executable = projects.executable_milestone_ids(PROJECT)
    assert executable == ("booking-erd", "booking-schema", "booking-models")
    # Planning-only milestones stay in the roadmap but are not executable.
    assert any(m["id"] == "booking-concurrency" and not m["executable"] for m in public["milestones"])
    assert projects.get_milestone(PROJECT, "booking-concurrency") is None


def test_workspace_autosave_survives_and_is_per_project():
    with TestClient(app) as client:
        state = {"erd": booking_erd_graph(), "sql": BOOKING_SQL, "orm": "", "notes": "hi"}
        saved = client.put(
            f"/v1/projects/{PROJECT}/workspace",
            json={"state": state, "currentMilestone": "booking-erd"},
        ).json()
        assert saved["status"] == "ok"
        # A fresh read (simulating a refresh/restart) returns the saved workspace.
        fetched = client.get(f"/v1/projects/{PROJECT}/workspace").json()
        assert fetched["state"]["sql"].strip().startswith("CREATE TABLE rooms")
        assert fetched["currentMilestone"] == "booking-erd"

        # A different project's workspace is stored independently.
        project_store.save_workspace(project_id="other", state={"sql": "other"}, current_milestone="x")
        assert project_store.get_workspace(project_id="other")["state"]["sql"] == "other"
        assert project_store.get_workspace(project_id=PROJECT)["state"]["notes"] == "hi"


def test_milestone_is_locked_until_dependencies_pass():
    with TestClient(app) as client:
        locked = client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-schema/evaluate",
            json={"state": {"sql": BOOKING_SQL}},
        )
        assert locked.status_code == 409

        detail = client.get(f"/v1/projects/{PROJECT}").json()
        assert detail["progress"]["milestones"]["booking-schema"]["available"] is False
        assert detail["progress"]["milestones"]["booking-erd"]["available"] is True


def test_checkpoint_only_after_a_valid_pass():
    with TestClient(app) as client:
        # Failing ERD design: no checkpoint recorded.
        bad = {"erd": {"schema_version": 1, "entities": [], "relationships": []}}
        result = client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-erd/evaluate", json={"state": bad}
        ).json()
        assert result["passed"] is False
        assert client.get(f"/v1/projects/{PROJECT}/checkpoints").json()["checkpoints"] == []

        # Valid design: pass + checkpoint.
        good = client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-erd/evaluate",
            json={"state": {"erd": booking_erd_graph()}},
        ).json()
        assert good["passed"] is True, good["checks"]
        assert good["checkpointId"] == "booking-erd-cp"
        checkpoints = client.get(f"/v1/projects/{PROJECT}/checkpoints").json()["checkpoints"]
        assert [c["checkpointId"] for c in checkpoints] == ["booking-erd-cp"]


def test_sql_checkpoint_restore_rebuilds_workspace_and_database():
    with TestClient(app) as client:
        client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-erd/evaluate",
            json={"state": {"erd": booking_erd_graph()}},
        )
        sql_state = {"erd": booking_erd_graph(), "sql": BOOKING_SQL}
        passed = client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-schema/evaluate", json={"state": sql_state}
        ).json()
        assert passed["passed"] is True, passed["checks"]

        # Lose the database (as a careless edit would) and overwrite the workspace.
        project_db.reset("academy_project_booking_schema")
        client.put(
            f"/v1/projects/{PROJECT}/workspace",
            json={"state": {"sql": "-- broken draft"}, "currentMilestone": "booking-schema"},
        )

        restored = client.post(f"/v1/projects/{PROJECT}/checkpoints/booking-schema-cp/restore")
        assert restored.status_code == 200
        body = restored.json()
        assert body["workspace"]["state"]["sql"].strip().startswith("CREATE TABLE rooms")

        # The milestone schema is rebuilt with its rows and its FK constraint.
        structure = project_db.snapshot("academy_project_booking_schema")
        tables = {t["name"]: t for t in structure["tables"]}
        assert "rooms" in tables and "bookings" in tables
        assert len(tables["rooms"]["rows"]) == 2
        from app import project_sql

        info = project_sql.introspect("academy_project_booking_schema")
        assert any(fk["ref_table"] == "rooms" for fk in info["tables"]["bookings"]["foreign_keys"])


def test_reset_clears_workspace_but_keeps_progress_and_checkpoints():
    with TestClient(app) as client:
        client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-erd/evaluate",
            json={"state": {"erd": booking_erd_graph()}},
        )
        before = client.get(f"/v1/projects/{PROJECT}").json()["progress"]["totals"]
        assert before["passedMilestones"] == 1

        reset = client.post(f"/v1/projects/{PROJECT}/reset").json()
        assert reset["status"] == "ok"
        # Workspace cleared to the starter, progress and checkpoint kept.
        assert reset["workspace"]["state"]["sql"].strip().startswith("-- مرحله‌ی ۲")
        after = reset["progress"]["totals"]
        assert after["passedMilestones"] == 1
        assert after["checkpoints"] == 1


def test_restore_failure_keeps_active_database():
    # A corrupted snapshot must not destroy the current schema.
    project_db.ensure_identity("academy_project_booking_schema", "acad_project_booking_schema")
    good = {
        "schemaVersion": 1,
        "tables": [
            {
                "name": "t",
                "create_sql": "CREATE TABLE `t` (`id` INT NOT NULL, PRIMARY KEY (`id`))",
                "columns": ["id"],
                "rows": [[1]],
            }
        ],
    }
    project_db.restore("academy_project_booking_schema", good)
    broken = {
        "schemaVersion": 1,
        "tables": [
            {
                "name": "t",
                "create_sql": "CREATE TABLE `t` (this is not sql",
                "columns": ["id"],
                "rows": [[1]],
            }
        ],
    }
    with pytest.raises(project_db.ProjectDbError):
        project_db.restore("academy_project_booking_schema", broken)
    # Active schema still present and intact.
    snapshot = project_db.snapshot("academy_project_booking_schema")
    assert [t["name"] for t in snapshot["tables"]] == ["t"]


def test_orm_milestone_runs_migrations_and_passes():
    with TestClient(app) as client:
        client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-erd/evaluate",
            json={"state": {"erd": booking_erd_graph()}},
        )
        client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-schema/evaluate",
            json={"state": {"erd": booking_erd_graph(), "sql": BOOKING_SQL}},
        )
        result = client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-models/evaluate",
            json={"state": {"erd": booking_erd_graph(), "sql": BOOKING_SQL, "orm": BOOKING_MODELS}},
        ).json()
        assert result["passed"] is True, result["checks"]
        outcomes = statuses(result)
        assert outcomes["models-foreign-key"] == "passed"
        assert outcomes["models-nullable"] == "passed"
        # The ORM checkpoint captured a real DB snapshot.
        checkpoint = project_store.get_checkpoint(
            project_id=PROJECT, checkpoint_id="booking-models-cp"
        )
        assert checkpoint is not None and checkpoint["dbSnapshot"] is not None


def test_hints_are_served_one_at_a_time():
    with TestClient(app) as client:
        first = client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-erd/hints/next", json={"revealed": 0}
        ).json()
        assert first["hint"]["id"] == "hint-1"
        assert first["revealed"] == 1
        done = client.post(
            f"/v1/projects/{PROJECT}/milestones/booking-erd/hints/next", json={"revealed": 1}
        ).json()
        assert done["hint"] is None

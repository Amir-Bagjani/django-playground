# Instructor-only validation plan — Booking project (PRD-05)

This documents the **real** milestone checks for the first progressive project.
It is never served to the learner UI. Reference solutions, hidden criteria and
the MySQL staging details stay in the runner.

## Milestones (exact id / stage / validator / checkpoint)

| milestone id | stage | validator id | version | checkpoint id | depends on |
|---|---|---|---|---|---|
| `booking-erd` | erd | `booking-erd-validator` | 1 | `booking-erd-cp` | `booking-requirements` (planning-only) |
| `booking-schema` | sql | `booking-schema-validator` | 1 | `booking-schema-cp` | `booking-erd` |
| `booking-models` | orm | `booking-models-validator` | 1 | `booking-models-cp` | `booking-schema` |

A planning-only milestone (no `stage_kind`) is shown for roadmap context and
does **not** gate execution; only passed *executable* dependencies gate a stage.

## Workspace, drafts and checkpoints

- The learner workspace (`erd`, `sql`, `orm`, `notes`, `current_milestone`) is
  auto-saved to the app-owned SQLite store, **separate** from checkpoints.
- A checkpoint is written only when a milestone's automatic criteria pass. It
  records the full workspace at that point, the milestone id, assessment
  version, content version and the milestone's logical MySQL snapshot (DDL +
  rows, captured with `SHOW CREATE TABLE` and `SELECT *`).
- Restore rebuilds the snapshot in a **staging schema**, verifies tables,
  columns, keys and row counts, and only then replaces the active schema. On
  failure the active workspace and older checkpoints are untouched. MySQL DDL
  implicit commits mean rollback is never used.
- Reset restores the content-pack starter (blank workspace + fresh empty
  schema). Neither Restore nor Reset touches pass history, checkpoints of other
  milestones, or any other project.

## Milestone checks

### `booking-erd` (semantic ERD, reused from PRD-04)
Entities `rooms` (id PK, room_number text, capacity integer) and `bookings`
(id PK, room_id FK to rooms, guest_name text, check_in/check_out temporal).
Criteria: `required-entities`, `required-attributes`, `primary-keys`,
`relationship-cardinality` (rooms 1 → bookings N, mandatory),
`foreign-key` (bookings.room_id), `referential-integrity`, and the manual
`design-rationale`. Names/casing/aliases/drawing direction are normalized;
node positions are ignored.

### `booking-schema` (real MySQL structural check)
The whole script runs as the milestone's restricted user in its disposable
schema (multi-statement, `;`-separated, size-capped). Then `information_schema`
is introspected: both tables exist (`schema-tables`), each has exactly one PK
(`schema-primary-key`), `bookings` has a real `FOREIGN KEY` to `rooms`
(`schema-foreign-key`), the FK/temporal columns are `NOT NULL`
(`schema-not-null`), and at least two rooms and two bookings were inserted
(`schema-sample-data`). `schema-rationale` is manual.

### `booking-models` (Django makemigrations + migrate)
The learner's `models.py` is written into a throwaway Django app package and run
in a subprocess (`python -m app.project_orm_child`) with a CPU/again-time limit,
minimal environment and the milestone's restricted MySQL user. The child runs
`makemigrations` then `migrate`, and introspects `information_schema` +
`django_migrations`; `models-define`, `models-migrate`, `models-primary-key`,
`models-foreign-key`, `models-nullable` are automatic and `models-rationale` is
manual.

## Isolation
Each milestone owns its own schema (`academy_project_booking_<milestone>`); no
academy exercise schema and no legacy Django Playground data is read or written.
The ORM child never receives the control identity.

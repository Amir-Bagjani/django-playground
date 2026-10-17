# Proposed Technical Architecture — Local Academy

## Implementation reality check
Existing repo is **reported** (not inspected in this task) as Next.js 16 web/BFF, FastAPI `runner` and Django 6.1 child process with SQLite per example. Verify exact code and route names before editing. Never replace the old runner/storage to add Academy. Preserve Django Playground and its user examples.

## Runtime boundaries
```text
Browser (English UI shell, Persian lesson content)
          |
          v
existing Next.js web /playgrounds/{django|database-orm}
          | old /api/runner/*       | new /api/academy/*
          v                         v
  legacy runner (untouched)    academy-runner control API
  Django+SQLite examples       ├─ lesson registry + progress
                               ├─ SQL + ORM evaluator (controlled)
                               ├─ workspace / checkpoint manager
                               └─ MySQL 8.4 (internal Docker network)
```

**Service minimization:** PRD-01 adds UI Hub/routing only. PRD-02 may add two isolated containers (`academy-runner`, `academy-mysql`) if existing runner does not provide clean separation. These are not required until SQL+ORM execution. Avoid per-lesson containers or dynamic Docker orchestrator during initial local MVP; one controlled schema at a time can suffice.

## Route & UI boundaries
`/` Hub selects module; `/playgrounds/django` retains existing code environment; `/playgrounds/database-orm` Academy syllabus/lesson/Exercise. Maintain old direct navigation aliases if users have them. Both share visual shell as convenience but **not** test / execution / user storage namespaces. Do not render future cards as fake active modules.

## Storage and DB roles
- Content (lesson Markdown/YAML/JSON, diagrams) read-only repository files, version controlled by Git.
- Progress/checkpoints stored under dedicated persistent Academy volume/path, not `playground_data` records of old runner; can use small SQLite database for progress metadata.
- MySQL receives controlled train-only credentials; no host port exposure, separate dedicated schemas per exercise / project workspace, no connection to host MySQL/user accounts.
- Backend grants least privilege required for exercise kind to disposable schema. If privileged operations needed for DROP/CREATE, use a separate control identity not accessible to learner code.
- Fixed resource caps (time, response rows/bytes, query results, DB size, CPU/memory where supported); cancellation/timeout statuses surfaced honestly.

## SQL evaluation safety
A SQL parser or regex **cannot be a sandbox**. SQL may include DDL, DML or multi-statements; allow task-required operations **only on disposable isolated schema** with bound credentials and imposed limits. No direct administrative privileges or unrestricted access to MySQL system schemas. Enforce DB name allowlist on server, never rely on client path names. Reset by drop/recreate **disposable** schema, not transaction rollback for DDL.

## Django ORM evaluation safety
Treat submitted Python as code execution on local machine through a container; there is no production-grade hostile-code sandbox claim. For each check, materialize controlled minimal Django project, inject learner-editable solution files, keep backend validator code inaccessible to learner and run with subprocess timeouts and constraints; no unrestricted shell command composition, Docker socket, privileged container or host file mounts. Use dedicated MySQL schema, no secrets in learner-visible environment. ORM outputs/tracebacks appropriately sanitized, with relevant user code line when supportable.

## Django/MySQL behavior caveats
- MySQL InnoDB defaults to REPEATABLE READ; Django MySQL backend normally defaults to READ COMMITTED. Content should specify which isolation is being exercised and what actual connection uses.
- DDL statements often cause implicit commits on MySQL; stage reset / restore from fresh schema/backups instead of assuming `ROLLBACK` reverts table changes.
- Default charset/collation and sql_mode chosen explicitly, documented to avoid ambiguous training results. Prefer strict SQL mode and `utf8mb4` where compatible.
- Avoid lessons asserting `ForeignKey(on_delete=...)` generates identical database `ON DELETE` behavior; inspect generated SQL.

## ERD model
JSON data model version 1: `entities[{id,name,attributes[{id,name,type,nullable,primaryKey,unique}]}]`, `relationships[{id,fromEntityId,toEntityId,fromCardinality,toCardinality,optionality,foreignKeyAttributeId}]`. UI may use React Flow only as rendering/editing library; serialized graph is source of truth. Validation normalizes relation semantics; not tied to node positions. For a lesson expected to create MySQL schema from diagram, treat generation as an *assistive visualization only*— learner must do meaningful design work, not obtain completed answer with a single click.

## Project checkpoints
Manifest ties snapshot to workspace ID, content version, DB logical dump hash, ERD hash, code hash and migration state. Restore into fresh training schema, check integrity and only then switch active workspace pointer. On failure rollback pointer/retain earlier DB. Failure UI must make potential database work visible; no false success.

## Shared code policy
Shared UI components allowed when truly reusable. Shared user-specific data store, validator rules or runner internals **not** shared by default. Importing Academy functionality into old `runner/app/main.py` only for convenience is discouraged due to test and runtime coupling.

## Integration milestones
- Foundation: navigate existing lab unchanged; local Academy syllabus stub with approved **sample** content distinctly marked draft.
- Lab: real MySQL + Django one complete exercise.
- Grading: deterministic real checks plus persisted outcomes.
- ERD: visual and editable schema tasks.
- Checkpoint: restore exercised by induced failure.
- Content packs: publish only reviewed/verified lessons.

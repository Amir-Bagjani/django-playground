# academy-runner

Control API for the Database & ORM Academy lab (PRD-02). It runs learner SQL
and Django ORM submissions against a disposable MySQL 8.4 schema and evaluates
them with deterministic, real checks. It is **not** published to the host; only
the Next.js BFF reaches it over the internal Compose network (`/api/academy/*`
→ `http://academy-runner:8200`).

## Services

| Service | Role | Host port |
|---|---|---|
| `academy-mysql` | MySQL 8.4, internal only | none (internal only) |
| `academy-runner` | this FastAPI control API | none (`expose: 8200`) |

Both live on a dedicated volume (`academy_mysql_data`), fully separate from the
legacy Django Playground (`playground_data`, SQLite).

## Isolation contract

- **Identities.** Seeding/reset and user management use an internal control
  identity (`root`, internal-only, never exposed to learner code). Learner SQL
  and the ORM child process run as a **per-exercise user granted privileges on
  exactly one schema** (`academy_first_query_sql`, `academy_first_query_orm`).
  System schemas (`mysql`, `information_schema`, `performance_schema`, `sys`)
  and the other exercise schema are not reachable with those grants.
- **Disposable schema.** Each exercise owns one schema. Reset drops and
  recreates it, then re-inserts the known dataset. MySQL DDL causes implicit
  commits, so rollback is never used as the reset mechanism.
- **No SQL-text sandbox.** Safety comes from the schema-scoped credentials and
  limits, never from parsing or pattern-matching learner SQL.
- **ORM isolation.** Submitted Python never runs in the API process. It is
  written to a private temp file and executed by `python -m app.orm_child` with
  a hard timeout, `RLIMIT_CPU`, a minimal environment that contains **no admin
  credentials**, and no shell interpolation. No Docker socket, no privileged
  mode, no broad host mounts.
- **Limits.** SQL: max source size, `MAX_EXECUTION_TIME`, socket read timeout,
  row cap. ORM: max source size, subprocess timeout, row cap.
- **Statuses.** A learner mistake is `error`; a timeout is `timeout`; a
  database/control failure is `system_error` (never reported as a learner
  failure). `Execute` shows raw results; `Check Solution` evaluates criteria.

## MySQL 8.4 settings (documented, not assumed)

Set explicitly via the container command so training results are unambiguous:

- Character set / collation: `utf8mb4` / `utf8mb4_0900_ai_ci` (server + every
  seeded schema and the Django connection `OPTIONS.charset`).
- `sql_mode`: `STRICT_ALL_TABLES,ONLY_FULL_GROUP_BY,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE`.
- Timezone: server `+00:00`; Django `TIME_ZONE="UTC"`, `USE_TZ=True`.
- Transaction isolation: server `REPEATABLE-READ` and Django
  `OPTIONS.isolation_level="repeatable read"`, so **both agree**. Django's MySQL
  backend defaults to READ COMMITTED, which differs from the InnoDB default —
  this is pinned deliberately instead of assumed.

## API

Internal routes are mounted under the BFF at `/api/academy/*`, so the public
URL is `/api/academy` + the path below (for example
`/api/academy/v1/runtime/sql/execute`).

- `GET  /health`
- `GET  /v1/exercises` — public metadata only (no validators/solutions)
- `GET  /v1/exercises/{id}`
- `GET  /v1/exercises/{id}/schema`
- `POST /v1/exercises/{id}/reset`
- `POST /v1/runtime/sql/execute` `{ exerciseId, source }`
- `POST /v1/runtime/sql/check`   `{ exerciseId, source }`
- `POST /v1/runtime/orm/execute` `{ exerciseId, source }`
- `POST /v1/runtime/orm/check`   `{ exerciseId, source }`

Public metadata (title, instructions, starter, public criteria, hints) is read
from the authored content mounted read-only at `/content`
(`academy-planning/content-samples`). Exercise behaviour and validators live in
`app/` and are keyed by exercise id; only exercises listed in
`app/exercises.py:SPECS` are executable.

## Tests

Targeted tests for this module only (real MySQL + Django). From the repo root:

```sh
docker compose run --rm academy-runner python -m pytest -q
```

No legacy Django Playground tests are run for Academy-only changes.

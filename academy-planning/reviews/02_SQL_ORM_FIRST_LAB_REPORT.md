# PRD-02 Delivery Report — MySQL & Django ORM Lab + First Real Learning Slice

**Status:** implemented, runtime-verified on real MySQL 8.4 + Django 6.1 (see evidence below).
**Commit:** this delivery's commit (hash reported in the delivery message).

## 1. What changed

### New service — `academy-runner/`
- `Dockerfile`, `requirements.txt` (Django 6.1.2, FastAPI, uvicorn, PyMySQL 1.1.1,
  cryptography, httpx, pytest), `pytest.ini`, `README.md`.
- `app/config.py` — env-driven config, resource caps, pinned charset/collation/
  sql_mode/timezone/isolation values.
- `app/db.py` — admin (control) connection, **per-exercise restricted user**
  (schema-scoped grants only), schema existence/preview helpers.
- `app/exercises.py` — executable registry (`SPECS`) + public metadata read from
  the read-only mounted content. Only listed exercises are executable; the FK
  authoring sample is intentionally not executable.
- `app/seeds.py` — `products` DDL, seed dataset, **drop/recreate reset**, hidden
  sentinel for the anti-hardcode check.
- `app/sql_engine.py` — execute + check for SQL (size cap, `MAX_EXECUTION_TIME`,
  socket read timeout, row cap; real MySQL errors surfaced).
- `app/orm_engine.py` + `app/orm_child.py` + `app/orm_settings.py` +
  `app/orm_app/` — learner Python executed in a **separate subprocess**
  (`python -m app.orm_child`) with timeout/`RLIMIT_CPU`, minimal environment (no
  admin creds), Django on the exercise schema.
- `app/main.py` — control API.
- `tests/` — targeted tests (see §4).

### `docker-compose.yml`
- New `academy-mysql` (image `mysql:8.4`, **no published host port**,
  `utf8mb4`/`utf8mb4_0900_ai_ci`, strict `sql_mode`, `+00:00`, `REPEATABLE-READ`)
  on a new dedicated volume `academy_mysql_data`.
- New `academy-runner` (internal only, `expose: 8200`, content mounted read-only,
  `depends_on` MySQL healthy).
- `web` gains `ACADEMY_URL`; legacy `runner`/`web` and `playground_data` are
  unchanged (no new hard dependency from `web` on the Academy services).

### Web (`web/`)
- `app/api/academy/[...path]/route.ts` — BFF proxy `/api/academy/*` →
  `academy-runner`, mirroring the existing runner proxy.
- `app/playgrounds/database-orm/lab/lesson-lab.tsx` + `lab.module.css` — the lab:
  exercise tabs, Persian instructions, Monaco SQL/Python editor, `Execute` /
  `Check Solution` / `Reset` / `Show schema`, status+row count+duration, result
  table, criterion checklist, progressive hints, real error/traceback display.
- `app/playgrounds/database-orm/lessons/[lessonId]/page.tsx` — mounts the lab when
  a lesson has exercises.
- `lib/academy.ts` — `LabExercise` types, `labLessons`, `getLabExercises`.
- `lib/academy-content.json` (regenerated) + `lib/README.md`.

### Authoring (`academy-planning/`)
- `content-samples/first-query/` — full Persian lesson `DB-00-008`
  (`lesson.fa.md`, status `approved`), two exercises (`first-query-sql`,
  `first-query-orm`) with instructions + incomplete starters, and an
  instructor-only `validators/validation-plan.md`.
- `curriculum/curriculum.yaml` — `DB-00-008` status → `approved` (no ID change).
- `scripts/generate_web_content.py` — embeds public lab exercise metadata as
  `lab_lessons` (approved lessons only).

## 2. Completed features (PRD-02 scope)

- One complete lesson (`DB-00-008`, from DB-00) with real SQL + ORM examples, a
  SQL-vs-ORM section (lazy evaluation, boundary), two learner-written exercises
  with incomplete starters, acceptance criteria and hints. The bundled ForeignKey
  draft is untouched and remains non-executable.
- **SQL lab**: real execution on MySQL 8.4 in a disposable per-exercise schema;
  raw rows, real MySQL errors, status/duration, row-count cap.
- **ORM lab**: controlled subprocess execution against the same learning schema;
  real ORM values; Python/Django traceback shown as a learner error, not a
  system error.
- **Execute vs Check** separated. `Check Solution`: 1 valid solution passes, and
  ≥2 invalid versions fail — including missing `WHERE`, wrong order, and a
  **hardcoded result** (rejected by the `data-driven` sentinel criterion).
- **Reset** = drop/recreate/reseed the one exercise schema (never rollback).
- **Isolation**: restricted per-exercise users; system schemas and the other
  exercise schema are unreachable; legacy Playground lives in a separate
  container/volume and is never referenced.
- Result inspector with schema preview and grounded status/duration; no
  validator/reference material is exposed.

## 3. How to run

```sh
docker compose up -d --build
# Web UI: http://127.0.0.1:3000/playgrounds/database-orm/lessons/DB-00-008
```

> Note on this machine: the Docker daemon could not reach any registry except the
> configured Iranian mirrors, so `mysql:8.4` was fetched once via the mirror and
> tagged locally (`docker pull focker.ir/library/mysql:8.4 && docker tag … mysql:8.4`).
> `docker-compose.yml` keeps the portable `mysql:8.4` name.

## 4. Exact test commands run

```sh
# Academy runner (real MySQL 8.4 + Django 6.1), 22 passed
docker compose run --rm academy-runner python -m pytest -q

# Static authoring validation
python academy-planning/scripts/validate_content.py
python academy-planning/scripts/generate_web_content.py

# Web
npm run typecheck        # (in web/)
npm run build            # 181 static pages, new /api/academy route
```

Runtime smoke through the BFF (`http://127.0.0.1:3000/api/academy/...`):
`/health` → `mysql:true`; `/v1/exercises` → both ids; SQL check valid → `passed:true`;
SQL hardcoded → `passed:false` (`data-driven:false`); ORM check valid → `passed:true`;
SQL syntax error → real MySQL 1064; ORM `FieldError` → `status:error` + traceback;
`/v1/exercises/{id}/reset` → `ok`; `/schema` → `utf8mb4` / `utf8mb4_0900_ai_ci`;
unknown exercise → 404.

**Runtime verified on real Docker/MySQL? YES** — MySQL **8.4.11**, Django **6.1.2**.

## 5. Tests intentionally skipped

- Legacy Django Playground pytest and the full monorepo suite (Academy-only
  change; shared runner contracts were not modified).
- Browser/E2E/screenshot automation (owner checks UI manually, per test policy).

## 6. Limitations / remaining items

- **Independent pedagogical review** of `DB-00-008` is the owner's step; the
  lesson is marked `approved` after real runtime verification of both exercises.
- ORM child is a controlled subprocess, **not a hostile-code sandbox** (explicitly
  allowed by the PRD); the anti-hardcode nonce is best-effort.
- Single-user model: submissions are serialized with an in-process lock; no
  multi-tenant isolation.
- Only one lesson / two exercises are executable by design; other authored
  exercises (FK sample) remain spec-only.
- Reset restores the exercise dataset only; it never touches legacy data
  (unreachable from the Academy network).
- Compose uses local-only internal credentials for the disposable lab.

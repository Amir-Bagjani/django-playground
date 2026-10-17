# PRD 02 — MySQL & Django ORM Lab + First Real Learning Slice

**Dependencies:** PRD-01. **Goal:** one complete concept, taught in Persian with real parallel SQL/ORM exercises, executes against MySQL 8.4 and Django 6.1 in isolated local environment.

## User stories
- I read a basic schema/query concept and write my own SQL, submit it, inspect real rows/error.
- I write the equivalent Django ORM code, see resulting DB values and receive a truthful result.
- I can recover after bad code without corrupting another exercise or the existing Django Playground.

## Scope and technical delivery
1. Add dedicated Academy backend boundary and internal MySQL 8.4 Compose service; no exposed host MySQL port, controlled user/schema isolation, persistent progress namespace separate from legacy example volume. Inspect existing repo before selecting process/service shape; keep minimal.
2. Use pinned compatible Django + MySQL driver and consistent `utf8mb4`, strict mode, timezone settings. Django connection isolation explicitly documented; do not assume InnoDB and Django share the same default isolation level.
3. SQL Editor (Monaco if already available) with Execute/Check; learner code actually runs in an isolated disposable schema for the current exercise, with timeout/row/size limits, real errors, no unrestricted system-schema access.
4. Django ORM Editor with starter code but no completed answer; controlled process executes Django query/model snippets against **same intended learning schema semantics** (fresh/reset for evaluation), shows actual result and error.
5. Result inspector: output table/JSON, execution status/duration (grounded), DB Schema preview; optional generated SQL from Django where trustworthy.
6. Implement exactly one **approved, full** beginner lesson chosen from DB-00/DB-01 (e.g. SELECT + first QuerySet): Persian content, SQL and ORM example, **two learner-written exercises**, rubric and basic deterministic real checks. The bundled ForeignKey draft is not a substitute for this first slice.
7. Minimal reset to known exercise dataset; no general-purpose terminal, arbitrary pip install, dynamically spawned dozens of DB containers, full query plan visualizer or ERD editor.

## Safety / isolation contract
- Allowlist active exercise schema and DB identity. User SQL may alter disposable schema if exercise allows; never expose MySQL admin privileges to user submission. Run as constrained execution account.
- Validate input length and task commands; SQL parsing alone is not a security guarantee. Backend timeout and kill/abort/cancel mechanisms where feasible.
- Submitted Python can be arbitrarily powerful *in its container*. No Docker socket, privileged mode, broad host mounts or production claims; file/time/resource restrictions and controlled subprocess args, not interpolated shell.
- Reset schema through controlled drop/recreate/reseed. MySQL DDL is not safely undone by generic `ROLLBACK`.
- Avoid cross-request learner state leakage; concurrent submissions serialized or isolated if single-user mode.

## API proposal (adapt to repo)
`POST /academy/v1/runtime/sql/execute` -> `runId`, `result`, `columns`, `rowCount`, `duration`, `error`; `POST /academy/v1/runtime/orm/execute` analogous; `POST /academy/v1/exercises/{id}/reset`. Public route takes exercise ID and learner source; **not** arbitrary schema/user DB credentials. Internal implementation must not return validator/reference files.

## User experience
Lesson content visible alongside code editor and Result/Feedback tabs. `Execute` may show raw result even if exercise not graded. `Check Solution` evaluates defined criteria. No pre-filled valid query. Language chrome English/LTR; instructional material/feedback Persian/RTL.

## Acceptance criteria / critical demo
1. SQL SELECT submission written by user returns actual MySQL sample rows; deliberate incorrect query returns real MySQL error.
2. Equivalent Django ORM submission reaches same seeded dataset behavior; traceback errors are not disguised as SQL pass/fail.
3. Evaluation correctly passes a real valid solution and rejects at least two invalid versions, including fixed/hardcoded response.
4. Reset restores dataset, not old Django user's DB or examples; raw SQL training tables cannot access old SQLite runner.
5. Academy Compose services start/stop without deleting volumes and no unrequested host port published.
6. Submitted work timeouts are labeled, not indefinitely spinning; DB/control failure is `system_error` not learner `failed`.

## Tests scoped ONLY to new module
- Real MySQL+ORM exercise smoke, two negative cases, reset and basic isolation; Typecheck for changed UI and build at PRD delivery.
- Do **not** run old Django Playground test suites unless shared existing runner/contracts were actually changed. No screenshots/browser automation.

## Deliverable
One genuinely usable first lesson, real execution pipeline, isolation documented, test evidence, limitations, commit; stop awaiting approval.

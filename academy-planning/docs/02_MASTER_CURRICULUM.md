# Master Curriculum — Database Design, MySQL & Django ORM

**Planning specification, not prewritten lessons.** Source of truth for order and stable IDs: `../curriculum/curriculum.yaml` (16 modules, 176 *planned* lessons). Topic completeness checklist: `../curriculum/concepts.yaml`. Concept→lesson audit: `../curriculum/coverage-map.csv` (207 topics).

## Scope and learning outcomes
At completion, learner should be able to: (1) reason about relational models, keys, functional dependencies and normalization; (2) design ERD from requirements and defend trade-offs; (3) write correct and performant MySQL queries, schema changes and transactions; (4) model and query the same domain through Django's Field/Model/QuerySet API; (5) diagnose database correctness and performance failures; (6) evolve an existing schema safely; (7) build, validate and critique complex multi-model domains such as booking and insurance claims.

## Teaching parity policy (SQL + ORM)
Each lesson with meaningful overlap shows SQL and Django interpretations side by side from the earliest chapters. **Avoid false equivalence:** not every MySQL command maps to a QuerySet method; backend versions change behavior. SQL-only topics remain SQL-only, and Django-only topics remain ORM-only. Cross-compare generated schema and queries rather than claiming they are identical.

Every lesson declares an optional `parity` field in `curriculum.yaml`:
- `equivalent` — the SQL and ORM forms express the same operation with a faithful 1:1 mapping (e.g. `WHERE`↔`filter`, `ORDER BY`↔`order_by`, `LIMIT`↔slicing, `GROUP BY`↔`aggregate`).
- `related` — overlapping surface but with backend-specific behavior, support or limits (e.g. default charset/collation, OOM/timezone nuances); compare, do not equate.
- `sql-only` — no meaningful ORM counterpart (e.g. GRANT/roles, replication, partitioning).
- `orm-only` — no meaningful SQL counterpart or a pure ORM API concept (e.g. lazy QuerySets, custom managers, abstract models).

**Delete semantics (Django 6.1):** `on_delete` now has database-level variants `DB_CASCADE`, `DB_SET_NULL` and `DB_SET_DEFAULT`. Teach explicitly that (a) DB variants avoid fetching related objects but `DB_CASCADE` does **not** send `pre_delete`/`post_delete` signals, (b) DB variants cannot be mixed with Python variants (except `DO_NOTHING`) in the same model or models related to each other, and (c) **`DB_SET_DEFAULT` is not supported on MySQL/MariaDB**. Lesson DB-03-009 owns the behavior; DB-07-011 owns the field/DDL mapping; `coverage-map.csv` records both.

## Framework version plan
- Current target: **Django `6.1.x`** (non-LTS; mainstream support ends April 2027) on **MySQL `8.4 LTS`**.
- All content, examples and runtime checks must match the released version actually installed — never an unreleased `main`/dev behaviour.
- **Re-evaluate on Django 6.2 LTS release (expected April 2027):** run a review pass (deprecations reachable via `RemovedInDjango2028Warning`, removed APIs, MySQL backend notes), then decide whether to migrate the `framework_targets` and re-verify affected lessons. No migration is performed before the official release.

## Learning module plan

### DB-00 — از داده تا مدل رابطه‌ای (10 lessons)
Motivation, DBMS vs files, relational algebra mental model, schemas vs instances, keys, NULL, SQL-vs-ORM, full request–ORM–database path, first SQL and QuerySet execution. Intro to reset/disposable training schema. **Hands-on:** learner writes first SELECT and ORM `filter`, predicts NULL comparison outcome. **Gate:** readback from real seeded DB, no one-click completed answer.

### DB-01 — جدول، انواع داده و اولین Model (12)
DDL, Django models, integer/string/decimal/float/date/time/JSON/UUID, defaults and nullability, primary keys, inserts, Instance lifecycle and migrations. **Depth:** precision, date-time timezone behavior, MySQL strict mode, field-vs-column distinctions. **Exercises:** write Product schema in SQL and ORM, test valid/invalid inserts and migration.

### DB-02 — خواندن، فیلتر و مدیریت داده (12)
SELECT projection/WHERE/joins later, AND/OR/Q, ordering, pagination, lookup operators, UPDATE/DELETE, F expressions, existence and QuerySet lazy evaluation. **Exercises:** derive and implement three independent queries from requirements; negative tests include wrong null and ordering edge cases.

### DB-03 — ERD و مدل‌سازی روابط (12)
Entity, key, cardinality, optionality, 1:1, 1:N, M:N through associative tables, recursion, delete semantics and reverse Django relations. ERD read-only lessons followed by user-driven design. **Exercises:** model Customer/Orders; Booking starts with relationships and invariants. **Critical:** ORM delete option vs DB FK action discrepancy explained with actual generated SQL.

### DB-04 — قیدها، یکپارچگی و نرمال‌سازی (12)
Referential integrity, UNIQUE/CHECK/composite constraints, candidate keys/functional dependencies, 1NF–5NF with BCNF, anomalies, reasonable denormalization and ORM/full_clean vs DB integrity. **Exercises:** decompose flawed invoice schema, observe anomaly, refactor; several correct normalized designs allowed where rubric applies.

### DB-05 — JOINها و دسترسی به داده مرتبط (10)
INNER/LEFT/RIGHT/CROSS/self join, join row multiplication, reverse traversals, `select_related`, `prefetch_related`, Prefetch to_attr, anti-join/EXISTS. **Exercises:** show N+1 and reduce query count with equivalence of result, validate across sparse/null relations.

### DB-06 — گزارش‌گیری و Analytics (11)
GROUP/HAVING, COUNT/SUM/AVG, conditional aggregates, annotate/values order, correlated subquery, Exists/OuterRef, CTE, window functions, set operations, financial reporting. **Exercises:** financial reports with duplicate join, null and interval boundaries.

### DB-07 — مرجع عمیق Django Model Fields (14)
A deliberate API reference: Field class overview, text, file, numbers, temporal, boolean, UUID, JSON, binary, relational classes, options, validators, custom fields, instance methods. **Mandatory:** for every listed Field/option in `concepts.yaml`, record supported MySQL storage, Django behavior, params, edge cases and exercises; if no meaningful MySQL counterpart, label it explicitly. **Exercises:** choose types for user profiles, prices, timestamps and relations; test storage/validation differences.

### DB-08 — Model Meta، Managers و QuerySet API (11)
Meta and indexes/constraints, abstract/proxy/multi-table inheritance, managers/custom QuerySets, iteration/evaluation, bulk operations, projections, raw, signals and side effects. **Exercises:** custom manager and query optimization with tested behavior; note known caveats of bulk write methods.

### DB-09 — Migration و تغییر تدریجی Schema (10)
Migration DAG, add/rename/drop fields, historical models, data migrations, SQL generation, integrity migrations, expand/contract, MySQL implicit DDL commit, fixture types, recovery. **Exercises:** change live-ish existing schema while preserving 100 seeded records; test failure/recovery.

### DB-10 — Index، EXPLAIN و بهینه‌سازی (12)
B-tree/composite/covering indexes, ordering/selectivity, EXPLAIN and actual plans, index misses, Django QuerySet.explain, N+1, pagination, full-text search (FULLTEXT index and `MATCH ... AGAINST`), realistic benchmarking. **Exercises:** optimize with fixtures large enough to produce measurable evidence, but protect CI resource budgets and make success robust against timing variance.

### DB-11 — Transactions، قفل و Concurrency (10)
ACID, MySQL transactions and locks, Django atomic/savepoint/on_commit, isolation/default differences, lost update, deadlocks, select_for_update, booking overlap. **Exercises:** two concurrent connections, verify final state; do not pretend SQLite concurrency exactly models InnoDB.

### DB-12 — MySQL حرفه‌ای و عملیات دیتابیس (13)
InnoDB basics, charset/collation, JSON/generated columns, `sql_mode` and strictness, views, stored routines and triggers, GRANT roles, backup/restore, replication concepts, partitioning considerations, monitoring and SQL injection prevention. **Exercises:** lab-safe users/roles, restore a dump into **training-only** DB, troubleshoot index behavior. Never grant learners unrestricted host DB privileges.

### DB-13 — طراحی پیشرفته و بازبینی معماری (11)
Requirements gathering, business rules, entity boundaries, audit/temporal data, multi-tenancy, monetary systems/idempotency, booking, inventory, design rubrics, architecture decisions and schema evolution. **Exercises:** multiple accepted ERDs, explicit uncovered criteria flagged for manual evaluation instead of fabricated correctness.

### DB-14 — پروژه‌های تخصصی چندمرحله‌ای (6 projects)
Blog/Comment, Library, E-commerce, Inventory, Booking and refactor/review. Projects have milestone requirements and stage-specific checkpoint. Assessment checks real constraints, preservation of data and explicit engineering trade-offs. Each project must reveal new requirements after previous milestones.

### DB-15 — Capstone: Insurance Claims & Policy Management (10 stages)
Insured/person/contract, policy coverages/limits, claim/documents, evaluation state transitions/history, payment ledger, concurrent and duplicate submission, evolving schema and performance reports. Final project scope intentionally teaches database/ORM engineering—not whole insurance operations. **No provided final design**, only domain brief, acceptance criteria, progressive feedback and review rubric.

## Required lesson-level deliverables
Every authored lesson (not just each module) requires: detailed Persian explanation (motivation, mental model, SQL/ORM mapping, code walkthrough, pitfalls), documented source references, self-written Practice + Problem Solving + Mastery challenges (optional advanced challenge may be attached as independent lesson-level mastery), at least one meaningful actual DB behavior check, progressive hints, criterion-based validator QA and independent review. A long reading-only lesson is insufficient.

## Exercise selection and learning time
- Lesson access is open even with missing prerequisites. UI can recommend prior lessons.
- `Practice`: isolated focused behavior. `Problem Solving`: combine this and prior concepts. `Mastery`: novel problem statement with less guidance, tests on new dataset and boundary cases.
- Completing all **required** exercises -> Completed; passing separate mastery -> Mastered. Hints do not disqualify completion; they may be tracked as an observation, never as a concealed punishment.
- Avoid fixed lesson durations as gates; suggested estimates are authoring metadata only.

## Cross-cutting coverage / matrix signoff
Before any module is approved: confirm `concepts.yaml` entries have a planned lesson ID and later an authored explanation, example, practice, validator and source. A planned topic appearing only in the checklist does **not** count as taught. Review outdated/deprecated API and MySQL-version caveats; do not invent support.

## Content batching strategy
1. Curriculum review/signoff (this document and `curriculum.yaml`).
2. Author and technically verify a **single representative fully functioning learning slice** from DB-00/01, including SQL+ORM+feedback.
3. Author a small chapter-sized pack only after template proven; each pack independent commit and QA report.
4. ERD-related units follow when ERD interaction is available; avoid pretending they are executable earlier.
5. Advanced topics (locking, execution plans, backup) require realistic environment and targeted resource-safe tests.

## Source hierarchy
1. Version-matched official docs of Django/MySQL + actual DB runtime measurements.
2. Reference books (not copied verbatim): *Database Design for Mere Mortals*, *Fundamentals of Database Systems*, supplement *Database System Concepts* when appropriate.
3. Technical papers/educational sources for normalization, cognitive load and worked examples.
4. User-created lesson prose/figures and datasets; citations in instructor metadata/reading list. See `08_CONTENT_QA_AND_SOURCES.md`.

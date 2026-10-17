# Curriculum Reconciliation Report

Date: 2026-10-17
Scope: apply the approved decisions from `reviews/00_CURRICULUM_REVIEW_REPORT.md` to the curriculum, coverage map, content spec, schemas, projects and validator. No PRD-01 work; no Academy/Runner implementation; no lesson authoring; no legacy Playground tests.

## Validation result (executed)

```
python scripts/validate_content.py
# WARN: coverage-map.csv: 28 topic(s) marked needs-manual-review (mapping is structural, not semantically auto-verifiable)
# STATIC VALIDATION PASSED: 16 modules, 176 planned lessons; 1 authored lesson(s) checked
python scripts/validate_content.py --lesson DB-03-005
# STATIC VALIDATION PASSED: 16 modules, 176 planned lessons; 1 authored lesson(s) checked (filtered)
python -m py_compile scripts/validate_content.py
# success
```

Run with the host venv (`PyYAML 6.0.3`, `jsonschema 4.26.0`) because the system Python lacks these packages. The validator remains a **structural** check; it does not execute MySQL/Django or judge pedagogy.

## Counts

| Item | Before | After |
|---|---|---|
| Modules | 16 | 16 |
| Planned lessons | 174 | **176** |
| Coverage topics | 173 | **207** |
| Topics flagged needs-manual-review | n/a | 28 |

Two new lessons (Q4): `DB-10-012` (full-text search, module DB-10) and `DB-12-013` (`sql_mode`, module DB-12). No existing lesson ID was changed or reordered; new IDs were appended at the end of their modules.

## Files changed

### Curriculum data
- `curriculum/curriculum.yaml` — added `parity` to all 176 lessons; expanded `DB-03-009` (Python-level vs DB-level delete behavior, signal behavior, no-mixing rule, MySQL limitation) and `DB-07-011` (`DB_*` actions, DDL mapping); appended `DB-10-012` and `DB-12-013`.
- `curriculum/concepts.yaml` — added the verified-missing topics; widened `target_modules` where a corrected owner lives in a different module (added `DB-03` to `mysql-84`, `DB-07`+`DB-11` to `django-query-reference`, `DB-11` to `django-schema-ops`).
- `curriculum/coverage-map.csv` — fully regenerated: all wrong owners corrected, added `secondary_lesson_ids` and `mapping_review` columns, 28 judgment-based rows flagged `needs-manual-review`.
- `curriculum/curriculum-summary.json` — DB-10 11→12, DB-12 12→13, total 174→176.

### Schemas
- `schemas/curriculum.schema.json` — optional `parity` enum (`equivalent|related|sql-only|orm-only`).
- `schemas/project.schema.json` — optional top-level `detail_level`, `domain`, `description_fa`; required per-milestone `checkpoint_id`; optional `depends_on` (earlier-milestone edges).

### Projects
- `projects/booking.json`, `projects/insurance.json` — preserved all existing milestones/criteria; added `detail_level: blueprint`, `domain`, `description_fa`, per-milestone `checkpoint_id` and `depends_on` edges.
- `projects/blog.json`, `projects/library.json`, `projects/ecommerce.json`, `projects/inventory.json` — new minimal `metadata-only` contracts (stage sequence + dependency edges + checkpoint ids + one acceptance line per stage). No full project content.
- `projects/README.md` — documents detail levels and the dependency/checkpoint contract.

### Validator and docs
- `scripts/validate_content.py` — coverage checks now enforce primary-lesson existence **and** module ∈ coverage-group `target_modules`; validate secondary cross-references, the `mapping_review` enum and report the manual-review count; project checks enforce unique `checkpoint_id` and that `depends_on` points to existing **earlier** milestones.
- `docs/02_MASTER_CURRICULUM.md` — 174→176; expanded parity policy + `parity` field semantics + delete-semantics note; new "Framework version plan" (6.1.x now, 6.2 LTS re-evaluation); DB-10 11→12, DB-12 12→13.
- `docs/03_CONTENT_SPEC.md` — coverage-map column contract and parity field contract.
- `docs/01_DECISIONS_AND_OPEN_ASSUMPTIONS.md` — new binding decision **D18** (6.1.x target + 6.2 LTS migration plan); A07 revisit condition updated.
- `docs/09_DELIVERY_ROADMAP.md`, `docs/10_COVERAGE_AUDIT_AND_BATCHES.md`, `docs/prds/PRD-06_CONTENT_PACKS_CAPSTONES.md`, `README.md`, `AGENTS.md` (package + repo root) — count/version references updated.
- `VALIDATION_REPORT.md` — refreshed executed output and validation scope.
- `content-samples/foreign-key-relationships/lesson.fa.md` — corrected the draft (`DB-03-005`) delete-semantics text to state the Django 6.1 DB-level `on_delete` variants, the no-mixing rule and the MySQL `DB_SET_DEFAULT` limitation.

## Content errors fixed

- **Coverage mis-targeting (Q3).** The previous map pointed ~30 rows at lessons that do not teach the topic (e.g. `aggregate`→DB-06-005 instead of DB-06-001, `Window`→DB-06-006 instead of DB-06-009, `abstract models`→DB-08-001 instead of DB-08-003, `1NF`→DB-04-001 instead of DB-04-005, `InnoDB`→DB-11-004 instead of DB-12-001). All owners are now corrected and structurally checked.
- **Target-module gaps.** Some correct owners live outside the group's original `target_modules` (e.g. `foreign keys` in DB-03, `select_for_update` in DB-11); the module lists were widened instead of forcing a wrong owner.
- **Delete semantics (Q2).** `DB-03-009` now covers Python-level vs DB-level behavior; `DB-07-011` covers the field/DDL mapping; the sample lesson and parity policy no longer imply that `on_delete` never maps to a DB action.
- **Newly-verified Django 6.1 / MySQL topics (Q4 + findings).** Added concepts and mapped owners for `GeneratedField`, `CompositePrimaryKey`, `db_comment`, `db_collation`, `DB_CASCADE`, `DB_SET_NULL`, `DB_SET_DEFAULT`, fetch modes/`fetch_mode`, `Case`/`When`, `Coalesce`/`Cast`, `JSONNull`, `UUID4`/`UUID7`, `totally_ordered`, `reverse`/`latest`/`earliest`/`times`, plus MySQL `fulltext`, `sql_mode`, `generated columns`, functional/descending/invisible/multi-valued indexes, `lateral`, isolation modes, `EXPLAIN FORMAT`, `AUTO_INCREMENT`, and surrogate/natural keys.

## Sources verified (official docs)

- Django 6.1 release notes / field reference / fetch modes / transactions: DB-level `on_delete` variants added in 6.1; `DB_CASCADE` skips `pre_delete`/`post_delete`; DB variants cannot be mixed with Python variants except `DO_NOTHING`; **`DB_SET_DEFAULT` is not supported on MySQL/MariaDB**; `select_related()` no-arg and `values_list(flat=True)`-without-field deprecated; `savepoint()`→`savepoint_create()`; `JSONNull` new; MySQL backend defaults to `READ COMMITTED`; `DATETIME(6)` needed for fractional seconds; `utf8mb4_0900_ai_ci`; mysqlclient 2.2.1+.
- Django 6.1 calendar versioning: non-LTS, mainstream support ends April 2027 (`RemovedInDjango2028Warning`).

## Items still needing review (transparent)

1. **28 `needs-manual-review` coverage rows** — the owning lesson is a judgment call (e.g. `Coalesce`/`Cast`→DB-06-004, `GeneratedField`→DB-07-012, `MVCC`→DB-11-004). Confirm during lesson authoring.
2. **MySQL 8.4-only removed/disabled-feature claims** could not be fetched here (`dev.mysql.com` returns HTTP 403 to the fetch tool); any such claim remains to-confirm on a live 8.4 instance and was not asserted in curriculum text.
3. **`parity` values are a first-pass assignment.** The 8 `equivalent` labels in particular should be spot-checked when the corresponding lesson is authored, since the parity policy warns against false equivalence.
4. **The draft sample lesson** (`DB-03-005`, status `draft`) is still not a published lesson and its exercises are specification-only.
5. **`FILE_MANIFEST.json`** was regenerated to match the current file set; it is a snapshot, not a validated contract.

## Readiness for PRD-01

The curriculum contract is internally consistent: validator passes, IDs are stable, coverage ownership is structurally enforced, projects carry PRD-05-compatible dependencies/checkpoints, and the version plan is explicit. On that basis the curriculum is **ready to proceed to PRD-01**, with the five review items above tracked but non-blocking for a read-only content loader. **Awaiting product-owner approval before starting PRD-01.**

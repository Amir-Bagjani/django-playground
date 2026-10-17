# Agent Task 00 — Curriculum Review Report

**Deliverable for:** `handoffs/00_CURRICULUM_REVIEW_PROMPT.md`
**Reviewer:** curriculum-architect agent (offline)
**Date:** 2026-10-17
**Scope:** review and lock the master curriculum only. No PRD, no app code, no Docker, no legacy tests.
**Verdict:** the plan is coherent and teachable, but it is **not yet lockable unchanged**. It contains (a) one high-impact Django 6.1 semantic change that contradicts the current teaching-parity wording, (b) several verified Django 6.1 API additions/deprecations, (c) roughly 30 mis-targeted rows in `coverage-map.csv`, and (d) a real checklist gap around MySQL-specific field/storage behavior. All are fixable with ID-preserving edits plus a small number of proposed new lessons. **No file was modified in this pass** — revisions are proposed below and gated on product-owner approval, because several would change the authoritative lesson set/count and stable IDs.

---

## 0. What was actually executed (exact evidence)

```
# host lacks PyYAML/jsonschema, so a throwaway venv was used for the validator only
python3 -m venv <tmp>/academy-venv && <tmp>/academy-venv/bin/pip install PyYAML jsonschema
# PyYAML 6.0.3, jsonschema 4.26.0

manet@academy-planning $ <tmp>/academy-venv/bin/python scripts/validate_content.py
STATIC VALIDATION PASSED: 16 modules, 174 planned lessons; 1 authored lesson(s) checked
NOTE: this does NOT test pedagogical quality or execute Django/MySQL exercise validators.
exit=0
```

Official documentation fetched successfully this session:

- Django 6.1 release notes — https://docs.djangoproject.com/en/6.1/releases/6.1/ (release date **August 5, 2026**)
- Django 6.1 database notes — https://docs.djangoproject.com/en/6.1/ref/databases/

**Blocked source (exact repro, disclosed per repo rule #11):** every `https://dev.mysql.com/doc/refman/8.4/...` URL returned `HTTP 403` to this environment's fetcher (`mysql-nutshell.html`, `what-is-new.html`, `upgrading-from-previous-series.html`, `doc/relnotes/mysql/8.4/...`). MySQL 8.4-specific statements below are therefore split into:
- **verified-by-Django** (facts the Django 6.1 docs assert about the MySQL backend), and
- **to-confirm** (well-established 8.4 release facts cited to the official URL but **not machine-verified here** — the content author must confirm them on a live 8.4 instance before authoring DB-12). I have not fabricated any citation.

---

## 1. Version caveats (highest priority)

### 1.1 Verified from Django 6.1 (affects lesson content now)

| # | Fact (source: Django 6.1 release notes / databases ref) | Curriculum impact |
|---|---|---|
| V1 | **`ForeignKey.on_delete` gains database-level actions: `DB_CASCADE`, `DB_SET_NULL`, `DB_SET_DEFAULT`**, compiled to real SQL `ON DELETE`. `DB_CASCADE` does **not** fire `pre_delete`/`post_delete`. | **Contradicts** the current parity wording in `docs/02_MASTER_CURRICULUM.md` ("Django `on_delete` behavior is not a direct declaration of database `ON DELETE`") and lesson **DB-03-009**. Must be updated: there are now *both* Python-level and DB-level actions, and a good lesson contrasts them. |
| V2 | **Model field fetch modes** (new): `FETCH_ONE` (default), `FETCH_PEERS`, `FETCH_RAISE`; `QuerySet.fetch_mode()`; `django.core.exceptions.FieldFetchBlocked`. | Touches **DB-05-006/007** (N+1), **DB-08-007**, **DB-10-009**. `FETCH_PEERS` is a new alternative to `prefetch_related` and belongs in the N+1 lesson. Not in `concepts.yaml`. |
| V3 | **`select_related()` with no arguments is deprecated in 6.1.** | **DB-05-006**, **DB-10-009** and Field/QuerySet reference must teach the explicit-fields form and mark the no-arg form as deprecated. |
| V4 | **`QuerySet.values_list(flat=True)` without a field name is deprecated in 6.1.** | **DB-02-001** (`values_list`). |
| V5 | **`transaction.savepoint()` is deprecated in favor of `savepoint_create()`** (6.1). | **DB-11-003** (savepoints). Also `on_commit`: `concepts.yaml` maps `on_commit` to **DB-11-003** but the curriculum teaches it in **DB-11-010** — mapping error (see §4). |
| V6 | **New `JSONNull` expression (6.1)**; using `None` for a top-level JSON scalar `null` is deprecated. | **DB-07-007** (JSONField) and **DB-00-009** (NULL semantics): must distinguish SQL `NULL` vs JSON `null` and cover `JSONNull`. Not in `concepts.yaml`. |
| V7 | New DB functions **`UUID4`, `UUID7`**; new **`QuerySet.totally_ordered`** property; **`BitAnd`/`BitOr`/`BitXor`** now generally available aggregates (moved out of `contrib.postgres`). | Optional depth for **DB-07-007**, **DB-02-004**, **DB-06-003**. Add to checklist as minor tokens. |
| V8 | **Calendar versioning**: next releases are Django **2028/2029**, not 7.0/7.1; warning classes renamed `RemovedInDjango70Warning` → `RemovedInDjango2028Warning`. | No lesson content, but a **version-impact note**: the pinned target `6.1` is a short-lived release (mainstream support ends **April 2027**). See blocking question Q1. |
| V9 | **Django 6.1 supports MySQL 8.4+ only** (dropped MySQL < 8.4). | **Confirms the MySQL 8.4 target choice** is the right pin for Django 6.1. Any 8.0-only material must be annotated. |

### 1.2 Verified from Django 6.1 *MySQL backend* notes (validation of SQL/ORM claims)

| # | Fact (source: Django 6.1 `ref/databases`, MySQL section) | Curriculum impact |
|---|---|---|
| V10 | **Isolation default:** "Django works best with and **defaults to read committed** rather than MySQL's default, repeatable read. Data loss is possible with repeatable read" (cites `get_or_create()` `IntegrityError` then missing `get()`). | **DB-11-004/005** must state the asymmetry precisely: *MySQL server default = REPEATABLE READ; Django's MySQL connection default = READ COMMITTED*. The lesson title exists; the content requirement must be explicit. `concepts.yaml` has no `read committed`/`repeatable read` token. |
| V11 | **`select_for_update()` on MySQL**: `NOWAIT`/`SKIP LOCKED` supported; `OF` supported; **`NO KEY` unsupported** (raises `NotSupportedError`). Without filtering on unique/indexed fields, **an exclusive lock is taken over the whole table**. | **DB-11-006** — concrete, testable behavior; must be an explicit criterion, not just narrative. |
| V12 | **`CharField`/`SlugField` with `unique=True` may be limited to 255 chars; `TextField` cannot be `unique=True`** ("BLOB/TEXT … without a key length"). | **DB-07-002/009**, **DB-04-003**. A real MySQL↔Django divergence that the checklist does not capture. |
| V13 | **Fractional seconds** need `DATETIME(6)`; **Django will not upgrade existing columns**; must `ALTER … MODIFY`/`RunSQL`. | **DB-01-006**, **DB-07-006**, **DB-09-004**. Gap. |
| V14 | Default MySQL collation with UTF-8 is **`utf8mb4_0900_ai_ci`** (case-insensitive equality; unique collisions `"aa"`/`"AA"`); `db_collation` applies to `CharField`/`TextField`. | Validates **DB-12-002**; must be a testable criterion. |
| V15 | **InnoDB `AUTO_INCREMENT` counter is recreated as `max(id)+1` after restart**, so `AutoField` values can be reused. | **DB-01-010/011**, **DB-08**, **DB-12-001**. Nice, verifiable caveat; not in checklist. |
| V16 | **mysqlclient 2.2.1+** required; MySQL Connector/Python may lag new Django releases. | **DB-00-007** (stack lesson) and tech notes. |
| V17 | MySQL automatic string↔int typecasting (`'abc'` matches `WHERE col = 0`); Django casts string fields to string. | **DB-02-002**, **DB-08-010 (`raw`)** — a strong "why the ORM casts" exercise. |

### 1.3 MySQL 8.4 facts — **to-confirm** against official docs / live 8.4 (fetcher blocked)

Cited to https://dev.mysql.com/doc/refman/8.4/en/ ; **not machine-verified in this session**:

- MySQL **8.4 is an LTS** release; `mysql_native_password` is **disabled by default** (in 9.x removed) — affects **DB-12-007** privilege/auth exercises and any CREATE USER script.
- `mysqlpump` and `mysql_upgrade` utilities **removed** in 8.4 — affects **DB-12-008** backup/restore command choices.
- Client `--ssl`/`--ssl-verify-server-cert` style options superseded — matters only if DB-12 scripts hard-code them.
- `EXPLAIN ANALYZE` (8.0.18+), CTEs and window functions (8.0+), `INTERSECT`/`EXCEPT` (8.0.31+), `LATERAL` (8.0.14+), functional indexes (8.0.13+), multi-valued JSON indexes (8.0.17+), descending/invisible indexes (8.0+) are all present in 8.4 — the plan's DB-06/DB-10/DB-12 lessons can rely on them, but the content still needs version-pinned verification at authoring time.

---

## 2. Django Field / option coverage audit (vs `concepts.yaml` `django-field-reference`)

Present and correct: the Auto/Integer families, `CharField`, `TextField`, `SlugField`, `EmailField`, `URLField`, `GenericIPAddressField`, `BooleanField`, `DecimalField`, `FloatField`, `DateField`, `DateTimeField`, `TimeField`, `DurationField`, `UUIDField`, `JSONField`, `BinaryField`, `FileField`, `ImageField`, `FilePathField`, `ForeignKey`, `OneToOneField`, `ManyToManyField`, `custom Field`; options `null`, `blank`, `default`, `db_default`, `unique`, `db_index`, `db_column`, `primary_key`, `editable`, `choices`, `validators`, `help_text`, `verbose_name`, `error_messages`, `db_constraint`, `related_name`, `related_query_name`, `limit_choices_to`, `to_field`, `on_delete`, `symmetrical`, `through`, `through_fields`, `db_tablespace`, `unique_for_date/month/year`.

**Missing (verified, all additive — no ID change required):**

1. `GeneratedField` (Django 5.0+; MySQL stored/virtual generated columns) — absent. Should pair with DB-07 and **DB-12-003** ("Generated Columns" already in that lesson title but no checklist token).
2. `CompositePrimaryKey` (Django 5.2+) — absent. Belongs with **DB-03-011** (natural/surrogate/composite keys) and **DB-04-003** (composite uniqueness). This is the largest single API omission for a "complete field reference".
3. `Field.db_comment` (4.2+) and `Field.db_collation` (MySQL collation per column, relevant to V14) — absent.
4. `FileField` storage concerns: `storage`, `upload_to`, `MEDIA_ROOT`, and `ImageField` requiring Pillow — only names are present, no depth tokens.
5. `DurationField` MySQL storage (bigint microseconds) — absent detail.
6. `on_delete` DB-level constants `DB_CASCADE`/`DB_SET_NULL`/`DB_SET_DEFAULT` (**V1**) — absent.
7. `choices` named groups / `TextChoices` groups (6.1 admin optgroup note) — minor.
8. `DatabaseDefault` / `_is_pk_set` behavior change (6.1) — minor.

**Overlap to manage (not delete):** DB-01-005 vs DB-07-005 (Decimal/Float), DB-03-005 vs DB-07-011 (relationships), DB-08-007 vs DB-02 (filter/get/first/last/iterator). Per D06 these are "intro vs reference", but the authoring spec must cross-link and ensure the reference lessons use *new* exercises, not repeats.

---

## 3. Django QuerySet / Meta / migration coverage audit

**Missing QuerySet tokens (additive):** `reverse`, `latest`/`earliest`, `times`, `fetch_mode` (**V2**), and the expression set `Case`/`When`, `Coalesce`, `Cast`, `ExpressionWrapper`, `Func`, `Collate`, `NullIf`, `JSONNull` (**V6**). `Case`/`When` currently exist only implicitly via DB-06-004 ("CASE، FILTER و Conditional Aggregates") with no checklist token — a checklist gap for an "exhaustive plan".

**Mis-scoped (present but thin):** `alias`, `using`, `in_bulk`, `none`, `dates`/`datetimes` exist as tokens; `in_bulk` after `values()`/`values_list()` is now chainable (6.1) — minor.

**Meta options:** `constraints`/`indexes`/`ordering`, `db_table`, `verbose_name`, abstract/proxy/multi-table, managers, custom QuerySet are covered. Missing tokens: `Index(fields=…, include=…, condition=…)` sub-options, `UniqueConstraint(condition=…)` already present as "conditional UniqueConstraint", `Meta.managed`, `Meta.get_latest_by`, `Meta.default_manager_name`. Niche; recommend listing but low priority.

**Migrations:** DAG/dependencies, add/rename/remove, RunPython/RunSQL, `sqlmigrate`, historical models, backfill, expand/contract, implicit DDL commit, rollback/forward-fix, fixtures — all present. Missing: `SeparateDatabaseAndState`, `RunSQL` reverse, and **V13** (adding fractional-second columns on existing data). Recommend adding as depth, not new lessons.

---

## 4. `coverage-map.csv` accuracy audit (the mapping is a real problem)

`validate_content.py` only asserts that `primary_lesson_id` **exists**, so semantically wrong owners pass silently. ~30 of 174 rows point at a lesson that does not teach the topic. This defeats the "coverage verification" gate in `docs/10`. Representative errors (topic → current owner → correct owner):

| coverage_group | topic | current | should be |
|---|---|---|---|
| mysql-84 | joins | DB-06-008 (CTE) | DB-05-001 |
| mysql-84 | subqueries | DB-06-008 | DB-06-006 |
| mysql-84 | indexes | DB-10-005 (EXPLAIN) | DB-10-001 |
| mysql-84 | TCL | DB-01-001 (CREATE TABLE) | DB-11-002 |
| mysql-84 | foreign keys | DB-01-001 | DB-03-005 |
| mysql-84 | constraints | DB-01-001 | DB-04-002 |
| mysql-84 | triggers | DB-12-004 (View) | DB-12-006 |
| mysql-84 | stored routines | DB-12-004 | DB-12-005 |
| mysql-84 | JSON | DB-12-002 (charset) | DB-12-003 / DB-01-008 |
| mysql-84 | deadlocks | DB-11-004 | DB-11-008 |
| mysql-84 | implicit DDL commits | DB-11-004 | DB-09-008 |
| mysql-84 | ACID | DB-11-004 | DB-11-001 |
| mysql-84 | replication | DB-12-008 (backups) | DB-12-009 |
| mysql-84 | partitioning | DB-12-008 | DB-12-010 |
| mysql-84 | roles / privileges | DB-12-008 | DB-12-007 |
| mysql-84 | performance schema | DB-12-008 | DB-12-011 |
| django-schema-ops | abstract/proxy models | DB-08-001 (Meta) | DB-08-003 |
| django-schema-ops | multi-table inheritance | DB-08-001 | DB-08-004 |
| django-schema-ops | custom QuerySet | DB-08-005 (Manager) | DB-08-006 |
| django-schema-ops | RunPython | DB-09-004 (sqlmigrate) | DB-09-003 |
| django-schema-ops | migration dependencies | DB-09-004 | DB-09-001 |
| django-schema-ops | backfill | DB-09-004 | DB-09-007 |
| django-schema-ops | on_commit | DB-11-003 (atomic) | DB-11-010 |
| django-query-reference | exists | DB-06-006 | DB-06-007 |
| django-query-reference | order_by | DB-02-001 | DB-02-004 |
| django-query-reference | distinct | DB-02-001 | DB-02-011 |
| django-query-reference | count | DB-02-001 | DB-02-010 |
| django-query-reference | iterator | DB-05-007 (prefetch) | DB-08-007 |
| django-query-reference | aggregate | DB-06-005 (annotate) | DB-06-001 |
| data-modeling | 1NF…5NF, candidate keys, functional deps | all DB-04-004 | DB-04-005…009 |
| data-modeling | cardinality | DB-03-001 | DB-03-002 |
| data-modeling | optionality | DB-03-001 | DB-03-003 |

`docs/10` calls the map "coarse *primary ownership*", which permits a module-level anchor — but `joins → CTE`, `TCL → CREATE TABLE`, `triggers → View` are not coarse, they are wrong. **Recommendation:** correct the rows, keep every lesson ID unchanged, and add a `secondary_lesson_ids` column to preserve the "coarse ownership" idea without lying about the primary owner.

---

## 5. MySQL topic coverage audit

Present: InnoDB, data types, charset/collation, DDL/DML/TCL, constraints, FK, joins, subqueries, CTE, window functions, views, triggers, stored routines, JSON, indexes, EXPLAIN/EXPLAIN ANALYZE, ACID, isolation, MVCC, locking, deadlocks, implicit DDL commits, backups, replication, partitioning, roles, privileges, SQL-injection prevention, performance schema.

**Missing tokens worth adding (all map to existing lessons except a possible new SQL-only lesson):**
- **Full-text search** (`FULLTEXT`, `MATCH … AGAINST`, Django `search` lookup) — entirely absent; a mainstream MySQL feature. No natural lesson; candidate new lesson or fold into DB-10.
- **`sql_mode` / `STRICT_TRANS_TABLES` / `ONLY_FULL_GROUP_BY`** — central to why GROUP BY queries fail and why truncation errors occur; referenced by Django docs but absent from the checklist. Fits DB-01 and DB-06.
- **Generated columns** (DB-12-003 title has it, no token) and **functional / multi-valued / descending / invisible indexes** (DB-10).
- **`AUTO_INCREMENT` behavior** (**V15**), **`explicit_defaults_for_timestamp`**, **`utf8mb4` default** (token exists as character set).
- **`EXPLAIN FORMAT=JSON/TREE`** and **`performance_schema`** usage (present as a name only).
- **`LATERAL`** derived tables (8.0.14+), usable in DB-06.

---

## 6. Normalization & ERD coverage audit

1NF→5NF/BCNF, anomalies, denormalization, candidate keys, functional dependencies, ER/EER, crow's foot, cardinality, optionality, weak/associative entities, business rules, audit/temporal, multi-tenancy, design trade-offs, review rubrics are all represented across DB-03/04/13. **Two notes:**
- The checklist collapses 1NF–5NF into `DB-04-004`, while the curriculum correctly splits them into DB-04-005…009. Fix in the map (see §4).
- **Surrogate vs natural keys** exists as DB-03-011 but has no checklist token; add `surrogate key`/`natural key`.

---

## 7. Projects & exercise-genuineness audit

- `booking.json` (8 milestones) and `insurance.json` (10 milestones) are genuinely progressive: requirements → ERD → schema → models → rules → concurrency → evolution → performance/review, and they align with DB-14/DB-15. Good.
- **Gap:** DB-14 names Blog/Comment, Library, E-commerce, Inventory, **Booking**, and refactor/review, but `projects/` contains JSON only for `booking` and `insurance`. Either the other four are *lesson-only* guided projects (fine) or the artifacts are missing — clarify in `projects/README.md`.
- **Gap for PRD-05:** milestone objects carry no dependencies/blocking edges, checkpoint IDs, or snapshot policy fields (`project.schema.json` is minimal). Checkpoints cannot be derived from the current data.
- **Genuineness (sample):** `content-samples/foreign-key-relationships` is correct in spirit — starter contains a `TODO` and an unrelated pre-written `Customer` model, the answer is absent, and `validators/validation-plan.md` is explicitly a **specification only**. This respects "learner writes the solution" and "no fabricated pass". The lesson carries `status: draft` and correct 6.1/8.4 reference URLs.
- **Note:** lesson DB-03-005 currently teaches "Django `on_delete` ≠ DB `ON DELETE`". After **V1**, that lesson's content must be rewritten so it teaches *both* Python-level and DB-level actions correctly; the draft will otherwise be factually outdated on the target version.

---

## 8. Can MySQL and Django ORM be taught in parallel? (explicit answer)

**Yes — with labeled exceptions, and the plan already contains the right policy.** `docs/02` "Teaching parity policy" states SQL-only/ORM-only topics stay single-track and that comparisons must be generated-schema-based, not asserted. That is the correct approach. Two improvements:

1. **Encode parity in the machine data.** `tracks` (mysql/django-orm/erd) does not distinguish "this topic has no counterpart" from "this topic spans both". Recommend an optional per-lesson field, e.g. `parity: full | sql-only | orm-only`, so the audit can detect false equivalence mechanically. This is additive to `curriculum.schema.json` and does not change IDs.
2. **Fix the specific non-1:1 claims** identified above so the "avoid false equivalence" rule is not itself out of date: V1 (on_delete now *has* DB-level actions), V12 (unique/length), V13 (fractional seconds), V14 (collation uniqueness), V17 (typecasting), and the Oracle-only JSON negative-index caveat (already handled by "note version/backend" policy).

No pairing in the plan is technically impossible on Django 6.1 + MySQL 8.4. Entity-first ERD *before* SQL is sound. The only ordering risk is that DB-04 decomposition exercises may want joins, which arrive in DB-05 — solvable with a scoped join demo in DB-04.

---

## 9. Redundancy & ordering summary

- Ordering foundations → schema → query → ERD → integrity → joins → analytics → field reference → Meta/managers → migrations → index → concurrency → MySQL ops → advanced design → projects → capstone is sound.
- Repetition is mostly intentional (intro vs reference) but needs explicit cross-links so exercises differ: DB-01-005/DB-07-005, DB-03-005/DB-07-011, DB-02/DB-08-007, DB-05-006/DB-10-009.
- DB-07 (14 lessons) is the largest module and a reference; keep it, but the authoring plan must guarantee "dedicated option examples rather than generic catalog" (already stated in `docs/10`).
- DB-06-008 is overloaded as the MySQL owner for joins/subqueries/CTE/window in the coverage map — a mapping artifact, not a lesson problem.

---

## 10. Proposed changes (ready to apply; **not applied** — awaiting approval)

### 10.1 ID-preserving (safe)
1. **`docs/02_MASTER_CURRICULUM.md`** — update the parity paragraph and DB-03-009/DB-07-011 descriptions for **V1**; add a "Django 6.1 / MySQL 8.4 version notes" subsection listing V2–V7, V10–V17.
2. **`concepts.yaml`** — add the tokens in §2, §3, §5, §6; add `read committed`/`repeatable read`, `fulltext search`, `sql_mode`, `generated columns`, `surrogate key`/`natural key`.
3. **`coverage-map.csv`** — apply the §4 corrections and add rows for every new token; optionally add `secondary_lesson_ids`.
4. **`schemas/curriculum.schema.json`** — optional additive `parity` field; requires all existing lessons to keep validating (default when absent).
5. **`projects/README.md`** — state which guided projects are lesson-only vs JSON-backed.

### 10.2 Structural (needs new stable IDs → approval required)
6. **New lesson for DB-level FK actions.** Options: (a) extend **DB-03-009** and **DB-07-011** in place, or (b) split a new lesson `DB-03-013` "Python-level vs database-level `on_delete`". Recommend **option (b)** for depth, but it changes the module count.
7. **New lesson or fold for full-text search** (DB-10 or a new DB-12 lesson) — option to be decided by owner.
8. **New token-only coverage for `GeneratedField`/`CompositePrimaryKey`** — recommend extending existing DB-07 lessons rather than new IDs.
9. **Milestone dependencies/checkpoint fields** for PRD-05 — out of scope here; note for PRD-05.

Any of 6–7 changes 174 → 175+, so the `README`/`02`/`10`/`curriculum-summary.json` counts must be updated in the same commit and re-validated.

---

## 11. Sources

Primary (fetched this session):
- Django 6.1 release notes — https://docs.djangoproject.com/en/6.1/releases/6.1/
- Django 6.1 databases reference (MySQL/InnoDB/isolation/collation/select_for_update) — https://docs.djangoproject.com/en/6.1/ref/databases/

Cited, not machine-fetched (403 to this environment; confirm at authoring time):
- MySQL 8.4 Reference Manual — https://dev.mysql.com/doc/refman/8.4/en/
- MySQL 8.4 implicit commits — https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html
- MySQL 8.4 InnoDB isolation — https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html
- MySQL 8.4 InnoDB locking — https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-transaction-model.html
- Django 6.1 model fields / QuerySet / model options / migrations (for the added tokens) — https://docs.djangoproject.com/en/6.1/ref/models/fields/ , …/querysets/ , …/options/ , …/topics/migrations/

---

## 12. Blocking questions (need product-owner decision before edits/PRD-01)

- **Q1 — Version pin.** Keep **Django 6.1** (current, but non-LTS: mainstream support ends 2027-04, extended 2027-12) or move the target to **6.2 LTS** when released, or pin 6.1 now with a scheduled re-verification? This affects every version-matched claim.
- **Q2 — DB-level `on_delete` (V1).** Extend existing lessons **DB-03-009** + **DB-07-011** (no count change), or add a new lesson (174 → 175)? 
- **Q3 — `coverage-map.csv` contract.** May `primary_lesson_id` point at the exact teaching lesson for every token (I will correct the ~30 wrong rows), with a new optional `secondary_lesson_ids` for cross-references? Or must the map remain intentionally coarse?
- **Q4 — Missing topics with no natural home** (full-text search; possibly `sql_mode`): fold into existing lessons or allocate new stable IDs (and update counts)?

**Not blocking:** MySQL 8.4-only removed-feature details (§1.3) — these are confirmed at authoring time on a live instance, not during this review.

---

## 13. Declaration

No PRD, runner, UI, Docker, database, or legacy-test action was taken. No authoritative planning file was modified. The only artifact produced is this report. The static validator passes on the current, unmodified package (exact output in §0). Awaiting product-owner approval before applying any revision or starting PRD-01.

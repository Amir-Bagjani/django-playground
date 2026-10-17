# PRD-06 delivery report — First Content Pack (DB-00-001..003)

Scope: `academy-planning/docs/prds/PRD-06_CONTENT_PACKS_CAPSTONES.md`.
This is Content Pack 1 of the DB-00 chapter only. Per the owner directive, the
pack covers **DB-00-001, DB-00-002, DB-00-003** and then **stops for review**.
Nothing beyond chapter DB-00 is authored. No new assessment infrastructure is
built. **Commit:** `this delivery's commit (hash in the delivery message).`

## What was authored

Three lessons in curriculum order, each with a full Persian lesson file and three
graded exercises (Practice → Problem Solving → Mastery):

| Lesson | Slug / curriculum id | Exercises |
|---|---|---|
| DB-00-001 | `data-vs-information` | `db00-001-identify-entity` (erd), `db00-001-separate-data-info` (combined), `db00-001-mastery-scenario` (erd) |
| DB-00-002 | `files-vs-dbms` | `db00-002-analyze-file` (combined), `db00-002-map-guarantee` (combined), `db00-002-mastery-files-vs-dbms` (combined) |
| DB-00-003 | `relational-model` | `db00-003-model-relation` (erd), `db00-003-domain-rules` (combined), `db00-003-mastery-relation` (erd) |

Each lesson directory has `lesson.fa.md`, `exercises/<id>/` (exercise.json +
instructions + starter, `answers.md` for written work, `example.erd.json` where a
worked ERD specimen is useful) and `validators/validation-plan.md`.

**Status:** every lesson is `status: in-review`, every exercise is
`required_for_completion: false`. `curriculum.yaml` keeps these lesson ids
`planned` (release gate is unchanged; matches the DB-03-002 specimen precedent).

## Runnable vs authored-only (honest scope)

None of the 9 exercises is declared in the runner (`app/exercises.py` `DECLARED`
/ `app/erd_checks.py` `TASKS`), so **none is executable or auto-graded today**.
They are authored-only specimens. The conceptual skills (domain justification,
failure→guarantee mapping, entity-vs-attribute reasoning) are written answers and
cannot be reliably auto-graded; no artificial SQL/ORM task was invented to force
them into an engine (per directive). Each `validation-plan.md` documents this and
proposes the smallest mechanism.

**Engine finding (documented, not implemented):** `checks.build_payload` computes
`passed = bool(auto_checks) and all(...)`. An all-manual-criteria exercise yields
an empty `auto_checks`, which the current code would surface as `validation_failed`
rather than "awaiting review". Proposed minimal fix (needs owner approval): a new
`kind: "written"` where every criterion is `evaluation: "manual"` → the result is
`needs_manual_review`, never auto-`passed`/`failed`. No engine change is made here.

## Independent reviews and resolutions

Two independent reviews were run (technical + pedagogical); both returned
`changes-required`. All findings were addressed:

**Technical**
- BLOCKER: `relational-model/lesson.fa.md` objective "map to SQL **and Django
  Model**" had no exercise criterion → objective narrowed to "map to a SQL table
  and *explain* the Django mapping (introductory)"; the written mapping is now
  covered by the manual `design-decisions` criterion.
- MINOR: InnoDB reference pointed at `innodb-transaction-model.html` → corrected to
  the source-listed `innodb-locking-transaction-model.html` (label updated too).
- MINOR: imprecise generic MySQL reference → replaced with the `CREATE TABLE
  (constraints)` page.
- MINOR: `max_length`/type-domain claim was imprecise → rewritten to state
  `CharField(max_length)` maps to `VARCHAR(n)` while `IntegerField` adds no
  DB-level range constraint, so ORM and DB domains are not equivalent.
- MINOR: added the fact that Django's implicit PK default is `BigAutoField`
  (`BIGINT`), not `INT`.
- NIT: `TINYINT(1)` does not restrict the domain to 0/1 → explained, with an
  example `CHECK` constraint.

**Pedagogical**
- BLOCKER: `db00-003-mastery-relation` was a renamed clone of the practice
  (product→employee) → rewritten as a genuinely novel design decision set:
  surrogate id + `UNIQUE` natural key, "no value" as **NULL distinct from 0**, and
  **refusing to store the derived** `total_price`; validation plan updated.
- MINOR: `db00-001-identify-entity` sample-data rubric referenced a nonexistent
  attribute ("تعداد نسخه") → changed to the scenario's level domain (`A1..C2`).
- MINOR: terminology drift "دانشجو" vs "زبان‌آموز" → unified.
- MINOR: DB-00-001 objective 4 (candidate key + rationale) not assessed → objective
  narrowed to proposing a candidate key (now mapped).
- MINOR: DB-00-003 objective "a relation is a set" not assessed → added an
  `order-independence` criterion and a matching question to `db00-003-domain-rules`.
- MINOR: answer-leaking hints in `db00-003-model-relation` / `identify-entity`
  reframed to Socratic prompts.
- MINOR: honesty wording softened to plainly state exercises are not auto-graded in
  the current engine.
- MINOR: removed the misleading "hidden second workload" phrase from the DB-00-002
  validation plan; corrected the partial-write row to accept transaction atomicity
  **or** recovery.
- MINOR: added `CHECK` constraints to the DB-00-003 DDL illustration.
- MINOR: added a "مرور و گام بعد" (recap + next) section to all three lessons and
  fixed implausible example data (the "Kafka, 1800" book example) and a §9 summary
  that omitted the sample-data step.

## Verification (exact commands)

```
python academy-planning/scripts/validate_content.py          # STATIC VALIDATION PASSED
python academy-planning/scripts/generate_web_content.py      # wrote academy-content.json
cd web && npm run typecheck                                  # clean (tsc --noEmit)
cd web && npm run build                                      # 182 pages, includes DB-00-001..003
```

- `validate_content.py` → `STATIC VALIDATION PASSED: 16 modules, 176 planned
  lessons; 6 authored lesson(s) checked` (+ the known 28 `needs-manual-review`
  coverage warning).
- `generate_web_content.py` → `16 modules, 176 lessons, 6 authored, 1 project(s)`.
- `web/` typecheck clean; production build renders `DB-00-001`, `DB-00-002`,
  `DB-00-003` among 176 lesson routes.
- Targeted only. No legacy Playground tests, no browser E2E, no full suite.

## Limitations / deferred

- The 9 exercises are not executable/auto-graded; the `kind: "written"` proposal
  and any ERD `Spec`/`TASKS` declarations await owner approval.
- Lessons and exercises remain `in-review`; `curriculum.yaml` ids remain `planned`.
- No new generalized assessment engine or infrastructure was added.

## PRD-06 status

Content Pack 1 (DB-00-001..003) authored, reviewed, findings resolved, static
validation + web generation + typecheck + build green. **Stopped for owner review
and approval** before Pack 2.

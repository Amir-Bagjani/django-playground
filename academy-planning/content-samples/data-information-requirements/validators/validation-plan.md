# Instructor-only validation plan — DB-00-001 (data, information, requirement)

**Status: SPECIFICATION ONLY — not wired into `academy-runner`.** These exercises
are authored and structurally valid, but the current runner registry
(`app/exercises.py` `DECLARED`) intentionally does **not** declare them, so they
are **authored-only specimens**: they are not executable, not auto-graded, and
the lesson is **not** marked `approved`.

## Why this lesson is not auto-gradable today

`DB-00-001` is conceptual (foundations). Its core skill — separating raw data
from information and turning a requirement into entity/attribute/sample data —
is a written analysis, not a `sql`/`django-orm`/`erd` *solution*. The runner's
engines grade SQL rowsets and ERD graphs; the Academy authoring contract
(`docs/04_AUTHORING_GUIDELINES.md`) explicitly defines Practice/Problem
Solving/Mastery as *"a focused SQL/ORM/ERD solution"*. There is currently no
exercise `kind` for a written/conceptual answer (`kind` enum is
`sql | django-orm | erd | combined`), so these three exercises are authored with
the closest available kinds and all-manual criteria.

## Smallest suitable assessment approach (proposed, needs approval)

Add **one** new exercise `kind: "written"` (analysis answer) that:

- takes a Markdown/text answer via the existing draft store,
- contributes **zero** automatic criteria and marks **all** its criteria
  `needs_manual_review`,
- never reports `passed`/`failed` automatically and therefore never records a
  pass or flips a lesson to Completed.

This is a content-contract extension, not a new engine: the runner already
supports `evaluation: "manual"` criteria and the `needs_manual_review` status.
Do **not** implement it without owner approval.

**Known engine gap to fix with that approach:** `checks.build_payload` computes
`passed = bool(auto_checks) and all(...)`. An exercise whose criteria are *all*
manual yields an empty `auto_checks` list and would be reported as
`validation_failed`. The proposed `written` kind must short-circuit to
`needs_manual_review` (never `failed`) so a correct written answer is not
slandered. This is why these exercises are declared with
`required_for_completion: false`.

## Registered exercises (currently none)

| exercise id | kind (authored) | level | intended validator | status |
|---|---|---|---|---|
| `db00-001-identify-entity` | erd | practice | ERD structural (entity/attributes/PK) | authored-only, not declared |
| `db00-001-separate-data-info` | combined | problem-solving | manual written review | authored-only, not declared |
| `db00-001-mastery-scenario` | erd | mastery | ERD structural + manual rationale | authored-only, not declared |

## Intended checks (when the ERD ones are eventually declared)

- `required-entities` — the required entity exists, matched semantically
  (case/separator/singular-plural tolerant).
- `required-attributes` — required columns exist with a compatible type family.
- `primary-keys` — exactly one primary key, and it is the identifying column.
- `sample-data` / `entity-vs-attribute-rationale` / `classify-*` / `domain-rules`
  — `evaluation: "manual"` → `needs_manual_review`; never called wrong and never
  affecting `passed`.

The ERD engine already supports this shape (`app/erd_checks.py`); declaring a
task is content configuration, not new infrastructure. It is deferred here
because the objective is conceptual and a formal ERD task would pre-empt
`DB-03`; the owner may prefer the `written` kind instead.

## Validator QA cases required before publish
- If declared as ERD: a correct single-entity design passes; two semantically
  equivalent designs (different names/casing) both pass; a missing PK or a
  missing required column fails with the matching criterion.
- If the `written` kind is added: a complete answer is `needs_manual_review`
  (never `failed`); an empty answer is `empty_source`.
- No reference solution, hidden test or instructor file is exposed to the
  learner bundle.

# Instructor-only validation plan — DB-00-003 (relation, row, column, domain)

**Status: SPECIFICATION ONLY — not wired into `academy-runner`.** The ERD-shaped
exercises are authored-only specimens; the lesson is **not** `approved`.

## Why this lesson is not auto-gradable today

`DB-00-003` is conceptual. The runnable part (model a relation with typed
columns and a PK) fits the existing ERD engine, but the core skill — deciding and
justifying each column's **domain** and one explicit constraint — is a written
judgement. Per the pack instruction, no artificial SQL/ORM task is invented, and
the two analysis exercises are written answers with no engine.

## Smallest suitable assessment approach (proposed, needs approval)

Same proposed `kind: "written"` as the other DB-00 lessons: all criteria
`evaluation: "manual"` → `needs_manual_review`, never auto-`passed`/`failed`.
The ERD-shaped ones may later be declared as ordinary ERD tasks (a `TASKS` entry
in `app/erd_checks.py` + a `Spec`), reusing the existing engine with **no new
infrastructure** — deferred pending owner choice.

## Registered exercises (currently none)

| exercise id | kind (authored) | level | intended validator | status |
|---|---|---|---|---|
| `db00-003-model-relation` | erd | practice | ERD structural (entity/attributes/PK) | authored-only, not declared |
| `db00-003-domain-rules` | combined | problem-solving | manual written review (domain, degree/cardinality, invalid rows, order-independence) | authored-only, not declared |
| `db00-003-mastery-relation` | erd | mastery | ERD structural + manual design decisions (natural/surrogate key, NULL vs 0, derived column) | authored-only, not declared |

## Intended checks (when eventual)

- ERD structural: `required-entities`, `required-attributes` (type family),
  `primary-keys` (exactly one, the identifying column).
- Manual: `domain-documented` / `design-decisions` / `order-independence` →
  `needs_manual_review`; never wrong, never affecting `passed`.
- `db00-003-mastery-relation` (deliberately **not** a renamed copy of the
  practice): the learner must justify a **surrogate id + UNIQUE natural key**,
  represent "no discount" as **NULL distinct from 0**, and **refuse to store the
  derived** `total_price`. A design identical to the practice's product table is
  not a passing mastery answer.
- `db00-003-domain-rules` expected answers: degree = 5 columns, cardinality = 4
  rows; invalid cells are `price = -40.00` (negative), empty `name` (non-empty
  text domain), `stock = -1` (non-negative domain), `discontinued = 2` (boolean
  domain); and the learner states row order does **not** change meaning
  (a relation is a set; ordering requires `ORDER BY`). Multiple phrasings
  accepted; a wrong degree/cardinality or a missed invalid cell does not pass.

## Validator QA cases required before publish
- A correct relation design passes; two equivalent designs (different name
  casing) both pass; a missing PK or missing required column fails.
- Analysis: the `needs_manual_review` status is returned, never `failed`, for a
  substantive answer; an empty answer is `empty_source`.
- No reference solution or instructor file reaches the learner bundle.

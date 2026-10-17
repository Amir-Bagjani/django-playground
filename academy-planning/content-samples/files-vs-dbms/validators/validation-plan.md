# Instructor-only validation plan — DB-00-002 (files vs DBMS)

**Status: SPECIFICATION ONLY — not wired into `academy-runner`.** All three
exercises are conceptual written analyses; they are authored-only specimens and
the lesson is **not** `approved`.

## Why this lesson is not auto-gradable today

The objectives (analyse concurrency/integrity problems of a flat file, map each
failure to a DBMS guarantee, choose file-vs-DBMS with justification) produce
**written analysis**, not a `sql`/`django-orm`/`erd` solution. No existing engine
can decide these answers, and forcing a SQL/ORM task here would be artificial —
explicitly disallowed by the pack instructions. There is also no `kind` for a
written answer.

## Smallest suitable assessment approach (proposed, needs approval)

Use the same proposed `kind: "written"` described in
`../data-information-requirements/validators/validation-plan.md`: all criteria
`evaluation: "manual"` → `needs_manual_review`, never auto-`passed`/`failed`,
never recording a pass. No new engine.

## Registered exercises (currently none)

| exercise id | kind (authored) | level | intended review | status |
|---|---|---|---|---|
| `db00-002-analyze-file` | combined | practice | manual rubric | authored-only, not declared |
| `db00-002-map-guarantee` | combined | problem-solving | manual rubric | authored-only, not declared |
| `db00-002-mastery-files-vs-dbms` | combined | mastery | manual rubric | authored-only, not declared |

## Intended checks (manual)

- Practice: a plausible lost-update timeline, an integrity/crash case, and an
  explicit condition where a flat file is acceptable.
- Problem-solving: each of the four failures mapped to a **correct** guarantee.
  Lost update → concurrency control (+ transaction atomicity); partial write →
  **either** transaction atomicity **or** recovery (both accepted); duplicate
  name → constraint (UNIQUE); missing consistent version → recovery/backup.
- Mastery: a defensible per-workload decision with an explicit cost/risk and a
  rethink trigger. Multiple reasonable answers are accepted; unresolved judgement
  is marked for manual review, never guessed.

## Note on hidden/runtime elements
No MySQL/Django runtime check is claimed for this lesson. The illustrative DDL in
the lesson text is a demonstration and is not executed as part of grading.

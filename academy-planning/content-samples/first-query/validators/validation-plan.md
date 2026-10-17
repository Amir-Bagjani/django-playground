# Instructor-only validation plan — DB-00-008 (first query)

This file documents the **real** checks implemented by `academy-runner` for the
two exercises of lesson `DB-00-008`. It is not shipped to the learner UI.

Both exercises are evaluated with `Check Solution` (separate from `Execute`).
Running without error is **not** enough: the returned result set is compared
against the dataset of the current exercise schema.

## Shared evaluation idea (SQL and ORM)

1. The learner query/code runs against the disposable exercise schema
   (`products` table, seeded rows) using a restricted, schema-scoped user.
2. The result is normalized: numeric cells (MySQL `DECIMAL` / Python
   `Decimal`/`float`/`int`) become canonical 2-decimal strings, strings stay
   strings, `NULL` stays `NULL`.
3. Criteria:
   - `select-executes` / `queryset-executes`: the statement/code ran and
     returned a result set (a learner syntax error fails here, not as a system error).
   - `projected-columns`: the result has exactly the columns `name`, `price`.
   - `filtered-ordered-rows`: rows equal the expected in-stock products in
     descending price order.
   - `data-driven` (anti-hardcode): a hidden sentinel row is inserted into the
     table, the learner query/code is run again, and the sentinel must appear
     in the correct position; then the sentinel is removed. A hardcoded result
     (`SELECT 'X' AS name, '1.00' AS price` or `result = [...]`) fails here.

## first-query-sql
Run as restricted SQL user on schema `academy_first_query_sql`, single statement,
`MAX_EXECUTION_TIME` + socket read timeout enforced. Fetch capped at a fixed row
limit. No parser/regex sandbox: safety comes from the disposable schema and
schema-scoped grants, never from validating SQL text.

## first-query-orm
Learner Python runs in a **separate subprocess** (`python -m app.orm_child`) with
a hard timeout; Django connects to the same schema through a restricted user.
`result` is normalized the same way. A Python/Django exception is a learner
failure (traceback shown), not a system error. No `import` is required: `Product`
is preloaded. No Docker socket, no privileged mode, no shell interpolation.

## Validator QA cases required before publish
- Reference SQL solution and reference ORM solution both pass on real MySQL 8.4 + Django 6.1.
- Intentionally wrong cases fail: missing `WHERE`, ascending order, and a hardcoded result.
- A deliberate syntax error returns a real MySQL/`ProgrammingError` message.
- Timeout is reported as `timeout`, not as an infinite spinner.
- `Reset` restores the exercise dataset and does not touch the other exercise
  schema or any legacy Django Playground data.

## Not implemented here (deferred)
- General multi-lesson validator engine, ERD validation and project checkpoints
  remain out of scope (PRD-03+).

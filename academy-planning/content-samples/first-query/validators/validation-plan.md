# Instructor-only validation plan — DB-00-008 (first query)

This file documents the **real** checks implemented by `academy-runner` for the
three exercises of lesson `DB-00-008`. It is not shipped to the learner UI.

Every exercise is evaluated with `Check Solution` (`POST
/v1/exercises/{id}/evaluate`), which is **separate** from `Execute`. Running
without error is **not** enough: the returned result set is compared against the
dataset of the current exercise schema, and the evaluation is what records
progress.

## Registered exercises (exact id / validator / level / kind)

| exercise id | validator id | version | level | kind | dataset | required for Completed |
|---|---|---|---|---|---|---|
| `first-query-sql` | `first-query-sql-validator` | 1 | practice | sql | `products` | yes |
| `first-query-orm` | `first-query-orm-validator` | 1 | problem-solving | django-orm | `products` | yes |
| `first-query-mastery` | `first-query-mastery-validator` | 2 | mastery | sql | `books` + `books_wide` | no |

The runner only treats an exercise as executable when the manifest's `kind`,
`level`, `lesson_id` and `validator.id`/`validator.version` match the coded
registry exactly. `validator.version` is the **assessment version** stored with
a pass. `first-query-mastery` moved to **version 2** when a second evaluation
fixture was added (see below); a pass recorded under version 1 stays valid and is
flagged `legacy` rather than silently revoked.

## Shared evaluation idea (SQL and ORM)

1. The learner query/code runs against the disposable exercise schema on the
   exercise's dataset, using a restricted, schema-scoped user.
2. The result is normalized: numeric cells (MySQL `DECIMAL` / Python
   `Decimal`/`float`/`int`) become canonical 2-decimal strings, strings stay
   strings, `NULL` stays `NULL`.
3. Semantic rowset checks (never textual SQL comparison):
   - *executes*: the statement/code ran and returned a result set (a learner
     syntax error is reported distinctly, not as a system error).
   - *projected-columns*: exactly the required columns, in the required order.
   - *rows*: rows equal the expected result of the dataset (ordering matters
     only because the task explicitly requires `ORDER BY`).
   - *data-driven* (anti-hardcode): a hidden sentinel row is inserted into the
     dataset table, the query/code is run again, and the sentinel must appear in
     the correct position; then the sentinel is removed. A hardcoded result
     (`SELECT 'X' AS name ...` or `result = [...]`) fails here.

## Structured evaluation contract

`evaluate` returns `status`, `outcome`, `passed`, `assessmentVersion`, per-check
`{criterionId, status, messageFa, location?, hintAvailable}` and the raw
`result`. Criterion statuses: `passed`, `failed`, `needs_manual_review`,
`not_evaluated`. Top-level statuses stay distinct: `passed`, `failed`, `error`
(syntax/learner), `timeout` (deadline), `system_error` (runner/DB outage).

- `first-query-mastery` also carries one `explain-approach` criterion with
  `evaluation: "manual"`: it is reported as `needs_manual_review` with a rubric,
  is **not** called wrong, and never affects `passed`.

## Datasets, boundaries and negative fixtures

- `products` (practice/problem-solving): in-stock rows, descending price. The
  hidden sentinel `zz-probe` (price `1.23`) must appear last.
- `books` (mastery, boundary fixture): published books with price in `[10, 50]`,
  descending price, top 3. The only *in-range published* rows are the two
  boundary rows `10.00` (lower bound) and `50.00` (upper bound), so the
  descending window can reach past a missing or wrong bound: dropping
  `price >= 10` (or writing an exclusive `price > 10`) pulls `9.00`/`5.00` into
  the window and fails, and dropping `price <= 50` pulls `60.00` in and fails.
  Out-of-range rows (`5.00`, `9.00`, `60.00`) and unpublished in-range rows
  (`45.00` "Draft Best", `25.00`) are excluded, so the published filter is
  observable too. The hidden sentinel `zz-probe` (price `49.99`) must slot into
  descending position 2.
- `books_wide` (mastery, LIMIT fixture): the same `books` table rebuilt with
  **four** published in-range rows (`40.00`, `30.00`, `20.00`, `15.00`), so the
  descending window really truncates the fourth row (`15.00`): dropping `LIMIT`
  returns four rows and using `LIMIT 2` (or any value ≠ 3) returns the wrong
  set, and both fail. The unpublished `35.00` "Draft Best" would enter the
  top-3 if the published filter were omitted, and the below-bound `9.00` is only
  reachable if the lower bound is wrong; the sentinel `zz-probe` (`36.00`)
  places second.
- **Why two fixtures:** with a single table, a range bound is only observable
  when fewer than `LIMIT` rows are in range, while `LIMIT` is only observable
  when more than `LIMIT` rows are in range — the two are mutually exclusive in
  one fixture. The mastery validator therefore rebuilds the schema with both
  fixtures and requires the *same* submitted query to be correct on **both**
  (the boundary fixture makes `price >= 10` independent; `books_wide` makes
  `LIMIT 3` independent). The anti-hardcode sentinel probe runs on the primary
  (`books`) fixture.
- Multiple valid solutions are accepted because only the returned relation is
  compared: e.g. `in_stock = 1`, `in_stock = TRUE`, `in_stock <> 0` for SQL, and
  `filter(in_stock=True)` vs `filter(in_stock__exact=True)` for the ORM.

## Progressive hints

Hint text is **not** in the web bundle; only the count is. `POST
/v1/exercises/{id}/hints/next` returns exactly one ordered hint per request
(`hint`, `revealed`, `total`, `canRequestMore`). Mastery is capped to fewer
hints than the introductory levels (`ACADEMY_MASTERY_MAX_HINTS`, default 1) and
`first-query-mastery` authors only one hint. No reference solution or hidden
test detail is ever returned.

## Progress policy

`POST /v1/exercises/{id}/evaluate` records an attempt and, on success, a pass in
the app-owned SQLite progress store (separate volume, independent of MySQL and
of Reset). A pass is keyed by `(exercise_id, assessment_version)` and history is
kept. A lesson is **Completed** when every `required_for_completion` exercise
has a pass; it is **Mastered** when it is Completed *and* the Mastery challenge
has passed. Reading a lesson, running without Check, or seeing an answer never
completes it. A pass recorded under an older assessment version keeps counting
and is flagged `legacy` (explicit content-version notice) rather than being
silently removed. `system_error`/`timeout` outcomes are recorded as attempts but
never as failures and never reduce earned progress.

## Validator QA cases required before publish
- Reference SQL, ORM and Mastery solutions pass on real MySQL 8.4 + Django 6.1.
- Intentionally wrong cases fail: missing `WHERE`, ascending order, wrong
  column set, a missing or exclusive mastery *lower* bound, an omitted upper
  bound, a missing/`LIMIT 2` window in the mastery task, and a hardcoded result.
- Alternative valid implementations pass (multi-solution).
- A deliberate syntax error returns a real MySQL / `ProgrammingError` message
  with `status: error`; a slow query/submission returns `timeout`.
- `Reset` restores the exercise dataset and does not touch the other exercise
  schemas, the legacy Django Playground data, or the progress store.

## Not implemented here (deferred)
- Interactive ERD validation, project Checkpoint/Snapshot engine, AI feedback
  and full-curriculum authoring remain out of scope for PRD-03.

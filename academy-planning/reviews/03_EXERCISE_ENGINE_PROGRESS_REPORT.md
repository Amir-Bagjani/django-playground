# PRD-03 delivery report — Exercise engine, progressive hints, completion & mastery

Scope: `academy-planning/docs/prds/PRD-03_EXERCISE_ENGINE_PROGRESS.md`.
PRD-02 behaviour (SQL/ORM execution, result inspector, Check Solution, Reset,
per-exercise schema isolation) is preserved. **Commit:** `this delivery's commit
(hash in the delivery message).`

## What changed

### Content / authoring (`academy-planning/`)
- `content-samples/first-query/exercises/first-query-mastery/` — new independent
  **Mastery** exercise (`kind: sql`, `required_for_completion: false`) on a `books`
  dataset, with a `manual` `explain-approach` criterion and a single hint.
- `content-samples/first-query/lesson.fa.md` — three-exercise section, an
  objective for the independent challenge, `exercise_ids` updated; small
  pedagogical fixes (the "your table" wording now matches the mastery on `books`).
- `content-samples/first-query/validators/validation-plan.md` — full PRD-03
  contract: registry table, structured evaluation, datasets/boundaries, negative
  fixtures, progressive hints, progress policy, known limitation.
- `schemas/exercise.schema.json` — optional criterion `evaluation`
  (`auto`/`manual`) and `rubric_fa`.
- `scripts/generate_web_content.py` — embeds `required_for_completion`,
  `assessment_version`, criterion `evaluation`/`rubric_fa`, and **only the hint
  count** (hint text no longer ships in the client bundle).

### Engine (`academy-runner/app/`)
- `exercises.py` — coded registry keyed by exact `id`/`validator.id`/`version`/
  `kind`/`level`; manifest cross-check (`registryIssues`); public metadata exposes
  `hint_count`/`assessment_version`, never hint text.
- `seeds.py` — per-dataset DDL/seed/sentinel/expected rows (`products`, `books`);
  `books` includes boundary and unpublished in-range rows so the upper bound and
  the published filter are observable.
- `checks.py` — structured evaluation (`criterionId`/`status`/`messageFa`/
  `location`/`hintAvailable`), distinct `status`/`outcome`, `manual` criteria →
  `needs_manual_review`, grounded ORM file/line from the traceback.
- `progress.py` — app-owned SQLite store (separate volume), attempts + passes,
  schema version, derived lesson status with explicit numerator/denominator and
  `legacy` flag.
- `main.py` — new `GET /v1/progress`, `POST /v1/exercises/{id}/evaluate`,
  `POST /v1/exercises/{id}/hints/next`; existing routes kept.
- `docker-compose.yml` — new `academy_progress_data` volume + `ACADEMY_PROGRESS_DB`.
- `README.md`, `tests/*` updated.

### Web (`web/`)
- `lib/academy.ts` — hint_count/assessment_version/required_for_completion/manual
  criteria types; progress types + ratio helpers (explicit numerator/denominator).
- `playgrounds/database-orm/progress.tsx` — `ProgressProvider`, overall/mastery/
  per-module summary, per-lesson status chip, lesson progress panel; refresh via
  an `academy:progress` event.
- `lab/lesson-lab.tsx` — `Check Solution` → `evaluate`, structured per-criterion
  feedback with status marks and messages, server-served progressive hints,
  manual-review surfacing, exercise passed chip; `Execute`/`Reset` unchanged in
  spirit (`Execute` shows raw results, no progress).
- syllabus page + lesson page mount the progress UI; `academy.module.css`,
  `lab/lab.module.css` extended.

## Acceptance criteria (verified)

| # | Criterion | Result |
|---|---|---|
| 1 | Practice correct passes; missing query/model fails with a specific public criterion | ✅ 39 tests + live BFF |
| 2 | Alternative valid code passes; wrong columns / hardcoded / out-of-range fail | ✅ `ALTERNATIVE` SQL+ORM tests, mastery negatives |
| 3 | Hint 2 only on request; no working solution in bundle/feedback | ✅ one-at-a-time endpoint; bundle carries only `hint_count`; leak test |
| 4 | Required passed → Completed; independent challenge → Mastered | ✅ live: `pending→in_progress→completed→mastered` |
| 5 | Refresh/restart keeps progress; Reset keeps past passes | ✅ store reopen + reset tests |
| 6 | MySQL outage → `system_error`, no false failure / reduced progress | ✅ outage test (status/outcome asserted, progress unchanged) |
| 7 | Legacy Django example data/tests unaffected | ✅ not touched, not run |

## Targeted tests (exact commands)

```sh
docker compose build academy-runner
docker compose run --rm academy-runner python -m pytest -q      # 39 passed
python academy-planning/scripts/validate_content.py             # PASSED (16/176/2)
python academy-planning/scripts/generate_web_content.py         # 3 lab exercises for DB-00-008
npm run typecheck                                               # pass (web)
npm run build                                                   # pass, 181 pages
```

Covered: structured checks (valid, alternative-valid, missing `WHERE`, wrong
order/columns, hardcoded, syntax error, empty, timeout), mastery (valid,
missing published filter, wrong range, hardcoded, manual criterion), hints
(one-at-a-time, mastery cap, no leakage), progress (completion→mastery, failed
attempt does not revoke, restart persistence, reset independence, outage safety),
and the API surface.

Live BFF smoke (`http://127.0.0.1:3000/api/academy`): health + clean registry,
3 exercises with correct `hint_count`/`assessment_version`, `hints/next` capped
for mastery, evaluate → in_progress → completed → mastered, post-pass failure keeps
the pass. The smoke's progress file was then removed so the store starts empty.

## Verification honesty

- Runtime verified on real Docker + MySQL 8.4 + Django 6.1: **YES**.
- Legacy Django Playground pytest and the full monorepo suite were **not** run
  (Academy-only change; test policy). No browser/screenshot automation.
- The web `evaluate`/`hints` endpoints were exercised through the BFF proxy; the
  pre-PRD-03 generic proxy path itself was already verified in PRD-02.

## Known limitations / unverified items

- **Independent pedagogical review of DB-00-008 is still the owner's call.** I
  reviewed it against the Authoring Guidelines and the learning objectives and
  made limited fixes, but "code runs" ≠ "lesson approved".
- **Mastery lower bound (`price >= 10`) is not independently observable** under
  `LIMIT 3` (the `10.00` row is pushed out either way); documented, not claimed as
  tested. Upper bound, published filter, ordering and `LIMIT` **are** observable.
- The SQL evaluator uses one dataset family per exercise plus a hidden sentinel
  probe; it is not a general multi-fixture fuzzer.
- `explain-approach` is a manual criterion surfaced as `needs_manual_review`; no
  manual-review workflow/UI is implemented (out of scope).
- Percentages are derived in the web from the runner's authoritative outcomes;
  the runner returns outcomes + counts, and the web computes module/overall
  ratios with explicit numerator/denominator.

## Out of scope (not implemented)

Interactive ERD designer, project Checkpoint/Snapshot engine, whole-curriculum
authoring, capstone projects, AI tutor, general-purpose LMS, and any unnecessary
refactor of the Django Playground. PRD-04 has not been started.

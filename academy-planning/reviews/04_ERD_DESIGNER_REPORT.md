# PRD-04 delivery report — Interactive ERD Viewer & Learner-authored Designer

Scope: `academy-planning/docs/prds/PRD-04_ERD_DESIGNER.md` (incl. the mandatory
Step 0 fix to PRD-03). PRD-01..03 behaviour is preserved. **Commit:** `this
delivery's commit (hash in the delivery message).`

PRD-04 is delivered up to (and not including) PRD-05. No Project Checkpoint
Engine, Capstone, ERD→Models codegen, migration generation/execution or schema
sync is attempted here.

## Step 0 — mastery lower-bound fix (PRD-03 follow-up)

The `first-query-mastery` task asserted `price >= 10` but with at least three
in-range rows sorted `DESC` the lower bound was never the discriminating row, so
the caller's `10` was not independently exercised. Rewriting the top-3 sort is
mathematically impossible with ≥3 in-range rows, so the fix is **dataset-only**
("Design Z"): no validator change, **no version bump**, no effect on stored
progress or earned passes.

- `academy-runner/app/seeds.py` — `books` reshaped so exactly **two** published,
  in-range rows remain, at the boundaries: `Pinnacle 50.00` (upper) and
  `Cheap Notes 10.00` (lower, inclusive). Added published below-bound
  (`Sale Copy 9.00`, `Bargain Bin 5.00`) and above-bound (`Too Dear 60.00`)
  rows, plus unpublished in-range rows (`Draft Best 45.00`, `Other Draft 25.00`,
  `Old Draft 9.00`). Sentinel stays `zz-probe 49.99`.
- `expected_rows` = `[[Pinnacle,50.00],[Cheap Notes,10.00]]`; with the inserted
  sentinel = `[[Pinnacle,50.00],[zz-probe,49.99],[Cheap Notes,10.00]]`.
- `content-samples/first-query/exercises/first-query-mastery/instructions.fa.md`
  — point 5 softened to "up to 3" so it stays true regardless of the fixture.
- `content-samples/first-query/validators/validation-plan.md` — `books` bullet +
  QA cases updated to the new fixture.
- `academy-runner/tests/test_mastery.py` — now 6 tests incl.
  `test_mastery_missing_lower_bound_is_rejected` and
  `test_mastery_exclusive_lower_bound_is_rejected`.

**Documented trade-off (limitation):** with only two qualifying rows the `LIMIT`
*value* (3) is no longer independently exercised; the lower bound is.

## What changed

### Content / authoring (`academy-planning/`)
- `content-samples/erd-cardinality/` — new content directory for curriculum
  lesson **DB-03-002** (`cardinality`, module DB-03):
  - `lesson.fa.md` (approved) — Persian RTL prose, Crow's Foot notation table,
    SQL/Django equivalents, common errors.
  - `diagrams/relationship.json` — instructor example graph.
  - `exercises/erd-customer-order/` — `exercise.json` (`kind: erd`, `level:
    practice`, `required_for_completion: true`, 3 hints, `example_file`),
    `instructions.fa.md`, `starter.erd.json` (blank graph — not a solution),
    `example.erd.json` (instructor reference shown in the Viewer tab).
  - `validators/validation-plan.md` — PRD-04 grading contract.
- `schemas/exercise.schema.json` — optional `example_file`.
- `scripts/validate_content.py` — checks `example_file` exists.
- `scripts/generate_web_content.py` — embeds `example_graph` and json language.

### Runner (`academy-runner/app/`)
- `erd_checks.py` (new) — semantic ERD evaluation: normalizers
  (case/singular-plural/type-family), `TASKS` registry keyed by exercise id,
  `parse()` → `GraphError`, criteria builders, `build_payload`.
- `checks.py` — `invalid_input_payload`, `assemble_checks`; `invalid_graph`
  outcome added to the documented list.
- `exercises.py` — `erd-customer-order` spec; `_language()` json mapping.
- `seeds.py` — ERD exercises have no SQL dataset (`dataset_for` raises).
- `progress.py` — additive `drafts` table + `save_draft`/`get_draft`/
  `clear_draft` (`PROGRESS_SCHEMA_VERSION` stays 1).
- `main.py` — v0.3.0; `EvaluateRequest.graph`, `DraftRequest`,
  `GET/PUT /v1/exercises/{id}/draft`, ERD `reset` clears the draft only, ERD
  schema request returns 400, lifespan skips ERD seeding, evaluate routes ERD.
- `config.py` — `ACADEMY_DRAFT_MAX_BYTES` (default 64000).

### Web (`web/`)
- `lib/academy.ts`, `lib/academy-content.json` — ERD types + `example_graph`.
- `app/playgrounds/database-orm/erd/` — `graph.ts` (helpers, editor warnings),
  `erd-canvas.tsx` (React Flow, `@xyflow/react@^12.12.0`: custom entity node
  with PK/FK/UQ badges + handles, custom crow's-foot edge with optionality
  circle, pan/zoom, Controls, MiniMap), `erd-lab.tsx` (Example/Designer tabs,
  editor + inspector, relationship editor, design-notes, Check Solution, hints,
  Reset, draft auto-save/restore, criteria feedback), `erd.module.css`.
- `app/playgrounds/database-orm/lessons/[lessonId]/page.tsx` — lab exercises are
  now split by `kind`: `erd` → `ErdLab`, everything else → `LessonLab`, both
  inside `ProgressProvider`.

## ERD grading contract

- Canonical artefact is the **graph document** (`schema_version: 1`), never an
  image or an exact JSON match; node coordinates are presentation-only.
- Criteria (in order): `required-entities`, `required-attributes`,
  `primary-keys`, `unique-constraint`, `relationship-cardinality`,
  `foreign-key`, `referential-integrity`, `design-rationale` (manual →
  `needs_manual_review`, excluded from auto-pass).
- Multiple engineering-equivalent designs pass (names, singular/plural, casing,
  type spelling, drawing direction, extra entities/columns).
- Fixable design gaps → criterion `failed` (`outcome: validation_failed`);
  malformed input (not an object, wrong `schema_version`, duplicate
  ids/names) → `status: error`, `outcome: invalid_graph`; dangling refs →
  `referential-integrity` failure, never a crash.

## Verification (exact commands)

- Build + tests:
  - `docker compose run --rm academy-runner python -m pytest -q` → **53 passed**.
  - `docker compose run --rm academy-runner python -m pytest tests/test_mastery.py -q` → **6 passed** (Step 0).
  - `docker compose run --rm academy-runner python -m pytest tests/test_erd.py tests/test_api.py -q` → **18 passed**.
  - `npm run typecheck` (in `web/`) → clean.
  - `npm run build` (in `web/`) → success, 181 static pages.
- Content:
  - `python scripts/validate_content.py` → PASSED (3 authored).
  - `python scripts/generate_web_content.py` → 16 modules / 176 lessons / 3 authored.
- Ad-hoc engine smoke against the authored content (both load through the real
  `erd_checks.build_payload`):
  - `example.erd.json` → `passed success` (all auto criteria pass,
    `design-rationale` → `needs_manual_review`).
  - `starter.erd.json` (blank) → `failed validation_failed` on the structural
    criteria (FK/referential-integrity vacuously pass on an empty graph).

## Acceptance criteria

- Slice A — Viewer: instructor `example_graph` rendered read-only with pan/zoom,
  PK/FK/optionality/cardinality and notes, Crow's Foot notation. ✅
- Slice B — Designer: add/edit/remove tables & columns (name, type, PK, unique,
  nullable), create/delete relationships, set cardinality/optionality/FK column,
  drag tables, live design warnings; no collaborative editing / full version
  history / migration generation. ✅
- Slice C — Grading: normalized semantic checks (no exact-match), alternative
  valid designs accepted, unjudgeable items `needs_manual_review`, malformed
  input a distinct `invalid_graph` error. ✅
- Persistence: draft stored in the Academy progress store; Reset clears the
  draft only and never earned progress. ✅
- UI English/LTR; educational Persian/RTL; ERD identifiers readable. ✅

## Known limitations / not done

- No browser/screenshot automation (per policy); visual/interaction verification
  is the owner's manual step.
- Mastery lower-bound trade-off above (LIMIT value no longer independently
  exercised).
- Independent pedagogical review of the Step 0 fixture remains in the backlog.
- Only one ERD exercise (`erd-customer-order`) is authored; authoring all ERD
  lessons, full ERD→Models, migration generation and the Project Checkpoint
  Engine are explicitly out of scope.

# PRD-05 delivery report — Progressive Projects, Auto Save & Reliable Checkpoints

Scope: `academy-planning/docs/prds/PRD-05_PROJECTS_CHECKPOINTS.md` (incl. the
mandatory Step 0 mastery follow-up). PRD-01..04 behaviour is preserved.
**Commit:** `this delivery's commit (hash in the delivery message).`

Delivery stops at PRD-05. No PRD-06 work, no Capstone, no collaborative editing,
no git-style history, no ERD→Models codegen and no legacy Playground refactor is
attempted here.

## Step 0 — mastery `LIMIT` independence (PRD-04 follow-up)

`first-query-mastery` asserted a lower bound and `LIMIT` at once, but with the
single fixture the `LIMIT` was never the discriminating condition. The fix adds a
**second evaluation dataset** so neither condition can hide behind the other:

- `academy-runner/app/seeds.py` — added `BOOKS_WIDE` (more in-range published
  rows) with `datasets_for(spec)`/`load(spec, dataset)`; the mastery submission is
  re-run against both fixtures and must match on each. The sentinel probe still
  runs on the primary fixture.
- `Spec.alt_datasets` (default `()`) drives the extra fixtures; mastery sets
  `alt_datasets=("books_wide",)` and bumps `validator_version` 1 → 2.
- `checks._rowset_outcomes` now evaluates the rowset criteria under every fixture
  and the message text is dataset-aware (`_rows_message`).
- `content-samples/first-query/exercises/first-query-mastery/exercise.json` —
  `version` and `validator.version` → 2.

Passes recorded under the old version are kept and flagged `legacy`; earned
progress is never revoked.

## What changed

### Runner (`academy-runner/app/`)
- `projects.py` (new) — content-driven project registry. Authored manifests under
  `config.PROJECTS_DIR` are combined with a **coded** milestone registry
  (`DECLARED_MILESTONES`). A milestone is executable only when the manifest's
  `stage_kind`, `checkpoint_id` and `validator.id/version` match code; otherwise
  it is planning-only. `initial_workspace_state` returns the content-pack starter
  (ERD parsed, SQL/ORM text).
- `project_store.py` (new) — durable workspace / checkpoint / milestone-progress
  store in the existing app-owned SQLite file (one writer via the shared lock).
- `project_db.py` (new) — logical MySQL snapshot / restore / reset. Restore is a
  **rebuild**: snapshot active → build+verify staging → rebuild active → roll
  forward from the pre-restore snapshot on failure. Never rollback-based
  (MySQL DDL implicit commits).
- `project_sql.py` (new) — runs a multi-statement learner DDL script as the
  milestone's restricted user, then introspects `information_schema`.
- `project_orm_child.py` (new) — sandboxed child that writes the learner's
  `models.py` into a throwaway Django app and runs `makemigrations` + `migrate`.
- `project_checks.py` (new) — milestone dispatch (`erd`/`sql`/`orm`), structural
  outcomes, ORM model outcomes, checkpoint snapshot capture, project DB reset.
- `checks.py` — `assemble_checks`/`failure_payload`/`system_error_payload`/
  `invalid_input_payload` accept injected `criteria`/`hint_available`;
  `build_result_payload` centralizes the auto-pass rule.
- `erd_checks.py` — `build_payload` accepts `task_id`/`criteria`/`hint_available`;
  added the `booking-erd` `ErdTask`.
- `progress.py` — additive `project_workspaces`, `project_milestone_passes`,
  `project_checkpoints` tables (`PROGRESS_SCHEMA_VERSION` stays 1).
- `config.py` — `PROJECTS_DIR`, project SQL/ORM timeouts + size caps,
  `WORKSPACE_MAX_BYTES`.
- `main.py` — v0.4.0; project endpoints (list/detail/workspace get+put,
  milestone evaluate, checkpoints list/restore, reset, milestone hints). Evaluate
  is **gated** on executable dependencies (409 while locked) and only writes a
  checkpoint when the milestone passes.
- `tests/test_projects.py` (new) — 9 tests.

### Content / authoring (`academy-planning/`)
- `projects/booking.json` — three executable milestones (`booking-erd`,
  `booking-schema`, `booking-models`) with instructions/starter/validator/
  criteria/hints; remaining booking milestones stay planning-only.
- `projects/booking/milestones/{booking-erd,booking-schema,booking-models}/` —
  Persian `instructions.fa.md` + blank starters (`starter.erd.json`, `starter.sql`,
  `starter.py`).
- `projects/booking/validators/validation-plan.md` — instructor-only grading plan.
- `projects/README.md` — executable-milestone contract.
- `schemas/project.schema.json` — additive optional milestone fields
  (`stage_kind`, `description_fa`, `objectives_fa`, `instructions_file`,
  `starter_files`, `example_file`, `validator`, `criteria`, `hints`).
- `scripts/validate_content.py` — validates executable milestones' files/criteria.
- `scripts/generate_web_content.py` — embeds an approved project's public content
  (no validators) into the web bundle.

### Web (`web/`)
- `lib/academy.ts` — project/milestone/workspace/progress types + accessors.
- `app/playgrounds/database-orm/projects/[projectId]/page.tsx` + 
  `project-workspace.tsx` + `projects/project.module.css` — milestone roadmap
  (locked/available/passed), instructions/criteria/hints, ERD editor (reusing
  `ErdCanvas` + `graph.ts`) or Monaco editor for SQL/ORM, debounced auto-save,
  Evaluate, Restore checkpoint, Reset workspace (both confirmed).
- `app/playgrounds/database-orm/page.tsx` — links to the Projects section.

### Infra
- `docker-compose.yml` — mount `./academy-planning/projects:/projects:ro` and
  `ACADEMY_PROJECTS_DIR`.

## Behaviour contract

- **Auto Save**: the workspace (`erd`, `sql`, `orm`, `notes`, `current_milestone`)
  is debounced-saved to the store and survives a refresh/restart. Draft save is
  separate from a checkpoint.
- **Checkpoint**: written only when a milestone's automatic criteria pass, one per
  milestone per assessment version, with the full workspace and a logical MySQL
  snapshot; a failed attempt never creates or overwrites a checkpoint.
- **Restore**: rebuilds the milestone schema from the checkpoint snapshot (with
  pre-restore rollback on failure) and restores the workspace; progress and other
  milestones are untouched.
- **Reset**: restores the content-pack starter and drops the project schemas;
  passes and checkpoints are kept.
- Grading is structural/behavioural (never exact text); several designs pass;
  undecidable criteria → `needs_manual_review`.

## Verification (exact commands)

- Runner (Compose network, real MySQL 8.4 + Django 6.1):
  - `docker compose run --rm academy-runner python -m pytest` → **64 passed**.
  - `docker compose run --rm academy-runner python -m pytest tests/test_projects.py -q` → **9 passed**.
- Content:
  - `python scripts/validate_content.py` → PASSED (3 authored).
  - `python scripts/generate_web_content.py` → 16 modules / 176 lessons / 3 authored / **1 project**.
- Web:
  - `npm run typecheck` → clean.
  - `npm run build` → success, 182 static pages incl. `/playgrounds/database-orm/projects/booking`.
- `tests/test_projects.py` covers: registry (executable vs planning-only),
  workspace autosave + restart recovery + per-project isolation, dependency
  gating (409), checkpoint-only-after-pass, SQL checkpoint restore rebuilding
  workspace + DB (FK preserved), reset keeping progress/checkpoints, restore
  failure leaving the active DB intact, ORM migration pass with DB snapshot, and
  one-at-a-time hints.

## Acceptance criteria

- Progressive project (Booking) with linked ERD→SQL→ORM milestones. ✅
- Persistent per-project workspace auto-saved across refresh/restart. ✅
- Checkpoints only after a valid pass; per milestone; not replaced by failures. ✅
- Restore brings back workspace + milestone DB; Reset restores the starter. ✅
- Reset/Restore never delete progress, affect other projects, or touch the legacy
  Django Playground volume/DB. ✅
- Evaluation reuses the PRD-03/04 engines; structural, multi-solution,
  `needs_manual_review` for manual criteria. ✅
- UI English/LTR; Persian content RTL; Lab/Editor/ERD canvas reused. ✅

## Known limitations / not done

- The project ERD milestone reuses `ErdCanvas` + `graph.ts` with a dedicated
  inspector rather than embedding `ErdLab` wholesale; behaviour is equivalent
  (add/edit tables & columns, PK/NN/UQ, relationships, notes) but the two editors
  are separate components. Embedding one shared designer is a follow-up.
- Project `notes` is a single shared field across milestones (not per-milestone).
- ORM grading checks model structure, migration application and real DB
  constraints; it does not run learner queries or validate business rules.
- No browser/screenshot automation (per `docs/07_TEST_POLICY.md`); the manual
  Milestone 1 → Restore walkthrough is the owner's step.
- Only the Booking project is executable; the other blueprints remain planning
  contracts and the full Insurance capstone is out of scope.
- `projects.py`/`project_store.py` modules were verified with the targeted test
  file plus the full Academy suite; no legacy Django Playground tests were run.

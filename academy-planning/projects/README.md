# Project blueprints — planning-level contracts

Project files define the stage sequence, dependencies, checkpoint ids and criteria. A project becomes **executable** only when the Academy runner also declares its executable milestones (see below); the rest stays a planning contract.

## Detail levels
- `blueprint` (`booking.json`, `insurance.json`): full milestone design with design prompts, evolving requirements and acceptance criteria.
- `metadata-only` (`blog.json`, `library.json`, `ecommerce.json`, `inventory.json`): minimal planning contract — id/title/domain, milestone sequence, `depends_on` edges and `checkpoint_id`s, with a single acceptance line per stage. No authored content yet.

## Executable milestones (PRD-05)
A milestone with a `stage_kind` (`erd` | `sql` | `orm`) is executable *if and only if* the runner's coded registry (`academy-runner/app/projects.py`) declares the same milestone id with a matching `stage_kind`, `checkpoint_id` and `validator.id`/`version`. A mismatch is surfaced in `/health` as a registry issue and the milestone is treated as planning-only.

For each executable milestone this directory must also contain:
- `milestones/<id>/instructions.fa.md` — the Persian instructions;
- `milestones/<id>/starter.*` — the blank starter file(s) the learner begins from;
- `milestones/<id>/example_file` (optional) — a worked example graph, when present;
- `validators/validation-plan.md` — an instructor-only description of the real checks (never served to the UI).

`booking` is the first executable project: `booking-erd` (ERD), `booking-schema` (SQL DDL) and `booking-models` (Django migrations) are runnable; the remaining booking milestones are planning-only roadmap stages.

## Dependency & checkpoint contract (PRD-05 compatible)
- `depends_on` lists **earlier** milestone ids in the same project that must pass before the stage starts; forward/self references are invalid and rejected by the validator. Only **executable** dependencies gate execution — a dependency on a planning-only milestone is informational.
- `checkpoint_id` is the stable id of the checkpoint captured when the milestone passes (workspace artifacts + logical MySQL snapshot + content/assessment version, per `docs/05_ASSESSMENT_AND_PROGRESS.md`). A checkpoint is written only after a milestone's automatic criteria pass, and is never overwritten by a failed attempt.

Every milestone introduces evolving requirements; learners produce ERD, SQL, Django models and tradeoff justification. Multiple correct designs may satisfy the requirements; only testable invariants are auto-graded as pass/fail, and anything undecidable is surfaced as `needs_manual_review`.

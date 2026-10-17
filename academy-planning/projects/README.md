# Project blueprints — planning-level contracts

Project files define the stage sequence, dependencies, checkpoint ids and criteria **only**. They are not coded, validated or deployed Academy projects. Each project will gain full starter assets, reference solutions, real seeded DB, validators and checkpoint metadata under PRD-05/06.

## Detail levels
- `blueprint` (`booking.json`, `insurance.json`): full milestone design with design prompts, evolving requirements and acceptance criteria.
- `metadata-only` (`blog.json`, `library.json`, `ecommerce.json`, `inventory.json`): minimal planning contract — id/title/domain, milestone sequence, `depends_on` edges and `checkpoint_id`s, with a single acceptance line per stage. No authored content yet.

## Dependency & checkpoint contract (PRD-05 compatible)
- `depends_on` lists **earlier** milestone ids in the same project that must pass before the stage starts; forward/self references are invalid and rejected by the validator.
- `checkpoint_id` is the stable id of the checkpoint captured when the milestone passes (code artifacts + ERD JSON + logical MySQL snapshot + migration state + content/assessment version, per `docs/05_ASSESSMENT_AND_PROGRESS.md`). Checkpoints are only produced at PRD-05 time; here they are declared, not implemented.

Every milestone introduces evolving requirements; learners produce ERD, SQL, Django models and tradeoff justification. Multiple correct designs may satisfy the requirements; only testable invariants should be auto-graded as pass/fail.

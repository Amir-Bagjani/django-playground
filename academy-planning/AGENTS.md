# Agent Instructions — Dev Playground Academy

> These instructions are binding for contributors working on Database & ORM Academy. Consult the actual repository before changing code.

1. Read `README.md`, `docs/01_DECISIONS_AND_OPEN_ASSUMPTIONS.md`, `docs/07_TEST_POLICY.md`, the assigned PRD and `docs/03_CONTENT_SPEC.md` before touching code.
2. Preserve the existing Django Backend Playground and its data. The legacy UI is **English/LTR** (latest product decision); do not regress it to Persian RTL. Academy global UI English/LTR; Persian instructional content & grading feedback RTL.
3. **No AI functionality** inside the app. Content authoring may use offline agents, but the released product has deterministic, testable evaluators and prewritten lessons.
4. Learner writes the actual solution. Never prefill exercise starters with an answer or treat a “Run prewritten code” button as completion.
5. Separate Academy SQL/ORM/MySQL/ERD engine, user workspaces and test namespace from existing Django runner. No Docker socket / extra privileged host access. MySQL internal only.
6. **Tests: limit to changed module/exercise.** Do **NOT** run legacy Django Playground tests after Academy-only changes. Run old tests only if shared contracts changed. Do not run full monorepo suite routinely, screenshot capture or browser E2E automation. See `docs/07_TEST_POLICY.md`.
7. A static valid JSON file is NOT proof that Django/SQL executes. Do real targeted tests before saying a specific lesson is approved.
8. Recognize MySQL implicit DDL commits; don't rely on transaction rollback for Reset/Restore. Use disposable schema and staged logical backup/restore.
9. Content source of truth is `curriculum/curriculum.yaml`; never silently change stable IDs. Unauthored planned lessons stay planned. Do not mark 176 planned lessons Complete.
10. Each PRD is an independent small deliverable; stop and wait after reporting. User explicitly prefers minimal architecture and early usable vertical slices.
11. On failure provide exact repro, root cause and limitations; never make up test results or claim approval without independent review.
12. On completing an approved assigned implementation task, commit only related changes after required checks and report commit hash; never force-reset or delete persisted user data.

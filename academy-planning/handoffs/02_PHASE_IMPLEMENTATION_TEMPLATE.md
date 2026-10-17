# Single-Phase Implementation Prompt (replace placeholders)

The owner has accepted the previous phase. Implement **only** `<PRD_FILE>` for Database & ORM Academy.

Read `AGENTS.md`, `docs/01_DECISIONS_AND_OPEN_ASSUMPTIONS.md`, `docs/07_TEST_POLICY.md`, `docs/03_CONTENT_SPEC.md`, `docs/06_TECH_ARCHITECTURE.md`, the approved Master Curriculum, and `<PRD_FILE>`. Examine actual current code before choosing filenames/architecture.

Requirements:
- Build the smallest genuinely usable vertical slice from the assigned PRD.
- Keep legacy Django Playground code, data and tests isolated; do not refactor it without a shared-contract necessity.
- Local only, English/LTR UI, Persian/RTL instruction, learner-written solutions, no AI.
- Real MySQL/Django execution when the PRD specifies it; don't claim JSON/typecheck is enough.
- Run **only targeted tests affected by this PRD**. Never run old Django runner pytest for Academy-only changes. No screenshots/browser automation. Broader checks only for a shared-infrastructure change or an explicit milestone gate.
- No new future-module work, no overengineering, no scope creep or Docker volumes deletion.

Deliver: PRD ID, implemented and deferred requirements, exact tests run/skipped, real runtime validation evidence, known limitations, files touched and commit hash. Stop for owner approval before next PRD.

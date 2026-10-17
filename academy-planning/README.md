# Database & Django ORM Academy — Delivery Package

**Status:** Product decisions finalized; curriculum and authoring contracts prepared; implementation **not started**.  
**Prepared:** 2026-10-17  
**Target:** local-first, one-user, no AI in product, English/LTR application UI; Persian/RTL lesson content; MySQL 8.4 + Django 6.1 target after dependency verification.

## Contents and authority

1. [`docs/00_PRODUCT_CHARTER.md`](docs/00_PRODUCT_CHARTER.md) — product objective, scope, non-goals, acceptance philosophy.
2. [`docs/01_DECISIONS_AND_OPEN_ASSUMPTIONS.md`](docs/01_DECISIONS_AND_OPEN_ASSUMPTIONS.md) — approved choices vs implementation assumptions.
3. [`docs/02_MASTER_CURRICULUM.md`](docs/02_MASTER_CURRICULUM.md) + [`curriculum/curriculum.yaml`](curriculum/curriculum.yaml) — full **planning-level** syllabus, 16 modules / 176 planned lessons. The YAML is the source of truth for IDs/order. See the 207-topic `curriculum/coverage-map.csv` audit.
4. [`curriculum/concepts.yaml`](curriculum/concepts.yaml) — audit checklist for deep Django/MySQL/ERD coverage.
5. [`docs/03_CONTENT_SPEC.md`](docs/03_CONTENT_SPEC.md) + [`schemas/`](schemas/) — content-as-code contracts, stable IDs, versioning, learner-vs-instructor boundary.
6. [`docs/04_AUTHORING_GUIDELINES.md`](docs/04_AUTHORING_GUIDELINES.md) — Persian lesson-writing, examples, genuine practice, references, hints.
7. [`docs/05_ASSESSMENT_AND_PROGRESS.md`](docs/05_ASSESSMENT_AND_PROGRESS.md) — validation semantics, multi-solution grading, completion, checkpoints.
8. [`docs/06_TECH_ARCHITECTURE.md`](docs/06_TECH_ARCHITECTURE.md) — independent Academy execution/SQL/ORM/ERD and reset/security.
9. [`docs/07_TEST_POLICY.md`](docs/07_TEST_POLICY.md) — **targeted tests only**; no legacy-runner tests on Academy-only changes.
10. [`docs/08_CONTENT_QA_AND_SOURCES.md`](docs/08_CONTENT_QA_AND_SOURCES.md) — review gates and vetted references.
11. [`docs/09_DELIVERY_ROADMAP.md`](docs/09_DELIVERY_ROADMAP.md) — phases, dependencies, entry/exit criteria.
12. [`docs/prds/`](docs/prds/) — six independently deliverable PRDs.
13. [`content-samples/foreign-key-relationships/`](content-samples/foreign-key-relationships/) — **draft sample package**: Persian lesson, 3 unsolved exercises and validator *specification*; **not implemented/runnable yet**.
14. [`handoffs/`](handoffs/) — agent prompt to author curriculum and individual implementation phases.
15. [`scripts/validate_content.py`](scripts/validate_content.py) — lightweight static schema/reference validator (does not execute MySQL or Django).

## How to use with the existing repository

Copy the entire package into e.g. `docs/academy-planning/` of the **actual** Django Playground repo; it is not itself a runnable application. The existing app is reported as Next.js + FastAPI runner/Django child process, with English/LTR UI; agent must inspect current code, not assume old PRDs still describe it precisely. The original 4 PRDs predate user-requested English/LTR UI and their older language direction is **superseded** by this package.

### First handoff — DO NOT implement all six PRDs

Give the agent only [`handoffs/00_CURRICULUM_REVIEW_PROMPT.md`](handoffs/00_CURRICULUM_REVIEW_PROMPT.md) and ask it to **review/refine** the mapped learning objectives against sources, return missing topics with rationale, and lock the syllabus. Once approved, use [`handoffs/01_START_IMPLEMENTATION_PROMPT.md`](handoffs/01_START_IMPLEMENTATION_PROMPT.md) to implement **PRD-01 only**. Every step requires user approval before proceeding.

## Validation of this bundle

Use `python scripts/validate_content.py` from the package root. Requires Python and installed `PyYAML` + `jsonschema` for JSON Schema validation. This only checks structural consistency; it **does not** claim to test Django, MySQL, real validators, actual ERD rendering or content pedagogical correctness.

## Rules that cannot be lost

- Learner always writes the exercise solution: SQL, Django ORM, or ERD; completed solutions and hidden tests never ship in learner-visible content.
- All lessons browsable. Completed = required exercises passed; Mastered = independent mastery challenge passed.
- No AI in app, no cloud, no multiuser LMS, no Postman collections for Academy.
- Academy data/test namespaces separate from current Django Playground.
- Do **not** run unrelated legacy tests for Academy-only changes; no screenshots/E2E browser automation by default.
- Curriculum is exhaustive **plan**, not 176 authored lessons. A lesson remains `planned` until authored, reviewed and verified on real runtime.
- MySQL DDL can implicitly commit; do not use a simple transaction rollback for schema reset.

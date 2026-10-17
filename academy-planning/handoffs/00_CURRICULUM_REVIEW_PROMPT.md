# Agent Task 00 — Review and Lock Master Curriculum ONLY

You are acting as a curriculum architect and technical editor for Database & Django ORM Academy. Do not write application code or run Docker for this stage.

## Read in order
- `README.md`, `docs/00_PRODUCT_CHARTER.md`, `docs/01_DECISIONS_AND_OPEN_ASSUMPTIONS.md`
- `docs/02_MASTER_CURRICULUM.md`, `curriculum/curriculum.yaml`, `curriculum/concepts.yaml`
- `docs/04_AUTHORING_GUIDELINES.md`, `docs/08_CONTENT_QA_AND_SOURCES.md`

## Assignment
1. Audit 16 modules / 174 **planned** lessons, gaps, redundancy, ordering and whether MySQL and Django ORM can realistically be taught in parallel.
2. Inspect every critical Django Field/option and QuerySet group, MySQL DDL/DML/transactions/index/advanced concept, normalization and ERD design. Verify topic claims from official version-matched Django 6.1 and MySQL 8.4 documentation; flag missing topics or impossible pairings.
3. Check foundational-to-advanced skills and booking/ecommerce/insurance projects. Ensure skills grow via genuinely learner-written SQL/ORM/ERD exercises.
4. Propose only justified revisions to `curriculum.yaml`/`concepts.yaml` and `docs/02_MASTER_CURRICULUM.md`. Keep stable IDs unless a clear reason is documented; note version impact.
5. Validate modified machine-readable data: `python scripts/validate_content.py`.

## Strict constraints
- Do not implement any PRD, lesson runner, broad tests or app features.
- Do not invent researched references; cite specific official sources supporting technical issues.
- Do not claim draft lessons are authored/approved.
- No screenshots/browser E2E. No running legacy Django Playground tests.

## Deliver
Gap analysis, proposed changes, coverage audit, version caveats, sources, the exact static validation result, and explicit questions only if absolutely blocking. Stop for product-owner approval before starting PRD-01.

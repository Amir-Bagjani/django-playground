# Content Author Agent — One Content Pack

Author only the approved pack `<PACK_ID>` containing lesson IDs `<LESSON_IDS>` in Database & ORM Academy.

Read `curriculum/curriculum.yaml`, `curriculum/concepts.yaml`, `docs/02_MASTER_CURRICULUM.md`, `docs/03_CONTENT_SPEC.md`, `docs/04_AUTHORING_GUIDELINES.md`, `docs/08_CONTENT_QA_AND_SOURCES.md` and the reference sample package.

1. For each assigned lesson consult official **version-matched** Django and MySQL docs, plus approved design books; document sources. Explain in original fluent Persian with real detail: why, mechanism, SQL/ORM/ERD correspondence, limits, edge cases, common errors, performance and data integrity.
2. Write actual lesson Markdown/YAML metadata, sample queries/files, starter code **without complete solution**, public acceptance criteria, independent Practice/Problem/Mastery tasks, hints that escalate without giving answer.
3. Produce instructor-only reference solution and validation specification. Coordinate implementation of validators only when corresponding runner exists; do not mark tests successful if they cannot execute yet.
4. Add exact stable IDs and reference mappings, keep existing completed progress compatible. Only adjust Curriculum when explicitly approved; do not create extra random lessons.
5. Validate affected files with `python scripts/validate_content.py --lesson <id>` and run **only targeted real evaluator tests** if runner exists. No old Django Playground tests; no screenshots.

Deliver lesson coverage matrix, source links, notes about inaccurate/unsupported ideas, test evidence, and draft status. Stop for independent review. Do not self-approve.

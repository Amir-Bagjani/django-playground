# Product Charter — Dev Playground / Database & ORM Academy

## Problem
Existing Django Playground is a freeform local Python/Django lab. The new Academy is a distinct **guided educational product** where learners gain mastery of relational database design, MySQL and Django ORM by writing and iteratively fixing their own SQL, models and diagrams. A tutorial that merely displays a finished query and provides a Run button is not acceptable.

## Users and environment
- Initially one local user, browser UI via the existing Next.js app. No authentication, cloud sync or online class management.
- Home / `Playground Hub` lists existing Django Backend and new Database & ORM Academy (future DRF Serializer and Design Systems are not implemented).
- UI navigation/buttons/chrome: **English + LTR**. Educational text and feedback: **Persian + RTL**; code/SQL/identifiers: LTR.
- Academy is a *parallel* MySQL + Django ORM learning experience from first concepts, while topics without meaningful one-to-one counterparts have dedicated tracks. ERD progressively moves from interactive reading to user-driven design.

## Core learning loop
1. Explanation: why a concept matters, formal model, pitfalls, SQL/ORM parallels, concrete examples.
2. Observe/experiment: editable, **instructor-created demonstrations** are distinct from exercises.
3. Solve: blank/partial starter that never contains the finished answer; learner writes the SQL, ORM code or ERD.
4. Check: actual behavior/schema tests against a **disposable isolated database**; public criteria and truthful feedback.
5. Hint: failed criterion first; optional progressive hints without default answer revelation.
6. Review and practice independently: new mastery task and engineering rubric where architecture is non-unique.
7. Save progress: local persistent drafts, step checkpoints for projects, reset working state separately from records of passing.

## Completed/Mastered
- All lesson pages are open immediately; prerequisites are informative, not hard locks.
- `Completed` requires only the **required** exercise IDs for the lesson to have a valid pass at the corresponding assessment version.
- `Mastered` requires passing an independent mastery challenge, separate from a repeat of the guided task.
- Progress is separate from editable workspace state. Reset of code/db does not erase history of completion. A policy for changed assessment versions is required; no silent revocation.

## Content quality principles
- **Content depth first.** Curriculum published before comprehensive content authoring; delivery chapter-by-chapter.
- Persian authored content, technical factual checks against version-matched official docs and educational review by a second reviewer.
- Dedicated coverage of Django Field classes (`ForeignKey`, `CharField`, etc.), options, QuerySets, migrations, MySQL SQL features, normalization, concurrency, performance, design reviews and MySQL operations.
- Several cross-domain multi-milestone projects: Blog/Library, E-commerce/Inventory, Booking; final capstone **Insurance Claims & Policy Management**, scoped to data-engineering competency rather than full insurer operations.
- Reference solutions available to instructors/validators only. User can access hints, not automatic solution filling.

## Scope boundaries
**In:** MySQL 8.4 training DB, Django ORM real execution, Markdown lessons + versioned schemas, progressive exercise validator, ERD visualization/design, checkpoints and persist progress.

**Out:** AI tutor/generation in runtime, course CMS, live instructor classroom, SCORM/LTI/QTI implementation, social learning, deployment, full MySQL administration console, running adversarial unknown user code securely as a public service, extra future playgrounds, sophisticated adaptive learning engine.

## Nonfunctional constraints
- Preserve existing Django backend playground behavior and data. Prefer separate Academy route, backend module/service and storage namespace.
- Reasonable CPU/time/memory/query/output limits, no publishing MySQL externally, least-privilege DB identities.
- No unbounded parallel work: one PRD per approval, small vertical slices, focused tests.
- No fake 'passed' output, placeholder complete content or misleading validation.

## Release definition
An Academy release needs a fully authored and reviewed **usable content slice**, tested on real MySQL/Django with learner-submitted code and failing submissions. A navigation skeleton without content is not a finished educational release.

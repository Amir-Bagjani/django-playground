# PRD 06 — Curriculum Delivery, Content QA & Capstone Projects

**Dependencies:** PRD-01–05. **Important:** This PRD is a **repeatable program of small content batches**, not authorization to write 176 lessons at once. Scope/final approval applies to each approved chapter pack.

## Outcome
High-quality original Persian lessons for all **approved** Curriculum topics, exhaustive coverage of Django field/QuerySet methods and MySQL/ERD internals, independent three-tier exercises, testable examples, trusted reviewer signoff, progressive domain projects and final Insurance Claims capstone. Content itself is a major product deliverable, not filler seeded into UI.

## Content Pack definition
A small approved bundle normally one theme/module subset (e.g. 4–8 short lessons, adjust for complexity), all lesson metadata, Persian detailed instructional Markdown, demonstrative datasets/code, Practice/Problem/Mastery exercises, starter scripts, hints, public acceptance criteria, backend validators, QA report and links to references. A module with 12 planned lessons may require multiple packs.

## Authoring and independent review
1. Author receives `curriculum.yaml` lesson IDs, `concepts.yaml` inventory, sources, `CONTENT_SPEC`, sample template and package scope. No authority to delete/rename lesson IDs silently.
2. Produce drafts with real examples, mistake analyses, key configuration/edge cases and distinct learner-writing tasks.
3. Separate **technical review** checks versioned Django and MySQL behavior, runner results, constraints/SQL, completeness and alternate solutions.
4. Separate **pedagogical review** checks Persian clarity, sequencing, cognitive load, mapping objective-to-assessment and hint leakage. Different pass/agent context, not author self-attestation.
5. Only after actual passing/failing reference tests and review evidence, mark lessons `approved`, update Curriculum statuses and release that pack.

## Mandatory topical depth
- Detailed Django Model Field catalog: all core Field types/options in concepts checklist; both ORM and actual MySQL representation where meaningful; relation semantics and migration effects.
- Django QuerySets/Managers/Meta/Constraints/Expressions/Aggregation/Subquery/Prefetch/transaction behavior, with query count and SQL evidence when optimizing.
- Relational theory, normalization up to advanced forms, ERD conceptual+logical+physical design, business rules, keys, foreign-key cardinalities.
- MySQL querying, transactions/isolation, InnoDB, indexing, execution plans, character sets, JSON, stored routines/views/triggers, permissions, backups, replication/partitioning basics; every deep topic assigned to a reviewable pack.
- Distinguish topics needing instructor-only explanation vs actual learner lab administrative privileges. Safety and realism matter more than demonstrating all production operations locally.

## Project sequence
- Blog + Library for foundation and relationships.
- E-commerce + Inventory for constraints, financial arithmetic, relationships, atomicity.
- Booking for overlapping reservations, concurrency, indexes and schema evolution.
- Final **Insurance Claims & Policy Management** in 10 milestones mapped to DB-15: requirements → policy schema → coverage limits → claims/documents → evaluation/history → payment ledger → concurrency/idempotency → migration change → analytics/performance → design defense. Never provide full solved ERD or models to learner.

## Engineering rubric & mastery
Capstone requirements contain objective acceptance tests (FK/check constraints, financial precision, prevent duplicate payment, migration preserves existing data, concurrency behavior and reporting correctness), plus explicit trade-off rubric (schema decomposition, temporal modeling, indexing evidence, security). For non-unique architectural decisions, accept alternatives that meet business invariants; otherwise mark for manual review. No AI-based automated design judgment.

## Publish gates per pack
1. All listed lesson objectives covered and mapped to actual exercise checks.
2. Correct authoring schemas, stable IDs, source links and metadata versions.
3. Multiple real executing SQL/ORM samples on pinned MySQL/Django; no fake “works” claim.
4. Each validator tested with a positive, meaningful negatives, edge fixtures and at least one legitimate alternative where appropriate.
5. Independent technical and educational reviewer signoff and unresolved issues list.
6. No leaked instructor-only tests/solutions in public bundle.
7. Checkpoint/progress compatibility preserved when content changes.

## Test scope
`validate_content.py --lesson <id>` for each affected unit; targeted SQL/ORM/ERD validator tests for changed exercise IDs; no legacy Django runner suite. Run a chapter smoke on real MySQL at content pack gate. Larger Academy regression only at milestone/release. No screenshot/browser automation requirement.

## Operational model
PRD-06 isn't “Complete” simply because a file tree exists. Each pack has states `planned -> draft -> in-review -> approved -> released`. Track coverage `% approved / total planned` separately from learner's completion %. Acknowledge incomplete planned topics; defer later packs without falsely declaring the entire curriculum implemented.

## Deliverable per pack
Pack ID and lesson IDs, authored files, references, reviewer findings, real runtime evidence, exact targeted commands passed/skipped, status updates and commit; await user approval for next pack. Separate final capstone signoff.

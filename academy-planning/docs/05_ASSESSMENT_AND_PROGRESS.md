# Assessment, Feedback, Progress & Checkpoints

## Functional model
All lessons visible from start. An exercise is passed only by executing submitted learner work on a controlled real environment and evaluating published criteria. Separate `draft`, `submitted`, `passed`, `failed`, `needs_manual_review`, `system_error` statuses.

## Three-level bank
- **Practice**: straightforward learned concept; one or a few crisp assertions.
- **Problem Solving**: composed requirements, missing information and edge cases; no prewritten final solution.
- **Mastery**: novel domain, independent solution, engineering rubric and optional manual evaluation; not a single renamed Practice challenge.
- Each lesson's completion rule is defined in manifest, normally Practice and Problem Solving required; Mastery independently marks `Mastered`.

## Validating what matters, not incidental source shape
For a SQL SELECT task, execute against multiple seeded data sets, compare normalized returned relation (type, count, values) and ordering only when specified; don't compare query strings. For SQL schema/DML, introspect information_schema and simulate allowed/invalid changes in disposable schema. For Django, inspect Model metadata and migration-backed MySQL schema, then insert/read/update/delete and verify relevant constraints; avoid accepting only parser-matching syntax. For ERD, normalize graph and check semantic relations; allow defensible variations and review ambiguous trade-offs using rubric, marking uncertain checks `needs_manual_review`.

## Progressive feedback
1. Show passed/failed criterion with Persian description; optionally real file/line or SQL location when engine can substantiate it.
2. On explicit Hint click reveal next stage; do not unveil final implementation or hidden tests.
3. Distinguish errors in learner code from runner/DB errors. `system_error` should never count as failed mastery.
4. Maximum attempts need not be capped. A failed submission must not overwrite previous passed result.

## Grade semantics (stable and auditable)
- `exercise_attempt`: ID, exercise_id, content_version, assessment_version, status, timestamp, public feedback, workspace_ref; avoid long-term storing sensitive SQL secrets.
- `exercise_pass`: max successful assessment_version and passed_at; historical pass retained when assessment changes.
- `lesson_completed`: derived from required exercise pass records compatible with currently accepted assessment policy; not from view/read events.
- `lesson_mastered`: valid independent mastery pass.
- `module_percentage = 100 × completed lesson count / active lesson count` (explicitly track numerator/denominator). Overall percentage likewise; consider separate mastery rate. Completed/Mastered never hard-locked by prior lessons.
- Adding a new required exercise can change current denominator but **preserve** historical passed state and show a content-version notice; no silent revocation.

## Auto-save/Reset/Checkpoint
- Auto-save writes SQL/Python/ERD draft to local durable store keyed `(module, exercise_or_project, workspace_id)`, independent of legacy Django example files.
- Independent exercise Reset restores starter files and a **fresh** disposable DB/schema; it does not delete progress history.
- Multi-milestone project Checkpoint on **passing** a milestone: capture code artifacts + ERD JSON + logical MySQL DB snapshot/dump + migration state + content/assessment version. Checkpoint manifest includes checksums and status.
- Restore must be atomic from user's perspective: build **replacement** training schema from checkpoint and verify consistency before switching active workspace; on failure keep old state. Never rely on `ROLLBACK` for MySQL DDL.
- Use MySQL-native logical dump/restore or equivalent consistent logical recreation and tables/row verification. **Do not copy active InnoDB data files** for backups.
- Confirm destructive Reset/Restore. No `docker compose down -v` in normal operation.

## Engineering rubric for capstone
Candidate criteria: domain completeness, key/cardinality correctness, referential integrity, null/constraint behavior, mutation anomalies, accurate transaction boundaries and locking, temporal/audit requirements, query plans/index decisions, data preservation during schema evolution, privacy/security trade-offs, design rationale. Each criterion has evidence type: executable, structural, quantitative or manual review. Never call a subjective design “wrong” without defined grounds.

## Validator QA definition of done
For each changed exercise: verify reference solution, another structurally different valid approach where relevant, at least two targeted failing approaches, boundary dataset(s), no undesired cross-exercise state, timeout/error differentiation, and public hints. Run **only affected lesson tests**. Full suite only at release gate/changed shared runtime.

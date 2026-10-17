# Coverage Audit and Content Batch Planning

`curriculum/coverage-map.csv` enumerates required topic tokens and their **planned primary lesson IDs**, with optional secondary cross-references and a `mapping_review` flag (`verified` / `needs-manual-review`). This is not evidence that those topics are taught yet. Review it during curriculum signoff and again when publishing content. The static validator enforces that each `primary_lesson_id` exists and lives inside the coverage group's `target_modules`; rows whose correct owner is a judgment call are flagged for manual review.

## Coverage verification sequence
1. **Planned:** topic appears in coverage-map, references a valid curriculum lesson ID.
2. **Authored:** the lesson actually explains the topic, includes MySQL/ORM contrast where appropriate, a meaningful scenario, and source reference.
3. **Exercised:** the learner must perform related SQL, Django ORM or ERD work; not merely read an explanation.
4. **Validated:** relevant exercise validator has been tried on real MySQL/Django and negative/alternate cases.
5. **Reviewed:** a separate technical and educational pass confirms quality and accuracy.

Do not increment percentage of authored lessons or published topics on mere map presence. The coverage mapping is a **first pass**, and some topics (e.g. a one-off Django Field option or advanced MySQL operation) may require split/expanded lessons when researched. Record additions with new stable IDs; do not compress genuinely important behavior into one bullet.

## Example content pack plan (illustrative; not dates or committed scope)
- CP-00A: fundamental relational ideas and first SQL/ORM query (DB-00 first four or five lessons).
- CP-00B: keys, NULL, stack, evaluation/reset concepts.
- CP-01A: CREATE TABLE + first Model and Migrations (real usable SQL/ORM lab).
- CP-01B: types and precise data representation.
- CP-03A: reading ERD and FK reference diagrams.
- CP-03B: user-designed relationship diagrams with graded constraints.
- Each subsequent chapter typically split into 2–4 small reviewed batches depending on difficulty.
- DB-07 Django Field reference requires multiple packages per family, with dedicated option examples rather than generic catalog alone.
- DB-11 concurrency and DB-12 MySQL operations need targeted DB runtime scenarios; plan additional QA time.
- DB-15 capstone releases one milestone at a time with real Checkpoint+restore verification.

## Source inventory
- `curriculum/curriculum.yaml`: 16 modules / 176 planned entries.
- `curriculum/concepts.yaml`: targeted deep checklist for fields, query methods, MySQL, ERD/design.
- `curriculum/coverage-map.csv`: coarse *primary ownership* for each topic (plus optional secondary cross-references); author can cite additional lesson cross-references in lesson metadata/reference section.

## Topic addition/deletion/change controls
- Topic added: evidence of importance + source + planned owning lesson. If no reasonable place, allocate new stable lesson ID.
- Topic merged: explain that outcome and test coverage remain intact, preserve redirects/old progress ID policy.
- Deprecated API behavior: annotate version; never teach as current practice when incompatible with pinned Django/MySQL.
- Approval: lessons must have technical review, educational review and actual runtime evidence; updating checklist is not release.

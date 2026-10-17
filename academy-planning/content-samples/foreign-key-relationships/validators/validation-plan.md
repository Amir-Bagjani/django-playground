# Instructor-only validation plan — ForeignKey sample

**Status: SPECIFICATION ONLY.** This package demonstrates authoring format. Executable SQL/ORM/ERD validators MUST be implemented under PRD-03; do not report these checks as passing today.

## fk-practice
1. Place learner files in an isolated Django project with MySQL training database.
2. Run Django system checks and migrations on disposable schema.
3. Inspect `_meta.get_field("customer")`: is a ForeignKey, related model Customer, non-null and deletion policy consistent with protection.
4. Insert customer + order; try delete customer; require ProtectedError or an equivalent specified policy. No exact source string matching.

## fk-problem
1. Run SQL on brand-new disposable MySQL schema with restricted DDL account for that schema only.
2. Inspect `information_schema.KEY_COLUMN_USAGE` and REFERENTIAL_CONSTRAINTS to confirm FK.
3. Attempt invalid insert (must fail) and valid insert (must succeed), verify count.
4. Reset schema by dropping/recreating disposable schema, NOT by assuming DDL rollback.

## fk-mastery
1. Validate Guest/Room/Booking relationships and schema constraints via DB introspection and migrations.
2. Test Guest deletion while active booking; evaluate expected behavior based on published business rules.
3. Use design rubric for historical preservation, constraints, nullability, naming and indexing. Exact diagram layouts must NOT be required.
4. If a criterion cannot be auto-verified, mark **Needs Manual Review**; do not fabricate an error location or silently mark passed.

## Validator QA cases (required before publish)
- Reference solutions pass on real MySQL + Django; intentionally broken FK, missing NOT NULL, wrong delete action and hardcoded fake outputs fail.
- More than one valid implementation passes where design choices are open.
- Database content from one learner attempt cannot leak into another.
- Errors are surfaced as structured criterion IDs + actionable Persian hint, no reference solution in response.

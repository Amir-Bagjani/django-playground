# PRD 03 — Exercise Engine, Progressive Hints, Completion & Mastery

**Dependencies:** PRD-02 real SQL and ORM execution. **Goal:** scalable assessment with no per-exercise frontend code changes; real answers and alternative implementations accepted; progress persisted independently.

## User stories
- I have to write code myself and cannot finish with a Run button on a complete example.
- After failure I see the failed criterion and can optionally request deeper hints; I can revise and resubmit.
- A lesson becomes Completed when required exercises pass; it becomes Mastered only after a new independent challenge.
- I can browse any lesson, reset working files and keep already earned learning milestones.

## Scope
1. Implement exercise manifest schema, routing/loader and instructor-only validator registry by exact ID, version and kind (`sql`, `django-orm`; future ERD kind reserved). No executable validator code sent to browser.
2. Author/evaluate all three levels for approved initial chapter: Practice, Problem Solving and independent Mastery; learner writes actual source.
3. Execution: isolated seeded DB; SQL semantic/schema/assertion tests; ORM model metadata and behavior; negative fixture(s) and boundary data. Validate multi-solution cases where criteria allow. Reject hardcoded fake output.
4. Structured checks: `criterionId`, `status`, Persian `messageFa`, optional grounded source/file/line, `hintAvailable`. Handle syntax error, validation failure, deadline, runner crash distinctly.
5. Hint progression: first failure criteria visible; reveal next ordered hint only on click. Never expose reference solutions or hidden tests/secret grading details via API/Next.js client bundle.
6. Progress persistence: attempts + latest pass by `(exercise_id, assessment_version)`, derived lesson status, module percentage and overall percentage; no completion on read/execute alone. No prerequisites lock pages.
7. Access: a user may resubmit after pass; keep historical success even if current attempt fails. Versioned assessment changes cause explicit status/migration, never silent deletion of previous outcome.
8. Local persistence with migration support; UI for Pending/In Progress/Completed/Mastered, incomplete exercise actions and honest unavailable states.

## Assessment principles
- Visible criteria must cover all business requirements; hidden tests use different datasets/edge cases, not undisclosed goals.
- Do not compare literal SQL text or require a single ERD layout. For subjective engineering reasoning return `needs_manual_review` with rubric, do not call uncertain decision incorrect.
- For performance, threshold/rubric must avoid CPU-specific flaky wall clock; compare query plans/counts/upper bounds where justified.

## API proposal
`GET /academy/v1/exercises/{id}`, `POST /academy/v1/exercises/{id}/evaluate`, `POST /academy/v1/exercises/{id}/hints/next`, `GET /academy/v1/progress`. Request takes learner solution and trusted exercise ID; never arbitrary filesystem validator path or admin SQL creds.

## Acceptance criteria
1. Practice correct submission passes; missing query/model fails with specific public criterion.
2. Same exercise with valid alternative code passes; wrong field type, hardcoded output and invalid schema fail on relevant checks.
3. Hint 2 is only revealed after request, not automatically; no fully working solution included in UI bundle or feedback.
4. Required exercises passed -> Completed; Mastery alone is not a shortcut for missing required exercises unless explicit future product policy; passed independent challenge -> Mastered when completion conditions also met.
5. Refresh/Compose restart retains progress; Reset affects editable exercise data but not past pass records.
6. Unexpected MySQL outage returns `system_error`; doesn't mark exercise failed or reduce progress.
7. Old Django backend example data and test suites unaffected.

## Scoped tests
Run only new/changed Academy exercise validators on actual MySQL; positive, negatives, boundary cases, persistence; UI/typecheck for changed components. Legacy runner tests forbidden for Academy-only changes. Build at PRD delivery, no screenshots.

## Non-goals
AI-based feedback; plagiarism checker; continuous adaptive lesson selection; grading learner architecture decisions beyond measurable evidence; full course-wide E2E after every new exercise.

## Delivery
Report actual exercise IDs, validators and scenario passes, API/types, assessment version policy, short test summary, commit, wait for approval.

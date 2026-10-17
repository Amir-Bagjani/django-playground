# Content as Code — Technical Contract v1

## Objectives
Support 100s of editable/reorderable lessons without editing React components; allow agents to author bounded content packages; ensure learner only sees public material; support stable progress across edits; avoid a heavyweight LMS/CMS.

## Canonical content formats

| Artifact | Storage | Parsing notes |
|---|---|---|
| Master navigation | `curriculum/curriculum.yaml` | Validated by `schemas/curriculum.schema.json`; **order and IDs are authoritative**. |
| Coverage checklist | `curriculum/concepts.yaml` | Completeness audit only; not lesson content. |
| Coverage map | `curriculum/coverage-map.csv` | Maps each checklist topic to its owning lesson; columns below. Structurally validated, not semantically. |
| Lesson prose | `lesson.fa.md` | UTF-8 Markdown with YAML frontmatter matching `schemas/lesson.schema.json`. Renderer must restrict untrusted raw HTML. |
| Exercise | `exercise.json` + `instructions.fa.md` | Validated by `schemas/exercise.schema.json`; exercise IDs unique globally. |
| Starter code | `starter.sql` / `.py` / `erd.json` | Learner editable; intentionally unfinished. |
| Hint bank | Ordered `hints` in exercise JSON | Public on request only, no full solutions. |
| Validator definition | `validator.id/version` and instructor-side code/spec | Store/run only on Academy backend, never expose reference solution / hidden tests in public API. |
| Project | `project.json`, requirements, milestones, snapshot policy | `schemas/project.schema.json`; independent from lessons. |
| Progress | local app state store | IDs + assessment_version + passed_at, independent from content Git data. |

## IDs and versioning
- Immutable course IDs; lesson IDs such as `DB-03-005`, exercises `fk-practice`; separate slug from ID. Renaming title/folder does not change ID.
- `version` increments for content or assessment changes that affect learning behavior; `validator.version` increments for changed pass criteria. Content version is **not** the same as runtime app version.
- A passing record stores `exercise_id`, `assessment_version`, `passed_at`, relevant project checkpoint ID. Reorder lessons without invalidating history.
- Deleted lessons become archived in Curriculum view, not silently discarded from persisted progress; old progress remains readable.
- If critical assessment changes, mark previous result `passed_legacy` and offer revalidation; never silently remove completion. Explicit migration/reconciliation policy documented per change.

## Concrete package example
```
content/lessons/DB-03-005-one-to-many/
  lesson.fa.md                     # YAML frontmatter + Persian prose
  examples/example.sql             # optional instructor demonstration
  diagrams/relationship.json       # optional ERD visual demonstration
  exercises/fk-practice/
    exercise.json
    instructions.fa.md
    starter.py
  exercises/fk-problem/
    exercise.json
    instructions.fa.md
    starter.sql
  exercises/fk-mastery/
    exercise.json
    instructions.fa.md
    starter.py

academy/validators/DB-03-005/       # trusted backend-only, not served to browser
  *_validator.py
  *_reference_solution.py
  test_*.py
```

**The included `content-samples/foreign-key-relationships/` is a DRAFT contract specimen.** Validation plan is non-executable until runner/validator APIs exist; it must not be shipped as a published lesson.

## Coverage map contract
`coverage-map.csv` columns:
- `coverage_group`, `topic` — must equal the `concepts.yaml` topic set exactly (no missing, no extra, no duplicate).
- `primary_lesson_id` — the lesson that **actually teaches** the topic. The validator requires this lesson to exist **and** to live in one of the group's `target_modules`. A syntactically valid ID is insufficient.
- `primary_lesson_title_fa` — the owning lesson's title (denormalized for review).
- `secondary_lesson_ids` — optional `;`-separated cross-references where the topic is also touched (may live outside `target_modules`); each must exist.
- `status` — `planned` until the owning lesson is authored and verified.
- `mapping_review` — `verified` when the mapping is structurally unambiguous; `needs-manual-review` when the correct owner is a judgment call the validator cannot confirm automatically.
- `review_note` — human-readable note.

The validator checks structure (existence, module membership, allowed enum values) and reports the `needs-manual-review` count as a warning; it **cannot** confirm pedagogical ownership — that stays a manual/review step.

## Parity field
Lessons may declare `parity` in `curriculum.yaml` (see the parity policy in `02_MASTER_CURRICULUM.md`): `equivalent | related | sql-only | orm-only`. It is advisory teaching metadata describing how the SQL and ORM views relate; it does not assert correctness and is not a grading criterion.

## Lesson metadata schema
Required: `id`, `slug`, `title_fa`, `locale`, `version`, `status`, `objectives`, `exercise_ids`, `references`. `status` lifecycle: `draft` -> `in-review` -> `approved`; only approved content visible as normal lesson. Under implementation use reader that does not accidentally serve work-in-progress content.

## Exercise contract
- `level`: `practice | problem-solving | mastery`.
- `kind`: `sql | django-orm | erd | combined`.
- `criteria`: public IDs + localized description; hidden tests can exist but no surprise **requirements** contradicting instructions.
- `validator`: registered backend `id`, version and authoring criteria file. Never permit client to submit arbitrary validator name/path/SQL file path.
- `starter_files`: relative paths under one exercise root only; traversal, absolute, symlink escapes, secret paths rejected. Support file size, total code size and maximum execution output limits.
- `hints`: ordered progressively from concept reminder to targeted non-solution hint. Do not include answer in final hint unless user opts into a separate post-completion review later.
- `required_for_completion`: practice/problem-solving generally true; mastery independently required for `Mastered` but need not be required for `Completed`.

## Types of validators and guarantees
- SQL result grading: compare schema and rows **semantically**, not textual SQL or fixed ordering unless ORDER BY is explicitly required; use diversified fixtures; assess DML side effects and constraints. Avoid false passes from hardcoded constants.
- ORM: run learner code in controlled workspace; introspect Django Model fields + migration correctness; test outputs and side effects on real MySQL; count queries where performance is an explicit criterion.
- ERD: compare normalized graph of entities/attributes/keys/relationships plus behavior-derived criteria; tolerate renaming/valid alternative designs where rubric allows.
- Engineering rubric: structured trade-offs and checklists, with `needs_manual_review` if a nontrivial judgment cannot be made by rules. No fabricated certainty.
- Tool/runtime failures differ from learner failures: infrastructure exceptions must be `system_error`, not `failed`.

## Proposed API semantics (later PRD-03)
`GET /academy/v1/curriculum`, `GET /academy/v1/lessons/{id}`, `GET /academy/v1/exercises/{id}`, `POST /academy/v1/exercises/{id}/evaluate`, `GET /academy/v1/progress`, `POST /academy/v1/workspaces/{id}/reset`; internal mechanics finalized against actual code.

**Example evaluation response (illustrative contract):**
```json
{
  "exerciseId":"fk-practice", "assessmentVersion":1, "status":"failed",
  "checks":[
    {"criterionId":"model-exists", "status":"passed"},
    {"criterionId":"fk-required", "status":"failed", "messageFa":"فیلد customer نباید مقدار NULL بپذیرد.", "location":{"file":"models.py", "line":5}}
  ],
  "canRequestNextHint":true
}
```
Report location only if backed by AST/runtime/schema evidence; may omit `location` otherwise. Revealing implementation of hidden tests and reference answer is prohibited.

## Lesson frontmatter/Markdown rules
Parse YAML frontmatter securely; render Markdown through trusted renderer, disable arbitrary script/HTML execution, and sanitize links. User-facing text RTL; inline code, fenced SQL/Python and identifiers LTR. No raw JSX components hardcoded per lesson. Future bespoke interactive widgets are explicit `type` registrations, not arbitrary lesson-authored JavaScript.

## Extensibility + archive behavior
New concept: add lesson file + Curriculum entry + exercises/validator + targeted QA; no app UI code unless new interaction kind. Move/rename: change order and slug/path references only, preserve stable ID. Archive: mark not active, keep progress history. Never delete/invalidate checkpoints before safe migration.

## Static validation
`python scripts/validate_content.py [--lesson DB-03-005]` checks schema, IDs/duplicate refs, frontmatter, exercise criteria and relative file references where authored. It **cannot** attest executable semantics. Verify runtime checks separately per affected lesson on actual MySQL/Django.

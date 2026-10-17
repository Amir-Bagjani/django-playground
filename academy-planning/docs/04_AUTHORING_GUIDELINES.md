# Authoring Guidelines — High-Quality Persian Lessons

## Editorial contract
- Persian (natural, precise) for explanations, exercise instructions, failure feedback and hints. English for standard code/API identifiers and UI chrome; code block/queries always LTR.
- Teach **mental model, why, when, how, what can go wrong, alternatives, performance/integrity consequences**. Define new terms before using them. Avoid shallow “API signature + one snippet = complete lesson” pattern.
- A short lesson can be deep if sequenced: split an oversized topic into a chain of smaller lessons. Do not suppress advanced topics for the sake of shortness.
- Give examples as *demonstrations only*. Exercises must demand learner-written work and contain different data/rules from the exact worked example.
- Keep Django/MySQL comparisons exact and explicitly mark where they do not map 1:1. Note version-specific, backend-specific and deprecated behavior. Verify generated SQL using targeted runtime examples.

## Minimum anatomy of a lesson
1. Title, scenario, objectives in observable verbs (“create”, “compare”, “debug”, “design”, “measure”).
2. Prerequisite links (informational only; lessons never locked).
3. Concept and why it exists; conceptual diagram where useful.
4. MySQL mechanism and SQL example + actual result/errors for chosen dataset.
5. Django ORM equivalent **if applicable** + migration/query SQL notes; do not invent matching syntax for unsupported behavior.
6. Critical options/API reference and edge cases (where appropriate use decision table).
7. Common mistakes and debugging tactics.
8. At least one real-world scenario and practical trade-offs.
9. Practice, Problem Solving and distinct Mastery challenge (all user-written).
10. Progressive hints and **public** acceptance criteria; instructor-only validator/reference solution separately.
11. Short recap, next recommended lessons, technical source links including version.

## Anti-patterns (reject publication)
- “Click Run to finish lesson”; starter contains complete implementation; tests merely check string presence; hardcoded result could pass; mastery repeats same exercise with renamed entities; feedback says “wrong” with no criterion; unsubstantiated performance claims; fake screenshots of schema; SQL reference contradicts MySQL version; ORM claims DB FK `ON DELETE` equals Django `on_delete` automatically.
- Copying book chapters/web material wholesale. References inform **originally authored** text and examples. Quote limits/license constraints apply.
- Running broad test suites or unrelated existing Django Playground tests for one content change.

## Practice vs Problem Solving vs Mastery
| Stage | What learner gets | What learner produces | Grading |
|---|---|---|---|
| Practice | compact requirement, a few starting scaffolds | a focused SQL/ORM/ERD solution | deterministic real behavior + precise criteria |
| Problem Solving | domain statement + some existing DB/data | combination of several concepts, debug and edge-case handling | multiple fixtures, incorrect-case checks |
| Mastery | novel domain/requirements, minimal hints | complete defensible design/code & rationale | independent scenarios, hidden boundary tests, engineering rubric |

## How to craft good progressive hints
- Hint 1: reframe failing *concept*, not syntax answer.
- Hint 2: narrow relevant mechanism or inspectable database property.
- Hint 3: identify precise decision or reference section to revisit (not copy-pastable solution).
- The exercise description must contain **all required behavior**; hidden cases cannot introduce previously undisclosed business rules.
- In mastery tasks fewer hints may be available, but failed criteria still need honest actionable feedback.

## Example quality bar
For a ForeignKey lesson: differentiate nullable FK, reverse relation, OneToOne vs OneToMany, `on_delete` choices, DB constraint behavior and migration SQL. Test both valid and orphan insert, delete behavior, nullable case and alternative design where appropriate. For DecimalField: compare decimal precision, max_digits/decimal_places, database DECIMAL and float hazards. For concurrency: show two sessions and an observed race, not a pretend single-process demo.

## Production process (not in-product AI)
1. Curriculum architect approves lesson objectives/outcome and source inventory.
2. Author researches official docs/approved books and drafts educational content + all three exercise levels.
3. Technical reviewer, in a **separate review pass**, checks code, version behavior, completeness, alternative valid solutions, safety.
4. Pedagogical reviewer checks challenge difficulty, conceptual sequence, hint leakage, clarity and alignment between objectives and checks.
5. Validator developer implements and runs real acceptance tests with passing and deliberately failing solutions, including boundary cases.
6. Only then set lesson `approved`; record reviewer/date/artifact evidence in release QA report.

## Review evidence template
```
lesson_id: DB-03-005
content_version: 1
technical_reviewer: <person-or-agent-run>
pedagogical_reviewer: <person-or-agent-run>
source_verified: [<URLs/book-editions>]
runtime_checked: <mysql/django versions or NOT RUN>
reference_solution: pass | not-run
negative_cases: <number passed / tested>
alternative_solutions: <number tested>
concerns: []
status: approved | changes-required
```

## Sources policy
Official version-pinned Django/MySQL docs are primary behavioral truth. Books inform explanations and design process, not code/version authority. References must link to real source sections and note what they support; do not fabricate citations. If a source cannot be verified, flag uncertainty and defer publication rather than guessing.

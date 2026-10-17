# Delivery Roadmap and Stage Gates

## Sequence
0. **Curriculum & content contracts** (this package): review against sources, lock topics and realistic effort. Deliverable: approved map; 176 planned lesson IDs are NOT shipped course content.
1. **PRD-01 Hub/Foundation:** existing Django lab preserved, Academy route, read-only approved content loader and local progress skeleton; no MySQL yet. Gate: choose lab, return Home, no old data loss.
2. **PRD-02 SQL/ORM first real lesson:** real MySQL + controlled Django evaluator; first aligned lesson authored and reviewed, learner writes 1 SQL and 1 ORM solution, receives genuine output. Gate: one complete user journey with failing test feedback. Limit generic abstractions.
3. **PRD-03 Grading:** reusable exercise types, 3-tier bank, real validators, hint access, progress derivation, content version policy. Gate: distinct valid/invalid submissions, bad fixture, independent mastery and persisted Completed/Mastered.
4. **PRD-04 ERD:** interactive read + user authored editable ERD with constrained engine and semantic grading; no generated one-click answer. Gate: create FK/relationship and evaluate alternative layout.
5. **PRD-05 Project checkpoints:** multi-stage project steps, isolated autosave, DB logical snapshot/restore and reset. Gate: stage 1→2, introduce failure, restore to verified stage with data & code coherent.
6. **PRD-06 Content packs/capstone:** pilot-reviewed chapter packs, expanding to full curriculum only as resources allow; staged projects and insurance final. Gate: each pack independently approved and actually tested, not claimed complete early.

## Delivery rules
- One PRD or one small content pack at a time, explicit owner approval before next.
- Use unchanged old runner test suites by default. Scope tests to Academy changes per `07_TEST_POLICY.md`.
- Communicate blockers with exact source/version/runtime evidence; do not fill gaps by invention.
- Commit self-contained changes; don't reset existing user examples or `down -v` volumes.
- Do not make visual screenshot testing a required proof. The owner manually checks UI.

## MVP success definition
Not a navigation mock: at least one **approved, complete Persian lesson** plus two real exercises (SQL and ORM), runnable locally on MySQL; user must write code; pass/fail reflects real results; optional hint, persisted progress; old Django lab fully functional. Depth-heavy hundreds of lessons and full designer are later deliveries, not gates for usable first slice.

## Realistic risk management
- Curriculum breadth may expand after technical source audit; record revisions, avoid silently relabeling planned as authored.
- Arbitrary Python/SQL execution has isolation limits on a local host; contain and document them.
- MySQL DDL/transaction semantics complicate checkpoints and rollback; prove restore before promising it.
- Exhaustive post-hoc auto-grading of open-ended architecture is infeasible without rubric/manual review; don't fake validation.
- Content production is a separate effort from engine engineering and should have review budgets.

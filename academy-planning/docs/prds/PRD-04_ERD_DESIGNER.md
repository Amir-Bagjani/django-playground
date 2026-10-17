# PRD 04 — Interactive ERD Viewer & Learner-authored Designer

**Dependencies:** PRD-03 (assessment contracts) + Academy UI shell. **Goal:** the learner sees and understands professional relational diagrams, then designs/edits diagrams and is evaluated on semantics, not pixel layout.

## User stories
- I click an example diagram table or relation and understand PK, FK, optionality, cardinality and SQL/Django counterparts.
- I create a table and column, mark PK/FK, draw 1:1 / 1:N / N:M connections and save the result.
- A design task evaluates relationships, required attributes and referential integrity with meaningful feedback, accepting multiple valid arrangements.

## Phase slices within this PRD
**Slice A — read/inspect:** visualize instructor-authored example graph; pan/zoom, selected entity detail, relationship labels in Crow's Foot style (or clearly equivalent notation), side pane shows model/SQL explanation. Run small acceptance check.

**Slice B — edit/build:** add/edit/remove tables, attributes and relationships; attribute data type, nullability, PK, unique and FK targets. Undo/redo using library support if practical, save draft to Academy namespace; Reset to exercise starter state. Use a mature graph library only if needed, no homegrown graphics engine.

**Slice C — grade:** turn graph JSON into semantic normalized representation, check relation direction/cardinality/optional participation, key/candidate-key requirements, no dangling references and application constraints. Position and appearance must not determine pass. For difficult open-ended designs, emit rubric and `needs_manual_review` where precise verification is impossible.

## Diagram document contract
`schema_version: 1` graph with stable entity/attribute/relation IDs; entity display names, column attributes, PK/FK metadata and cardinality. Node coordinates are presentation state only. Validate no duplicate identifier collisions, invalid references, cycles when task forbids them, impossible cardinality/nullable combinations for declared policy. **JSON is canonical**, image rendering is derivative.

## SQL/ORM mapping
Provide visual explanation of a teacher-approved relationship with sample SQL/MySQL DDL and Django Field definitions; do not grant “solution complete” from an automatic SQL generator. Diagram user must create the entities/relationships themselves. Optional generation of illustrative preview should never substitute manual source-code exercises.

## UX constraints
- UI English/LTR; Persian lesson text/feedback RTL; ERD canvas wide enough, zoom/pan and selected node inspector readable at narrow widths.
- Section is part of Academy, not legacy Django backend editor; preserve code drafts and navigation on return.
- Avoid tool palette with dozens of rare database-only options at outset; progressively show capabilities when relevant.
- Keyboard and mouse interaction accessible; no screenshot/visual-diff pipeline required.

## Acceptance Criteria
1. Given prepared simple Customer→Order diagram, user identifies correct FK side and optionality by clicking elements.
2. On a blank editor learner creates two entities, fields and 1:N relation with a required FK, save/reopen retains normalized graph.
3. Remove referenced entity shows confirm or blocks broken relation; no dangling IDs.
4. Two semantically equivalent ERDs with different canvas coordinates/arrangements both pass.
5. Wrong cardinality or missing unique/nullable constraint fails with a criterion and optional hint.
6. Reset affects current ERD draft only; course progress preserved. Old Django examples and storage unchanged.

## Out of scope
General-purpose production schema designer, collaboration, import/export DBML, automatically building finished project for user, fully automatic subjective architecture grading, ERD aesthetics perfection.

## Targeted verification
Graph JSON normalization schema cases, one real correct and one incorrect relationship submission, save/reset and focused UI typecheck. No legacy runner pytest; no screenshot/browser automation. At PRD delivery manual designer walkthrough by owner.

## Deliverables
Reusable lightweight ERD engine, read+edit interactions, grading criteria, persistence, tests run/skipped, any known ambiguity, commit; stop.

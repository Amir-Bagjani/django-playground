# Decision Log and Remaining Engineering Assumptions

## Approved by product owner — treat as binding

| ID | Decision |
|---|---|
| D01 | Product uses Playground Hub to select existing Django lab or new Academy; future playgrounds not built now. |
| D02 | Global UI English/LTR; Academy lesson/feedback Persian/RTL; code LTR. |
| D03 | Single-user/local-first, real Docker MySQL and Django ORM, no in-app AI. |
| D04 | SQL/MySQL and Django ORM taught **in parallel** from early lessons. |
| D05 | Curriculum-first: detailed complete blueprint, then content and implementation chapter by chapter. |
| D06 | Layered deep teaching: digestible lessons, no dropping advanced details merely for brevity. |
| D07 | Every subject needs learner-written SQL/ORM/ERD, genuine validation, first failed criterion, optional progressive hints. |
| D08 | Free access to every lesson; progress based on passed exercises, not viewed pages. |
| D09 | Three-tier exercise bank: Practice, Problem Solving, independent Mastery. |
| D10 | Automatic tests + engineering rubrics; valid alternative designs not incorrectly rejected. Unknown criteria may require manual review. |
| D11 | Independent small exercises alongside evolving multi-milestone projects. |
| D12 | Auto-save drafts, stage checkpoint upon pass, restore/reset working state without erasing learning progress. |
| D13 | Both read-only interactive ERDs and later user-created/editable ERDs. |
| D14 | Multi-domain projects + one final insurance claims/policy management capstone (domain selected by assistant as delegated). |
| D15 | Independent technical and pedagogical review, run true examples/validators before publishing. |
| D16 | Academy and existing Django Playground isolated in test selection: do not run legacy tests on Academy-only changes. |
| D17 | Avoid screenshot/browser automation, massive test suites and speculative architecture in normal iterations. |
| D18 | Training target is Django 6.1.x (non-LTS) + MySQL 8.4; add a review/migration plan to Django 6.2 LTS after its official release (docs/02 "Framework version plan"). Docs and examples must match the released version actually installed, never an unreleased dev build. |

## Proposed engineering assumptions — validate against actual repo before implementation

| ID | Proposal | Revisit condition |
|---|---|---|
| A01 | Continue existing Next.js UI and add `/playgrounds/database-orm` route. | Actual source tree conflicts. |
| A02 | Introduce `academy-runner` control boundary and internal MySQL 8.4 Docker service, only in PRD-02. | Existing runner already has clean, equally isolated plugin boundary. |
| A03 | Content as Code: curriculum YAML, Persian Markdown + YAML frontmatter, JSON exercises, instructor-only validators. | Content ingestion proves cumbersome in first vertical slice. |
| A04 | Separate disposable training schema/database per exercise run, allowlisted identifiers, controlled execution with timeouts. | Resource use warrants pooling later. |
| A05 | Store progress in small local SQLite/JSON persistence independent of lesson MySQL and old examples. | Existing reliable local store could be reused without coupling. |
| A06 | React Flow for ERD if no suitable library already installed; JSON as source of truth. | Existing UI infrastructure suffices. |
| A07 | MySQL 8.4, Django 6.1 are training targets, exact image/package versions pinned after verification. | Compatibility/policy/documentation or host platform limitation; re-evaluate at Django 6.2 LTS release (see D18). |
| A08 | No 'general code execution' with raw host shell; use controlled runner workspaces. | More powerful exercise types demand separate redesign. |

## Conflicts resolved
- Older Django Playground PRD described Persian RTL UI. User later explicitly selected **English LTR**. New explicit decision wins.
- Earlier Django Playground did **not** have tutorials; that remains true for the freeform lab. The **new Academy** is a distinct tutorial-based module.
- User requests complete education content but *not all authored at once*: complete approved curricular map first, then reviewed and tested chapter content packs.

## Stop-and-ask conditions for agent
Missing Docker access for required runtime test; inability to keep storage/execution separate; destructive migration to existing user data; ambiguous versioned behavior that would make published material inaccurate. For routine design details, select the simplest viable option and record it.

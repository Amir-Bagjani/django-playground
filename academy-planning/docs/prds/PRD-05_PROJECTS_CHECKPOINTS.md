# PRD 05 — Progressive Projects, Autosave & Reliable Checkpoints

**Dependencies:** PRD-02/03 working execution + PRD-04 ERD. **Goal:** user independently builds evolving projects through milestone requirements and reliably restores complete working state after mistakes.

## User stories
- I build small/medium projects through meaningful steps: ERD → schema → ORM → queries → transactions → performance; each stage introduces realistic new requirements.
- I stop today and resume tomorrow with code/SQL/ERD and DB state intact.
- I make a destructive mistake; I can return to last **passed** checkpoint without destroying older progress achievements or unrelated projects.

## Scope
1. Project manifest stable ID, milestones, learning objectives, accepted validation criteria, business requirements versions, suggested prereqs, per-stage entry fixtures.
2. Project working state isolation keyed project/run ID: files, queries, ERD and dedicated MySQL schema; auto-save drafts with debouncing and Save failure UI, not silently dropping data.
3. Milestone completion triggers relevant SQL/ORM/ERD validators + explicit engineering rubric; create Checkpoint only when milestone criteria pass. Checkpoint label/version/time and hashes recorded in dedicated Academy persistence.
4. Snapshot contains code/SQL files, ERD graph, logical MySQL schema + data (dump or rebuildable equivalent), migration state and manifest version. **Must verify restore on real MySQL**, not assume DDL transactional rollback.
5. Restore workflow: show preview and confirmation; build candidate replacement schema from snapshot, verify schema and expected count/references/constraints, switch active workspace on full success; on failure keep previous active state and show error.
6. `Reset Exercise` restores independent starter only; `Reset Project Working State` targets selected project; neither deletes pass/completion records. Distinguish destructive reset from Restore Checkpoint.
7. Ship one real multi-stage guided project (Blog/Library or small Booking) through at least three sequential milestones with evolving requirements and a verified restore after failure.

## Engineering acceptance
- Two projects can exist simultaneously in local persistence even if only one active runner at a time; cannot overwrite each other's data.
- Hidden grader reference solutions excluded from checkpoint exports and public clients.
- Checkpoint schema migrations/version compatibility checked before applying outdated snapshot. If incompatible, offer explicit error and non-destructive fallback.
- Content ID/version changes do not rewrite a user's code without explicit confirmation.

## Acceptance Criteria
1. Create project, finish Milestone 1, persist checkpoint with valid code + ERD + DB rows; next milestone adds a table or constraint.
2. Restart Docker; code/data/ERD for current project and checkpoint metadata persist.
3. Break schema or delete records in current project; restore checkpoint recovers earlier coherent DB, ERD and code.
4. Intentionally corrupt checkpoint or force restore failure: active project state remains unchanged, no false success.
5. Reset does not erase pass history or sibling project data.
6. Modified milestone with unpassed acceptance cannot generate “passed” checkpoint.
7. Checkpoint process does not use `docker compose down -v` or rely on `ROLLBACK` to undo MySQL DDL.

## Scope limits
No Git-style history browser/diff of every keystroke, no cloud backup, no multiuser collaboration, no multi-container-per-milestone, no full backend code scaffold generator that solves the exercise.

## Verification
Targeted Academy project/checkpoint integration on real MySQL + corruption/rollback case; relevant types/UI. Skip legacy Django runner tests, heavy browser automation and unrelated content checks.

## Deliverables
One usable multistep project, snapshot restore evidence, API/progress docs, targeted test list, limitations, commit, await approval.

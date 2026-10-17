# PRD 01 — Playground Hub & Academy Foundation

**Dependencies:** approved Curriculum v1; old Django Playground code inspected. **No new Docker service required in this PRD.**  
**Primary outcome:** user enters application, selects Django Backend or Academy, browses a real content outline in English/LTR shell with Persian/RTL lesson text, and returns without loss of legacy state.

## User stories
- As a developer, I want to choose among available playgrounds at Home; I don't want to land automatically in an unrelated lab.
- As a learner, I want an organized list of modules, lessons and objectives, with all lessons browsable regardless of prerequisites.
- As a maintainer, I want to add a future authored lesson by file, not hardcode JSX for each lesson.

## Scope
1. Hub route `/`, cards for existing **Django Backend Playground** and **Database & ORM Academy**. Only actually available cards are clickable; future modules can be omitted entirely.
2. Existing Django Playground reachable at `/playgrounds/django`. Preserve existing deep links or redirect safely. Existing edited files/example database/import/export unaffected.
3. Academy route `/playgrounds/database-orm`: module/course outline loaded from `curriculum.yaml`; course metadata, lesson statuses (`planned`, `draft`, `approved`); only approved lesson pages active/usable, planned lessons may show transparent `Planned` status rather than fictional material. All **available** lessons accessible freely.
4. Read and display a verified `lesson.fa.md` with Markdown/YAML frontmatter; Persian content RTL, SQL/Python fences LTR, safe Markdown without arbitrary executable HTML/JS.
5. Minimal navigation (Home, syllabus, lesson, next/previous recommended), breadcrumbs and empty/loading/error states. Small progress **placeholder only if clearly labeled** until PRD-03 persists progress; do not fabricate percent.
6. Source-of-truth stable IDs from Curriculum; static file validation command documented; no Content CMS, authentication, cloud or complex client store.

## Content wiring
- Structured loader validates YAML and lesson frontmatter schema at build/content-validation time; fails clearly on invalid IDs or references.
- Broken/missing content must not crash the whole app; show diagnostic to developer and mark lesson unavailable.
- Only approved content shown as published. A bundled **draft sample** is for developer demonstration until QA; avoid misrepresenting it as final.
- Use explicit whitelist of allowed Markdown content components; do not permit raw imported JSX or scripts.

## API/data impact
Reuse Next.js local server rendering of repo files for static content; adding a database-backed course API in PRD-01 is not justified. Keep Academy progress state placeholder separate from Django Playground storage. Legacy runner endpoints untouched.

## Acceptance Criteria
1. Visiting `/` shows both module cards with honest availability; Django card opens existing app successfully.
2. Returning Home and re-entering Django preserves active example and saved state.
3. Academy shows 16 planned modules with stable IDs and correct planned-vs-approved status; no false `Complete` label.
4. Developer-only draft preview renders Persian RTL text, with an explicit Draft label and no published/completed claim; fenced Python/SQL remains LTR; scripts in lesson HTML cannot execute. An approved lesson becomes public only after real independent review and later runtime verification.
5. Changing order of YAML lessons changes Academy navigation without editing React view.
6. Missing/duplicate lesson ID causes clear content-validation failure, not silent override.
7. No MySQL server, AI, new code runner, ERD designer, hidden-in-app authoring console or changes to old Django runner.

## Targeted verification (never full old suite)
- `python scripts/validate_content.py` for content skeleton.
- Relevant Hub/Academy route tests and TypeScript typecheck of affected web package. Manual navigation smoke; **no screenshots**.
- Test old Django route using smallest smoke only if route mapping changed; do **not** run old `runner` 39+ pytest suite for frontend-only Academy work.

## Delivery output
Routes/files changed, content loader documentation, exact tests run/skipped, any legacy routing changes, commit hash; **stop** before PRD-02.

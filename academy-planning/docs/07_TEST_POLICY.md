# Test Isolation and Build Policy — MUST FOLLOW

## Core rule
**An Academy-only content change must NOT rerun existing Django Backend Playground pytest suite or full monorepo E2E.** Conversely, changes confined to old playground do not run Academy tests. Prefer a small meaningful runtime check to a large number of redundant tests.

## Test selection matrix
| Scope changed | Run | Avoid by default |
|---|---|---|
| Text/metadata of one Academy lesson | `validate_content.py --lesson <id>` + content lint/reviewer check | Legacy runner pytest, all Academy validators, full web build |
| Academy exercise/validator | Affected exercise validator tests with real DB; relevant content static checks | Other lessons' tests, legacy pytest, browser screenshot |
| Academy SQL/ORM runtime shared code | Relevant Academy SQL/ORM integration tests + content smoke of affected exercise types | Legacy pytest unless shared contract changes |
| ERD-only UI | Relevant component unit / schema checks, targeted typecheck | DB-heavy suite, unrelated tests |
| Academy route/UI | Focused UI test and Academy package typecheck; production build at agreed PRD delivery | All old runner integration tests |
| Shared BFF/component/Compose contract | Targeted affected tests in **both** modules | Whole repo suite except final release gate |
| Milestone final/release | Full scoped Academy regression + smallest legacy smoke that checks shared boundary; broader suite only if warranted | Automatic all-suite after every commit |

## Practical commands (examples, adapt to actual repo)
```
python scripts/validate_content.py --lesson DB-03-005
python -m pytest academy/tests/test_sql_evaluator.py -q
python -m pytest academy/tests/test_orm_evaluator.py -q
# NEVER as routine Academy-only step:
# docker compose exec runner python -m pytest -v
```
These pytest paths are **future proposed paths**, not existing tests. The static validation command in package can be run now if dependencies are installed.

## Test quality > volume
For changed validator run: 1 real valid solution, 2 distinct invalid cases and relevant edge fixture; include multi-valid-solution check if rubric allows. No golden-file test of every Persian paragraph. Avoid sleeps/network for deterministic checks. Keep a per-PRD time budget and note any deferred slow tests.

## Browser and screenshot policy
No screenshots, visual-diff toolchains, browser recording or prolonged UI automation in normal deliveries; owner manually checks UI. Lightweight interaction tests only if already present or essential to avoid major data-loss regression.

## CI future paths
Monorepo path filters may run Academy suite on `academy/**` / `content/**` changes; legacy tests on `runner/**`, cross-module smoke on `web/shared/**`, Compose config or integration interfaces. Path filters are *optimization*, not excuse to skip risk-relevant tests.

## Reporting required after each task
```
Touched modules: ...
Executed tests (exact commands): ...
Skipped tests and why: ...
Runtime verified on real Docker/MySQL? YES/NO
Known unverified items: ...
```
Never describe mocks, JSON syntax checks or build success as equivalent to executing real MySQL/Django behavior.

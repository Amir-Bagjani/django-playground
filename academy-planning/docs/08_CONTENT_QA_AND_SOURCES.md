# Content QA, Source Policy and Review Workflow

## Trusted primary references (reviewed October 2026)

- Django 6.1 database docs: https://docs.djangoproject.com/en/6.1/topics/db/
- Django Model Fields: https://docs.djangoproject.com/en/6.1/ref/models/fields/
- Django QuerySet reference: https://docs.djangoproject.com/en/6.1/ref/models/querysets/
- Django model options: https://docs.djangoproject.com/en/6.1/ref/models/options/
- Django migrations: https://docs.djangoproject.com/en/6.1/topics/migrations/
- Django MySQL backend/transaction isolation: https://docs.djangoproject.com/en/6.1/ref/databases/
- Django transactions: https://docs.djangoproject.com/en/6.1/topics/db/transactions/
- MySQL 8.4 reference manual: https://dev.mysql.com/doc/refman/8.4/en/
- MySQL implicit commits: https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html
- MySQL InnoDB isolation: https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html
- MySQL InnoDB locking: https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-transaction-model.html
- Exercism content packaging: https://exercism.org/docs/building/tracks/practice-exercises
- Exercism config: https://exercism.org/docs/building/tracks/config-json
- Open edX content hierarchy: https://docs.openedx.org/en/latest/educators/olx/organizing-course/course-structure-overview.html

Books recommended for design methodology (not verbatim redistribution): Michael J. Hernandez, *Database Design for Mere Mortals* (4th edition); Ramez Elmasri / Shamkant Navathe, *Fundamentals of Database Systems* (7th edition); Silberschatz/Korth/Sudarshan, *Database System Concepts* (where suitable). Confirm specific edition/chapter before asserting a book covers a narrow behavior. Runtime/API truth takes priority over a textbook example tied to another database/version.

## Review gate per lesson (required)
1. **Coverage:** all learning objective IDs appear in explanation and at least one actual exercise criterion; all target concepts covered. Non-goal topics explicitly cross-referenced if deferred.
2. **Accuracy:** statements backed by source + Django/MySQL version; no false SQL/ORM equivalence; code/data runtime-checked.
3. **Pedagogy:** lesson starts from problem, builds mental model, uses worked examples then removes scaffolding; suitable Persian wording and common pitfalls.
4. **Exercise:** learner writes meaningful solution; published criteria coherent; hidden tests don't add undisclosed requirements; no copyable final answer in starter/hints.
5. **Validator:** reference works; wrong code fails; valid alternatives accepted; timeout/system failure not confused with wrong answer.
6. **Safety/data:** disposable schema; no credentials in lesson/content; SQL and Python execution only via controlled lab.
7. **Independent review:** technical and educational separate review passes, findings resolved, reviewer/signoff recorded.

## Suggested evidence table
| Field | Expected evidence |
|---|---|
| Lesson and version | stable ID + lesson content/validator version |
| References | exact URLs/book edition used; note unverifiable claims |
| Coverage | lesson-objective-to-exercise criterion matrix |
| Real execution | MySQL/Django versions; command and summary, no fabricated success |
| QA | one positive and multiple negative/edge cases, alternative valid approach |
| Editorial | reviewer notes, fixes, final `approved` status |

## Source hygiene and copyright
Use primary official docs as technical authorities. Write original Persian instructional prose and original example domains. Link to sources and cite accurately; do not paste long passages from textbooks or paid courses. Keep proprietary book PDFs out of publicly distributed packages. If user supplies a book later, first inspect its contents and copyright constraints and decide what can be extracted/paraphrased.

## Lessons are NOT complete when
Only title/objectives exist in YAML; only text has been authored; tests have not run on real DB; source versions are mismatched; educator review is missing; a complex ERD can only be evaluated by exact names/positions; author marked complete without independent review.

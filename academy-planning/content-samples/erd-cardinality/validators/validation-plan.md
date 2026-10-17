# Instructor-only validation plan — DB-03-002 (ERD cardinality)

This file documents the **real** checks implemented by `academy-runner` for the
ERD exercise of lesson `DB-03-002`. It is not shipped to the learner UI.

## Registered exercise (exact id / validator / level / kind)

| exercise id | validator id | version | level | kind | dataset | required for Completed |
|---|---|---|---|---|---|---|
| `erd-customer-order` | `erd-schema-validator` | 1 | practice | erd | — | yes |

The runner only treats the exercise as executable when the manifest's `kind`,
`level`, `lesson_id` and `validator.id`/`validator.version` match the coded
registry exactly. `validator.version` is the **assessment version** stored with
a pass. The ERD reference design lives in `app/erd_checks.py` and is never
returned to the browser.

## Submission document contract

The submission is a **graph document** (`schema_version: 1`), not an image:

```json
{
  "schema_version": 1,
  "entities": [
    { "id": "e1", "name": "customers",
      "attributes": [
        { "id": "a1", "name": "id", "type": "INT", "nullable": false, "primaryKey": true, "unique": true }
      ] }
  ],
  "relationships": [
    { "id": "r1", "fromEntityId": "e1", "toEntityId": "e2",
      "fromCardinality": "one", "toCardinality": "many",
      "optionality": "mandatory", "foreignKeyAttributeId": "a5" }
  ],
  "notes": "اختیاری: توضیح طراحی (بازبینی دستی)"
}
```

Entity/attribute coordinates are **presentation state only** and are ignored by
validation. `JSON` is canonical; the rendered diagram is derivative.

## Checks (structural, never an exact JSON match)

- `required-entities` — `customers` and `orders` exist. Matching normalizes case
  and separators and accepts singular/plural and configured synonyms.
- `required-attributes` — required columns exist with a compatible type family
  (`email`/`full_name` text, `total` numeric, `customer_id` present). Type
  spelling (`INT`, `bigint`, `INTEGER`) is normalized to a family.
- `primary-keys` — each required entity has exactly one primary key, and it is
  the `id` column.
- `unique-constraint` — `customers.email` is `UNIQUE` **and** not nullable.
- `relationship-cardinality` — a relationship connects the two entities with the
  `many` end on `orders` and `optionality: "mandatory"`. Either drawing direction
  is accepted as long as the semantics are a mandatory one-to-many.
- `foreign-key` — the relationship's `foreignKeyAttributeId` is the `customer_id`
  column of `orders`.
- `referential-integrity` — no relationship points at a missing entity and no FK
  attribute is dangling.
- `design-rationale` — `evaluation: "manual"`: reported as `needs_manual_review`,
  never called wrong and never affecting `passed`.

**Multiple valid designs pass:** different entity/column names (within the
synonym set), singular/plural, casing, different numeric types, different node
positions, extra tables/columns, and either drawing direction.

## Structured evaluation contract

`evaluate` returns `status`, `outcome`, `passed`, `assessmentVersion`, per-check
`{criterionId, status, messageFa, location?, hintAvailable}` and an empty
`result` (ERD has no rowset). Criterion statuses: `passed`, `failed`,
`needs_manual_review`, `not_evaluated`.

- Fixable design problems (missing table/column/key, wrong cardinality, dangling
  FK) are **criterion failures** (`status: failed`, `outcome: validation_failed`).
- Malformed input (not an object, wrong `schema_version`, duplicate identifiers)
  is a distinct learner error: `status: error`, `outcome: invalid_graph`, with a
  specific Persian message. It is never a `system_error`.

## Persistence

The learner's draft is stored in the same app-owned SQLite progress store
(`PUT /v1/exercises/{id}/draft`, read back with `GET`). `Reset` clears **only**
the draft and returns to the starter graph; it never removes a pass or a revealed
hint. A successful `Check Solution` records a pass through the same progress
system as the SQL/ORM exercises, so `DB-03-002` becomes **Completed**.

## Validator QA cases required before publish
- A correct design passes on the real runner (no MySQL needed).
- Two semantically equivalent designs with different names/positions both pass.
- Wrong cardinality, a missing `UNIQUE`, and a missing/FK-on-wrong-side design
  each fail with the matching criterion.
- Malformed JSON and an unknown `schema_version` return `invalid_graph`.
- `Reset` restores the starter draft and leaves the pass intact.

## Not implemented here (deferred)
Project Checkpoint/Snapshot (PRD-05), automatic ERD→SQL/Django migration
generation, import/export and collaborative editing remain out of scope.

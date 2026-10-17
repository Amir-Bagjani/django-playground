# Academy content loader

`academy-content.json` is a **generated** bundle consumed by the Academy routes
(`/playgrounds/database-orm`). It is committed so the Docker web image — whose build
context is `web/` only — needs no YAML parser and no access to the repository root at
runtime.

## Regenerating

Run from the repository root after any curriculum or lesson change:

```bash
python academy-planning/scripts/generate_web_content.py
```

It reads:

- `academy-planning/curriculum/curriculum.yaml` — module/lesson outline (IDs, order, status).
- `academy-planning/content-samples/**/lesson.fa.md` — authored lesson bodies + frontmatter.
- `academy-planning/content-samples/**/exercises/*/exercise.json` — public exercise
  metadata (title, instructions, starter, public criteria, hints) for the interactive lab.

and writes `web/lib/academy-content.json`. Only exercises whose lesson is authored *and*
`approved` are embedded as `lab_lessons`, so the interactive lab appears only for verified
lessons. Instructor-only validators never leave the academy-runner. The generator **fails
non-zero** on duplicate module/lesson IDs or an authored lesson whose ID is absent from the
curriculum, so broken content cannot be published silently. Changing lesson order in the YAML
and re-running the script updates the Academy navigation without editing React.

`lib/academy.ts` wraps the JSON with types and helpers (`getLessonLocation`, `isAuthored`,
`getLabExercises`). The lesson page mounts `<LessonLab exercises={…} />` when a lesson has lab
exercises; execution/check/reset are delegated to the academy-runner over `/api/academy/*`.
The full authoring-level validator remains `academy-planning/scripts/validate_content.py`.

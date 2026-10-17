# Agent Handoff Prompts

Use in strict order:

1. **`00_CURRICULUM_REVIEW_PROMPT.md`**: verify complete syllabus (no coding).
2. **`01_START_IMPLEMENTATION_PROMPT.md`**: implement PRD-01 only after curriculum approval.
3. For PRD-02 to PRD-06 repeat `02_PHASE_IMPLEMENTATION_TEMPLATE.md` substituting exactly one approved PRD path.
4. For each small authored batch use `03_CONTENT_AUTHOR_PROMPT.md`, then independent `04_CONTENT_REVIEW_PROMPT.md`.

Prompts are explicitly restricted to one batch/PRD and targeted tests. Do NOT give agent all six PRDs and ask it to complete everything in one run.

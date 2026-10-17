"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Editor, { loader } from "@monaco-editor/react";

import type {
  AcademyProject,
  ErdEntity,
  ErdGraph,
  ErdRelationship,
  LabHint,
  ProjectMilestone,
  ProjectProgress,
  ProjectWorkspaceState,
} from "@/lib/academy";

import { Markdown } from "../../../../components/markdown";
import { ErdCanvas } from "../../erd/erd-canvas";
import { cloneGraph, editorIssues, emptyGraph, newId, parseGraph } from "../../erd/graph";
import styles from "../project.module.css";

loader.config({ paths: { vs: "/monaco/vs" } });

interface EvaluationCheck {
  criterionId: string;
  status: "passed" | "failed" | "needs_manual_review" | "not_evaluated";
  messageFa: string;
  location?: { file?: string; line?: number } | null;
  hintAvailable: boolean;
}

interface EvaluationResult {
  status: "passed" | "failed" | "error" | "timeout" | "system_error";
  outcome: string;
  passed: boolean;
  checks: EvaluationCheck[];
  error: string | null;
  progress?: ProjectProgress;
  checkpointId?: string;
}

const CHECK_MARK: Record<EvaluationCheck["status"], { glyph: string; className: string }> = {
  passed: { glyph: "✓", className: styles.markPass },
  failed: { glyph: "✗", className: styles.markFail },
  needs_manual_review: { glyph: "…", className: styles.markManual },
  not_evaluated: { glyph: "•", className: "" },
};

const TYPE_OPTIONS = ["INT", "BIGINT", "VARCHAR(120)", "VARCHAR(160)", "TEXT", "DECIMAL(12,2)", "DATE", "BOOLEAN"];

const STAGE_LABEL: Record<string, string> = { erd: "ERD", sql: "SQL", orm: "Django ORM" };

async function callApi(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return { status: "system_error", error: `پاسخ نامعتبر از سرور (HTTP ${response.status}).` };
  }
}

function starterFor(project: AcademyProject, stage: string): string {
  const milestone = project.milestones.find((item) => item.stage_kind === stage);
  return milestone?.starter[0]?.content ?? "";
}

function initialWorkspace(project: AcademyProject, stored: ProjectWorkspaceState | null): ProjectWorkspaceState {
  return {
    erd: stored?.erd ?? parseGraph(starterFor(project, "erd")) ?? emptyGraph(),
    sql: stored?.sql ?? starterFor(project, "sql"),
    orm: stored?.orm ?? starterFor(project, "orm"),
    notes: stored?.notes ?? "",
  };
}

function cardinalityFrom(side: string): ErdRelationship["fromCardinality"] {
  return side === "many" ? "many" : "one";
}

function labelFromRelation(relationship: ErdRelationship): string {
  return `${relationship.fromCardinality === "one" ? "1" : "N"}:${relationship.toCardinality === "one" ? "1" : "N"}`;
}

export function ProjectWorkspace({ project }: { project: AcademyProject }) {
  const executable = useMemo(
    () => project.milestones.filter((milestone) => milestone.executable),
    [project.milestones],
  );

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ProjectWorkspaceState>(() => initialWorkspace(project, null));
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [currentMilestoneId, setCurrentMilestoneId] = useState<string>(executable[0]?.id ?? "");
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, LabHint[]>>({});

  const savedRef = useRef<string>("");

  const active: ProjectMilestone | undefined = useMemo(
    () => project.milestones.find((milestone) => milestone.id === currentMilestoneId),
    [project.milestones, currentMilestoneId],
  );

  // Load persisted workspace + progress on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await callApi("GET", `/api/academy/v1/projects/${project.id}`);
      if (cancelled) return;
      const workspace = (data.workspace as { state?: ProjectWorkspaceState; currentMilestone?: string } | undefined) ?? {};
      const next = initialWorkspace(project, workspace.state ?? null);
      setState(next);
      savedRef.current = JSON.stringify(next);
      if (workspace.currentMilestone) setCurrentMilestoneId(workspace.currentMilestone);
      if (data.progress) setProgress(data.progress as ProjectProgress);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  // Debounced auto-save so a refresh or restart never loses the workspace.
  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(state);
    if (serialized === savedRef.current) return;
    setSaveState("saving");
    const handle = setTimeout(async () => {
      await callApi("PUT", `/api/academy/v1/projects/${project.id}/workspace`, {
        state,
        currentMilestone: currentMilestoneId,
      });
      savedRef.current = serialized;
      setSaveState("saved");
    }, 800);
    return () => clearTimeout(handle);
  }, [state, ready, project.id, currentMilestoneId]);

  const updateGraph = useCallback((mutate: (draft: ErdGraph) => void) => {
    setState((prev) => {
      const base = prev.erd ?? emptyGraph();
      const next = cloneGraph(base);
      mutate(next);
      return { ...prev, erd: next };
    });
  }, []);

  const erd = state.erd ?? emptyGraph();
  const selectedEntity = useMemo(
    () => erd.entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [erd.entities, selectedEntityId],
  );
  const issues = useMemo(() => editorIssues(erd), [erd]);

  const moveEntity = (id: string, position: { x: number; y: number }) =>
    updateGraph((draft) => {
      const entity = draft.entities.find((item) => item.id === id);
      if (entity) entity.position = position;
    });

  const connectEntities = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    updateGraph((draft) => {
      const many = draft.entities.find((item) => item.id === toId);
      const fk = many?.attributes.find((attribute) => !attribute.primaryKey) ?? null;
      draft.relationships.push({
        id: newId("r"),
        fromEntityId: fromId,
        toEntityId: toId,
        fromCardinality: "one",
        toCardinality: "many",
        optionality: "mandatory",
        foreignKeyAttributeId: fk?.id ?? null,
      });
    });
  };

  const addTable = () => {
    const entity: ErdEntity = {
      id: newId("e"),
      name: `table_${erd.entities.length + 1}`,
      attributes: [{ id: newId("a"), name: "id", type: "INT", nullable: false, primaryKey: true, unique: true }],
    };
    updateGraph((draft) => {
      draft.entities.push(entity);
    });
    setSelectedEntityId(entity.id);
  };

  const renameEntity = (id: string, name: string) =>
    updateGraph((draft) => {
      const entity = draft.entities.find((item) => item.id === id);
      if (entity) entity.name = name;
    });

  const deleteEntity = (id: string) =>
    updateGraph((draft) => {
      draft.entities = draft.entities.filter((entity) => entity.id !== id);
      draft.relationships = draft.relationships.filter(
        (relationship) => relationship.fromEntityId !== id && relationship.toEntityId !== id,
      );
    });

  const addColumn = (entityId: string) =>
    updateGraph((draft) => {
      const entity = draft.entities.find((item) => item.id === entityId);
      entity?.attributes.push({
        id: newId("a"),
        name: `column_${(entity?.attributes.length ?? 0) + 1}`,
        type: "INT",
        nullable: true,
        primaryKey: false,
        unique: false,
      });
    });

  const updateColumn = (entityId: string, attributeId: string, patch: Partial<ErdEntity["attributes"][number]>) =>
    updateGraph((draft) => {
      const entity = draft.entities.find((item) => item.id === entityId);
      const attribute = entity?.attributes.find((item) => item.id === attributeId);
      if (attribute) Object.assign(attribute, patch);
    });

  const deleteColumn = (entityId: string, attributeId: string) =>
    updateGraph((draft) => {
      const entity = draft.entities.find((item) => item.id === entityId);
      if (entity) entity.attributes = entity.attributes.filter((item) => item.id !== attributeId);
      for (const relationship of draft.relationships) {
        if (relationship.foreignKeyAttributeId === attributeId) relationship.foreignKeyAttributeId = null;
      }
    });

  const addRelationship = () => {
    const [first, second] = erd.entities;
    if (first && second) connectEntities(first.id, second.id);
  };

  const updateRelationship = (id: string, patch: Partial<ErdRelationship>) =>
    updateGraph((draft) => {
      const relationship = draft.relationships.find((item) => item.id === id);
      if (relationship) Object.assign(relationship, patch);
    });

  const deleteRelationship = (id: string) =>
    updateGraph((draft) => {
      draft.relationships = draft.relationships.filter((item) => item.id !== id);
    });

  const setNotes = (notes: string) => setState((prev) => ({ ...prev, notes }));

  const doEvaluate = useCallback(async () => {
    if (!active) return;
    setBusy("evaluate");
    try {
      const data = await callApi(
        "POST",
        `/api/academy/v1/projects/${project.id}/milestones/${active.id}/evaluate`,
        { state },
      );
      const payload = data as unknown as EvaluationResult;
      setEvaluation(payload);
      if (payload.progress) setProgress(payload.progress);
      // Persist the just-evaluated content locally too.
      savedRef.current = JSON.stringify(state);
      setSaveState("saved");
    } finally {
      setBusy(null);
    }
  }, [active, project.id, state]);

  const doHint = useCallback(async () => {
    if (!active) return;
    setBusy("hint");
    try {
      const shown = hints[active.id] ?? [];
      const data = await callApi(
        "POST",
        `/api/academy/v1/projects/${project.id}/milestones/${active.id}/hints/next`,
        { revealed: shown.length },
      );
      const hint = data.hint as LabHint | null;
      if (hint) setHints((prev) => ({ ...prev, [active.id]: [...(prev[active.id] ?? []), hint] }));
    } finally {
      setBusy(null);
    }
  }, [active, project.id, hints]);

  const doRestoreCheckpoint = useCallback(async () => {
    if (!active) return;
    const checkpointAvailable = progress?.milestones[active.id]?.checkpointAvailable;
    if (!checkpointAvailable) return;
    const ok = window.confirm(
      "Restore the last valid checkpoint for this milestone? This replaces the current workspace and the milestone database with the checkpointed state. Your progress and other milestones are not affected.",
    );
    if (!ok) return;
    setBusy("restore");
    try {
      const data = await callApi(
        "POST",
        `/api/academy/v1/projects/${project.id}/checkpoints/${active.checkpoint_id}/restore`,
      );
      if (data.status === "ok") {
        const workspace = data.workspace as { state?: ProjectWorkspaceState; currentMilestone?: string };
        const next = initialWorkspace(project, workspace.state ?? null);
        setState(next);
        savedRef.current = JSON.stringify(next);
        setEvaluation(null);
        setSelectedEntityId(null);
      } else {
        setEvaluation({ status: "system_error", outcome: "restore_failed", passed: false, checks: [], error: String(data.detail ?? data.error ?? "بازگردانی ناموفق بود.") });
      }
      const refreshed = await callApi("GET", `/api/academy/v1/projects/${project.id}`);
      if (refreshed.progress) setProgress(refreshed.progress as ProjectProgress);
    } finally {
      setBusy(null);
    }
  }, [active, progress, project]);

  const doReset = useCallback(async () => {
    const ok = window.confirm(
      "Reset the workspace to the starter for this project? This clears your current drafts and the project databases. Earned progress and checkpoints are kept.",
    );
    if (!ok) return;
    setBusy("reset");
    try {
      const data = await callApi("POST", `/api/academy/v1/projects/${project.id}/reset`);
      const workspace = (data.workspace as { state?: ProjectWorkspaceState } | undefined) ?? {};
      const next = initialWorkspace(project, workspace.state ?? null);
      setState(next);
      savedRef.current = JSON.stringify(next);
      setEvaluation(null);
      setSelectedEntityId(null);
      if (data.progress) setProgress(data.progress as ProjectProgress);
    } finally {
      setBusy(null);
    }
  }, [project]);

  const milestoneState = progress?.milestones ?? {};
  const checkById = new Map(evaluation?.checks.map((check) => [check.criterionId, check]) ?? []);
  const shownHints = active ? hints[active.id] ?? [] : [];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <a href="/playgrounds/database-orm">Database &amp; ORM Academy</a>
          <span>/</span>
          <span>Projects</span>
        </nav>

        <header className={styles.header}>
          <h1 className={styles.projectTitle}>{project.title_fa}</h1>
          <p className={styles.projectTitleFa} dir="rtl" lang="fa">
            {project.description_fa}
          </p>
          <div className={styles.summary}>
            <span className={styles.chip}>{project.domain}</span>
            <span className={styles.chip}>
              {progress?.totals.passedMilestones ?? 0}/{progress?.totals.executableMilestones ?? executable.length} milestones
            </span>
            <span className={styles.chip}>{progress?.totals.checkpoints ?? 0} checkpoints</span>
          </div>
        </header>

        <div className={styles.roadmap} role="tablist" aria-label="Milestones">
          {project.milestones.map((milestone, index) => {
            const stateInfo = milestoneState[milestone.id];
            const locked = milestone.executable && stateInfo ? !stateInfo.available && !stateInfo.passed : false;
            const passed = Boolean(stateInfo?.passed);
            return (
              <button
                key={milestone.id}
                type="button"
                role="tab"
                aria-selected={milestone.id === currentMilestoneId}
                disabled={!milestone.executable || locked}
                className={`${styles.step} ${milestone.id === currentMilestoneId ? styles.stepActive : ""} ${
                  passed ? styles.stepPassed : ""
                } ${locked ? styles.stepLocked : ""}`}
                onClick={() => {
                  setCurrentMilestoneId(milestone.id);
                  setEvaluation(null);
                  setSelectedEntityId(null);
                }}
              >
                <span className={styles.stepMeta}>
                  {index + 1}. {milestone.executable ? STAGE_LABEL[milestone.stage_kind] ?? milestone.stage_kind : "planning"}
                  {passed ? " · ✓" : locked ? " · locked" : ""}
                </span>
                <span className={styles.stepTitle} dir="rtl" lang="fa">
                  {milestone.title_fa}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.grid}>
          <div className={styles.pane}>
            <div className={styles.paneHead}>Instructions</div>
            <div className={styles.instructions} dir="rtl" lang="fa">
              {active?.executable ? (
                <Markdown markdown={active.instructions_markdown} />
              ) : (
                <p className={styles.note} dir="rtl" lang="fa">
                  این مرحله هنوز قابل‌اجرا نیست و فقط برای نمایش مسیر پروژه است. مرحله‌های اجرایی را از نوار بالا انتخاب کن.
                </p>
              )}
            </div>

            {active && active.criteria.length > 0 ? (
              <div className={styles.criteriaBox}>
                <div className={styles.criteriaTitle}>معیارهای قبولی</div>
                <ul className={styles.criteriaList}>
                  {active.criteria.map((criterion) => {
                    const check = checkById.get(criterion.id);
                    const mark = check ? CHECK_MARK[check.status] : { glyph: "•", className: "" };
                    return (
                      <li key={criterion.id} className={styles.checkItem} dir="rtl" lang="fa">
                        <span className={styles.criterion}>
                          <span className={`${styles.criterionMark} ${mark.className}`}>{mark.glyph}</span>
                          <span>
                            {criterion.description_fa}
                            {criterion.evaluation === "manual" ? " (بازبینی دستی)" : ""}
                          </span>
                        </span>
                        {check && (check.status === "failed" || check.status === "needs_manual_review") ? (
                          <span className={styles.checkMessage}>{check.messageFa}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {active && active.executable && active.hint_count > 0 ? (
              <div className={styles.hints}>
                <button
                  type="button"
                  className={styles.hintBtn}
                  onClick={doHint}
                  disabled={busy !== null || shownHints.length >= active.hint_count}
                >
                  Hint ({shownHints.length}/{active.hint_count})
                </button>
                <ul className={styles.hintList} dir="rtl" lang="fa">
                  {shownHints.map((hint) => (
                    <li key={hint.id}>{hint.text_fa}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className={styles.pane}>
            <div className={styles.toolbar}>
              <span className={styles.saveState}>
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Auto-save on"}
              </span>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.primary}
                onClick={doEvaluate}
                disabled={busy !== null || !active?.executable}
              >
                {busy === "evaluate" ? "Evaluating…" : "Evaluate milestone"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={doRestoreCheckpoint}
                disabled={busy !== null || !active || !progress?.milestones[active.id]?.checkpointAvailable}
              >
                {busy === "restore" ? "Restoring…" : "Restore checkpoint"}
              </button>
              <button type="button" className={styles.danger} onClick={doReset} disabled={busy !== null}>
                {busy === "reset" ? "Resetting…" : "Reset workspace"}
              </button>
            </div>

            {active && active.executable ? (
              active.stage_kind === "erd" ? (
                <div className={styles.designer}>
                  <div className={styles.canvasHost}>
                    <ErdCanvas
                      graph={erd}
                      mode="edit"
                      onMoveEntity={moveEntity}
                      onConnect={connectEntities}
                      onSelect={setSelectedEntityId}
                    />
                  </div>
                  <div className={styles.sidebar}>
                    <div className={styles.section}>
                      <div className={styles.sectionHead}>
                        Tables
                        <button type="button" className={styles.smallBtn} onClick={addTable}>
                          + Add table
                        </button>
                      </div>
                      <ul className={styles.entityList}>
                        {erd.entities.map((entity) => (
                          <li key={entity.id}>
                            <button
                              type="button"
                              className={`${styles.entityBtn} ${entity.id === selectedEntityId ? styles.entityBtnActive : ""}`}
                              onClick={() => setSelectedEntityId(entity.id)}
                            >
                              <span dir="ltr">{entity.name}</span>
                              <span className={styles.entityMeta}>{entity.attributes.length} cols</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {selectedEntity ? (
                      <div className={styles.section}>
                        <div className={styles.sectionHead}>
                          Edit table
                          <button type="button" className={styles.dangerBtn} onClick={() => deleteEntity(selectedEntity.id)}>
                            Delete
                          </button>
                        </div>
                        <label className={styles.field}>
                          <span>Name</span>
                          <input
                            className={styles.input}
                            dir="ltr"
                            value={selectedEntity.name}
                            onChange={(event) => renameEntity(selectedEntity.id, event.target.value)}
                          />
                        </label>
                        <div>
                          {selectedEntity.attributes.map((attribute) => (
                            <div key={attribute.id} className={styles.colRow}>
                              <input
                                className={styles.input}
                                dir="ltr"
                                value={attribute.name}
                                onChange={(event) => updateColumn(selectedEntity.id, attribute.id, { name: event.target.value })}
                              />
                              <select
                                className={styles.select}
                                dir="ltr"
                                value={attribute.type}
                                onChange={(event) => updateColumn(selectedEntity.id, attribute.id, { type: event.target.value })}
                              >
                                {TYPE_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              <label className={styles.flag} title="Not null">
                                <input
                                  type="checkbox"
                                  checked={!attribute.nullable}
                                  onChange={(event) => updateColumn(selectedEntity.id, attribute.id, { nullable: !event.target.checked })}
                                />
                                NN
                              </label>
                              <label className={styles.flag} title="Primary key">
                                <input
                                  type="checkbox"
                                  checked={attribute.primaryKey}
                                  onChange={(event) => updateColumn(selectedEntity.id, attribute.id, { primaryKey: event.target.checked })}
                                />
                                PK
                              </label>
                              <label className={styles.flag} title="Unique">
                                <input
                                  type="checkbox"
                                  checked={attribute.unique}
                                  onChange={(event) => updateColumn(selectedEntity.id, attribute.id, { unique: event.target.checked })}
                                />
                                UQ
                              </label>
                              <button type="button" className={styles.iconBtn} onClick={() => deleteColumn(selectedEntity.id, attribute.id)} aria-label="Delete column">
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <button type="button" className={styles.smallBtn} onClick={() => addColumn(selectedEntity.id)}>
                          + Add column
                        </button>
                      </div>
                    ) : null}

                    <div className={styles.section}>
                      <div className={styles.sectionHead}>
                        Relationships
                        <button type="button" className={styles.smallBtn} onClick={addRelationship} disabled={erd.entities.length < 2}>
                          + Add 1:N
                        </button>
                      </div>
                      {erd.relationships.map((relationship) => {
                        const fromName = erd.entities.find((entity) => entity.id === relationship.fromEntityId)?.name ?? "?";
                        const toName = erd.entities.find((entity) => entity.id === relationship.toEntityId)?.name ?? "?";
                        const manyId = relationship.fromCardinality === "many" ? relationship.fromEntityId : relationship.toEntityId;
                        const manyEntity = erd.entities.find((entity) => entity.id === manyId);
                        return (
                          <div key={relationship.id} className={styles.relationship}>
                            <div className={styles.relHead} dir="ltr">
                              {fromName} → {toName}
                              <button type="button" className={styles.iconBtn} onClick={() => deleteRelationship(relationship.id)} aria-label="Delete relationship">
                                ×
                              </button>
                            </div>
                            <label className={styles.field}>
                              <span>Cardinality</span>
                              <select
                                className={styles.select}
                                value={labelFromRelation(relationship)}
                                onChange={(event) => {
                                  const [from, to] = event.target.value.split(":");
                                  updateRelationship(relationship.id, {
                                    fromCardinality: cardinalityFrom(from),
                                    toCardinality: cardinalityFrom(to),
                                  });
                                }}
                              >
                                <option value="1:1">1:1</option>
                                <option value="1:N">1:N</option>
                                <option value="N:1">N:1</option>
                                <option value="N:M">N:M</option>
                              </select>
                            </label>
                            <label className={styles.field}>
                              <span>FK side</span>
                              <select
                                className={styles.select}
                                value={relationship.optionality}
                                onChange={(event) =>
                                  updateRelationship(relationship.id, {
                                    optionality: event.target.value as ErdRelationship["optionality"],
                                  })
                                }
                              >
                                <option value="mandatory">mandatory</option>
                                <option value="optional">optional</option>
                              </select>
                            </label>
                            <label className={styles.field}>
                              <span>FK column</span>
                              <select
                                className={styles.select}
                                value={relationship.foreignKeyAttributeId ?? ""}
                                onChange={(event) =>
                                  updateRelationship(relationship.id, { foreignKeyAttributeId: event.target.value || null })
                                }
                              >
                                <option value="">—</option>
                                {(manyEntity?.attributes ?? []).map((attribute) => (
                                  <option key={attribute.id} value={attribute.id}>
                                    {attribute.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        );
                      })}
                    </div>

                    <div className={styles.section}>
                      <div className={styles.sectionHead}>Design notes (بازبینی دستی)</div>
                      <textarea
                        className={styles.textarea}
                        dir="rtl"
                        lang="fa"
                        rows={3}
                        value={state.notes ?? ""}
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    </div>

                    {issues.length > 0 ? (
                      <div className={styles.issueBox} dir="ltr">
                        <div className={styles.issueTitle}>Design warnings</div>
                        <ul className={styles.issueList}>
                          {issues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={styles.editorHost}>
                  <Editor
                    key={active.id}
                    path={`project-${project.id}-${active.id}.${active.stage_kind === "sql" ? "sql" : "py"}`}
                    value={active.stage_kind === "sql" ? state.sql ?? "" : state.orm ?? ""}
                    language={active.stage_kind === "sql" ? "sql" : "python"}
                    theme="vs-dark"
                    onChange={(value) =>
                      setState((prev) => (active.stage_kind === "sql" ? { ...prev, sql: value ?? "" } : { ...prev, orm: value ?? "" }))
                    }
                    options={{
                      fontSize: 13,
                      lineHeight: 21,
                      fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
                      minimap: { enabled: false },
                      tabSize: 2,
                      insertSpaces: true,
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                      padding: { top: 10, bottom: 10 },
                    }}
                    height="320px"
                    loading={<div className={styles.editorLoading}>Loading editor…</div>}
                  />
                </div>
              )
            ) : (
              <p className={styles.note} dir="rtl" lang="fa">
                این مرحله قابل‌اجرا نیست. یکی از مرحله‌های اجرایی را انتخاب کن.
              </p>
            )}

            {evaluation ? (
              <div
                className={`${styles.verdict} ${
                  evaluation.status === "system_error"
                    ? styles.verdictSystem
                    : evaluation.passed
                      ? styles.verdictPass
                      : styles.verdictFail
                }`}
                dir={evaluation.status === "system_error" ? "ltr" : "rtl"}
                lang="fa"
              >
                {evaluation.status === "system_error"
                  ? evaluation.error ?? "خطای سیستمی رخ داد؛ این مورد به‌عنوان پاسخ غلط ثبت نمی‌شود."
                  : evaluation.passed
                    ? `آفرین! معیارهای خودکار برآورده شدند و یک Checkpoint برای این مرحله ثبت شد.`
                    : evaluation.status === "timeout" || evaluation.outcome === "deadline_exceeded"
                      ? "اجرای کد بیش از حد طول کشید و متوقف شد."
                      : evaluation.outcome === "syntax_error"
                        ? "کد خطا داد؛ خطای واقعی را ببین و اصلاح کن."
                        : "بعضی معیارها برآورده نشد؛ توضیح هر معیار را ببین و اصلاح کن."}
              </div>
            ) : null}

            {active && progress?.milestones[active.id]?.passed ? (
              <p className={styles.note} dir="rtl" lang="fa">
                این مرحله قبلاً با موفقیت گذرانده شده است؛ آخرین Checkpoint آن قابل بازگردانی است.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

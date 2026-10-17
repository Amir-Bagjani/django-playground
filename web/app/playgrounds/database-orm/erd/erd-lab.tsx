"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ErdEntity, ErdGraph, ErdRelationship, LabExercise, LabHint } from "@/lib/academy";

import { Markdown } from "../../../components/markdown";
import { notifyProgress } from "../progress";
import { ErdCanvas } from "./erd-canvas";
import { cloneGraph, editorIssues, emptyGraph, newId, parseGraph } from "./graph";
import styles from "./erd.module.css";

interface EvaluationCheck {
  criterionId: string;
  status: "passed" | "failed" | "needs_manual_review" | "not_evaluated";
  messageFa: string;
  hintAvailable: boolean;
}

interface EvaluationResult {
  exerciseId: string;
  assessmentVersion: number;
  status: "passed" | "failed" | "error" | "timeout" | "system_error";
  outcome: string;
  passed: boolean;
  checks: EvaluationCheck[];
  canRequestNextHint: boolean;
  error: string | null;
}

const CHECK_MARK: Record<EvaluationCheck["status"], { glyph: string; className: string }> = {
  passed: { glyph: "✓", className: styles.markPass },
  failed: { glyph: "✗", className: styles.markFail },
  needs_manual_review: { glyph: "…", className: styles.markManual },
  not_evaluated: { glyph: "•", className: "" },
};

const TYPE_OPTIONS = [
  "INT",
  "BIGINT",
  "VARCHAR(120)",
  "VARCHAR(160)",
  "TEXT",
  "DECIMAL(12,2)",
  "DATE",
  "BOOLEAN",
];

function starterGraph(exercise: LabExercise): ErdGraph {
  const parsed = parseGraph(exercise.starter[0]?.content);
  return parsed ?? emptyGraph();
}

async function callApi(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
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

function newColumnEntity(name: string): ErdEntity {
  return {
    id: newId("e"),
    name,
    attributes: [
      { id: newId("a"), name: "id", type: "INT", nullable: false, primaryKey: true, unique: true },
    ],
  };
}

function cardinalityFrom(side: string): ErdRelationship["fromCardinality"] {
  return side === "many" ? "many" : "one";
}

function labelFromRelation(relationship: ErdRelationship): string {
  return `${relationship.fromCardinality === "one" ? "1" : "N"}:${relationship.toCardinality === "one" ? "1" : "N"}`;
}

export function ErdLab({ exercise }: { exercise: LabExercise }) {
  const [graph, setGraph] = useState<ErdGraph>(() => starterGraph(exercise));
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"designer" | "example">("designer");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hints, setHints] = useState<LabHint[]>([]);
  const [hintTotal, setHintTotal] = useState(exercise.hint_count);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const savedRef = useRef<string>("");
  const example = exercise.example_graph ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await callApi(`/api/academy/v1/exercises/${exercise.id}/draft`, "GET");
      if (cancelled) return;
      const draft = data.graph as ErdGraph | null | undefined;
      const next = draft && draft.schema_version === 1 ? draft : starterGraph(exercise);
      setGraph(next);
      savedRef.current = JSON.stringify(next);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [exercise]);

  useEffect(() => {
    setIssues(editorIssues(graph));
  }, [graph]);

  // Debounced auto-save so a Refresh never loses the learner's work.
  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(graph);
    if (serialized === savedRef.current) return;
    setSaveState("saving");
    const handle = setTimeout(async () => {
      await callApi(`/api/academy/v1/exercises/${exercise.id}/draft`, "PUT", { graph });
      savedRef.current = serialized;
      setSaveState("saved");
    }, 800);
    return () => clearTimeout(handle);
  }, [graph, ready, exercise.id]);

  const selectedEntity = useMemo(
    () => graph.entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [graph.entities, selectedEntityId],
  );

  const updateGraph = useCallback((mutate: (draft: ErdGraph) => void) => {
    setGraph((prev) => {
      const next = cloneGraph(prev);
      mutate(next);
      return next;
    });
  }, []);

  const addTable = useCallback(() => {
    const entity = newColumnEntity(`table_${graph.entities.length + 1}`);
    updateGraph((draft) => {
      draft.entities.push(entity);
    });
    setSelectedEntityId(entity.id);
  }, [graph.entities.length, updateGraph]);

  const renameEntity = useCallback(
    (id: string, name: string) => {
      updateGraph((draft) => {
        const entity = draft.entities.find((item) => item.id === id);
        if (entity) entity.name = name;
      });
    },
    [updateGraph],
  );

  const deleteEntity = useCallback(
    (id: string) => {
      const referencing = graph.relationships.filter(
        (relationship) => relationship.fromEntityId === id || relationship.toEntityId === id,
      );
      if (referencing.length > 0) {
        const ok = window.confirm(
          "This table is used by one or more relationships. Deleting it will also remove those relationships. Continue?",
        );
        if (!ok) return;
      }
      updateGraph((draft) => {
        draft.entities = draft.entities.filter((entity) => entity.id !== id);
        draft.relationships = draft.relationships.filter(
          (relationship) => relationship.fromEntityId !== id && relationship.toEntityId !== id,
        );
      });
      setSelectedEntityId(null);
    },
    [graph.relationships, updateGraph],
  );

  const addColumn = useCallback(
    (entityId: string) => {
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
    },
    [updateGraph],
  );

  const updateColumn = useCallback(
    (entityId: string, attributeId: string, patch: Partial<ErdEntity["attributes"][number]>) => {
      updateGraph((draft) => {
        const entity = draft.entities.find((item) => item.id === entityId);
        const attribute = entity?.attributes.find((item) => item.id === attributeId);
        if (attribute) Object.assign(attribute, patch);
      });
    },
    [updateGraph],
  );

  const deleteColumn = useCallback(
    (entityId: string, attributeId: string) => {
      updateGraph((draft) => {
        const entity = draft.entities.find((item) => item.id === entityId);
        if (entity) entity.attributes = entity.attributes.filter((item) => item.id !== attributeId);
        for (const relationship of draft.relationships) {
          if (relationship.foreignKeyAttributeId === attributeId) relationship.foreignKeyAttributeId = null;
        }
      });
    },
    [updateGraph],
  );

  const moveEntity = useCallback(
    (id: string, position: { x: number; y: number }) => {
      updateGraph((draft) => {
        const entity = draft.entities.find((item) => item.id === id);
        if (entity) entity.position = position;
      });
    },
    [updateGraph],
  );

  const connectEntities = useCallback(
    (fromId: string, toId: string) => {
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
    },
    [updateGraph],
  );

  const addRelationship = useCallback(() => {
    const [first, second] = graph.entities;
    if (!first || !second) return;
    connectEntities(first.id, second.id);
  }, [graph.entities, connectEntities]);

  const updateRelationship = useCallback(
    (id: string, patch: Partial<ErdRelationship>) => {
      updateGraph((draft) => {
        const relationship = draft.relationships.find((item) => item.id === id);
        if (relationship) Object.assign(relationship, patch);
      });
    },
    [updateGraph],
  );

  const deleteRelationship = useCallback(
    (id: string) => {
      updateGraph((draft) => {
        draft.relationships = draft.relationships.filter((item) => item.id !== id);
      });
    },
    [updateGraph],
  );

  const setNotes = useCallback(
    (notes: string) => {
      updateGraph((draft) => {
        draft.notes = notes;
      });
    },
    [updateGraph],
  );

  const doCheck = useCallback(async () => {
    setBusy("check");
    try {
      const data = await callApi(`/api/academy/v1/exercises/${exercise.id}/evaluate`, "POST", {
        exerciseId: exercise.id,
        graph,
      });
      setEvaluation(data as unknown as EvaluationResult);
      notifyProgress();
    } finally {
      setBusy(null);
    }
  }, [exercise.id, graph]);

  const doReset = useCallback(async () => {
    setBusy("reset");
    try {
      await callApi(`/api/academy/v1/exercises/${exercise.id}/reset`, "POST");
      const fresh = starterGraph(exercise);
      setGraph(fresh);
      savedRef.current = JSON.stringify(fresh);
      setEvaluation(null);
      setSelectedEntityId(null);
      setSaveState("idle");
    } finally {
      setBusy(null);
    }
  }, [exercise]);

  const doHint = useCallback(async () => {
    setBusy("hint");
    try {
      const data = await callApi(`/api/academy/v1/exercises/${exercise.id}/hints/next`, "POST", {
        revealed: hints.length,
      });
      const hint = data.hint as LabHint | null;
      if (hint) setHints((prev) => [...prev, hint]);
      if (typeof data.total === "number") setHintTotal(data.total as number);
    } finally {
      setBusy(null);
    }
  }, [exercise.id, hints.length]);

  const checkById = new Map(evaluation?.checks.map((check) => [check.criterionId, check]) ?? []);

  return (
    <div className={styles.lab}>
      <div className={styles.labHead}>
        <h2 className={styles.labTitle}>ERD Designer</h2>
        <span className={styles.labNote} dir="rtl" lang="fa">
          دیاگرام را خودت بساز؛ Check Solution فقط معنای طراحی (کلیدها، رابطه و کارتینالیتی) را می‌سنجد، نه شکل آن.
        </span>
      </div>

      <div className={styles.grid}>
        <div className={styles.pane}>
          <div className={styles.paneHead}>Instructions</div>
          <div className={styles.instructions} dir="rtl" lang="fa">
            <Markdown markdown={exercise.instructions_markdown} />
          </div>

          <div className={styles.criteriaBox}>
            <div className={styles.criteriaTitle}>معیارهای قبولی</div>
            <ul className={styles.criteriaList}>
              {exercise.criteria.map((criterion) => {
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

          <div className={styles.hints}>
            <button
              type="button"
              className={styles.hintBtn}
              onClick={doHint}
              disabled={busy !== null || hints.length >= hintTotal}
            >
              Hint ({hints.length}/{hintTotal})
            </button>
            <ul className={styles.hintList} dir="rtl" lang="fa">
              {hints.map((hint) => (
                <li key={hint.id}>{hint.text_fa}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.pane}>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={tab === "designer" ? styles.primary : styles.secondary}
              onClick={() => setTab("designer")}
            >
              Designer
            </button>
            {example ? (
              <button
                type="button"
                className={tab === "example" ? styles.primary : styles.secondary}
                onClick={() => setTab("example")}
              >
                Example
              </button>
            ) : null}
            <span className={styles.spacer} />
            <span className={styles.saveState}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Auto-save on"}
            </span>
            <button type="button" className={styles.secondary} onClick={doCheck} disabled={busy !== null}>
              {busy === "check" ? "Checking…" : "Check Solution"}
            </button>
            <button type="button" className={styles.ghost} onClick={doReset} disabled={busy !== null}>
              {busy === "reset" ? "Resetting…" : "Reset"}
            </button>
          </div>

          {tab === "designer" ? (
            <div className={styles.designer}>
              <ErdCanvas
                graph={graph}
                mode="edit"
                onMoveEntity={moveEntity}
                onConnect={connectEntities}
                onSelect={setSelectedEntityId}
              />

              <div className={styles.sidebar}>
                <div className={styles.section}>
                  <div className={styles.sectionHead}>
                    Tables
                    <button type="button" className={styles.smallBtn} onClick={addTable}>
                      + Add table
                    </button>
                  </div>
                  <ul className={styles.entityList}>
                    {graph.entities.length === 0 ? (
                      <li className={styles.emptyHint}>No tables yet — start with “Add table”.</li>
                    ) : null}
                    {graph.entities.map((entity) => (
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
                    <div className={styles.columns}>
                      {selectedEntity.attributes.map((attribute) => (
                        <div key={attribute.id} className={styles.colRow}>
                          <input
                            className={styles.input}
                            dir="ltr"
                            value={attribute.name}
                            onChange={(event) =>
                              updateColumn(selectedEntity.id, attribute.id, { name: event.target.value })
                            }
                          />
                          <select
                            className={styles.select}
                            dir="ltr"
                            value={attribute.type}
                            onChange={(event) =>
                              updateColumn(selectedEntity.id, attribute.id, { type: event.target.value })
                            }
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
                              onChange={(event) =>
                                updateColumn(selectedEntity.id, attribute.id, { nullable: !event.target.checked })
                              }
                            />
                            NN
                          </label>
                          <label className={styles.flag} title="Primary key">
                            <input
                              type="checkbox"
                              checked={attribute.primaryKey}
                              onChange={(event) =>
                                updateColumn(selectedEntity.id, attribute.id, { primaryKey: event.target.checked })
                              }
                            />
                            PK
                          </label>
                          <label className={styles.flag} title="Unique">
                            <input
                              type="checkbox"
                              checked={attribute.unique}
                              onChange={(event) =>
                                updateColumn(selectedEntity.id, attribute.id, { unique: event.target.checked })
                              }
                            />
                            UQ
                          </label>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => deleteColumn(selectedEntity.id, attribute.id)}
                            aria-label="Delete column"
                          >
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
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={addRelationship}
                      disabled={graph.entities.length < 2}
                    >
                      + Add 1:N
                    </button>
                  </div>
                  {graph.relationships.length === 0 ? (
                    <div className={styles.emptyHint}>
                      Drag from the right handle of one table to another, or use “Add 1:N”.
                    </div>
                  ) : null}
                  {graph.relationships.map((relationship) => {
                    const fromName = graph.entities.find((e) => e.id === relationship.fromEntityId)?.name ?? "?";
                    const toName = graph.entities.find((e) => e.id === relationship.toEntityId)?.name ?? "?";
                    const manyEntityId =
                      relationship.fromCardinality === "many" ? relationship.fromEntityId : relationship.toEntityId;
                    const manyEntity = graph.entities.find((e) => e.id === manyEntityId);
                    return (
                      <div key={relationship.id} className={styles.relationship}>
                        <div className={styles.relHead} dir="ltr">
                          {fromName} → {toName}
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => deleteRelationship(relationship.id)}
                            aria-label="Delete relationship"
                          >
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
                              updateRelationship(relationship.id, {
                                foreignKeyAttributeId: event.target.value || null,
                              })
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
                    value={graph.notes ?? ""}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="چرا کلید خارجی سمت orders است و چرا رابطه اجباری است…"
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
            <div className={styles.designer}>
              <ErdCanvas graph={example ?? emptyGraph()} mode="view" />
              <div className={styles.sidebar}>
                <div className={styles.section}>
                  <div className={styles.sectionHead}>Example diagram</div>
                  <p className={styles.exampleCaption} dir="rtl" lang="fa">
                    {example?.caption_fa ?? ""}
                  </p>
                  {example?.relationships.map((relationship) => (
                    <div key={relationship.id} className={styles.relationship} dir="rtl" lang="fa">
                      <div className={styles.relHead}>{labelFromRelation(relationship)}</div>
                      {relationship.note_fa ? <p className={styles.exampleNote}>{relationship.note_fa}</p> : null}
                    </div>
                  ))}
                  {example?.entities.map((entity) => (
                    <div key={entity.id} className={styles.relationship} dir="rtl" lang="fa">
                      <div className={styles.relHead} dir="ltr">
                        {entity.name}
                      </div>
                      {entity.note_fa ? <p className={styles.exampleNote}>{entity.note_fa}</p> : null}
                    </div>
                  ))}
                  {example?.notes ? (
                    <p className={styles.exampleNote} dir="rtl" lang="fa">
                      {example.notes}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
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
                ? evaluation.error ?? "خطای سیستمی رخ داد؛ این مورد به‌عنوان طراحی غلط ثبت نمی‌شود."
                : evaluation.outcome === "invalid_graph"
                  ? evaluation.error ?? "دیاگرام نامعتبر است؛ ساختار آن را اصلاح کن."
                  : evaluation.passed
                    ? "آفرین! معیارهای ساختاری طراحی برآورده شد."
                    : "بعضی معیارها برآورده نشد؛ توضیح هر معیار را ببین و دیاگرام را اصلاح کن."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

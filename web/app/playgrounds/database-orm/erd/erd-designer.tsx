"use client";

import { useCallback, useMemo, useState } from "react";

import type { ErdEntity, ErdGraph, ErdRelationship } from "@/lib/academy";

import { ErdCanvas } from "./erd-canvas";
import { cloneGraph, editorIssues, newId } from "./graph";
import styles from "./erd-designer.module.css";

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

function cardinalityFrom(side: string): ErdRelationship["fromCardinality"] {
  return side === "many" ? "many" : "one";
}

function labelFromRelation(relationship: ErdRelationship): string {
  return `${relationship.fromCardinality === "one" ? "1" : "N"}:${
    relationship.toCardinality === "one" ? "1" : "N"
  }`;
}

export interface ErdDesignerProps {
  graph: ErdGraph;
  onChange: (graph: ErdGraph) => void;
  /**
   * When provided, the "Design notes" box is bound to this value instead of
   * `graph.notes` (projects keep notes in their workspace, lessons keep them in
   * the graph). Either way notes are never graded automatically.
   */
  notes?: string;
  onNotesChange?: (notes: string) => void;
  emptyTitle?: string;
  emptyText?: string;
}

/**
 * The single, shared ERD editor used by both the lesson lab and the project
 * workspace: a large canvas plus a table/column/relationship inspector. It is a
 * controlled component — every change is emitted through `onChange` so the
 * caller owns persistence (draft auto-save, workspace auto-save, …).
 */
export function ErdDesigner({
  graph,
  onChange,
  notes,
  onNotesChange,
  emptyTitle = "No tables yet",
  emptyText = "Add your first table to start designing — drag between tables to create relationships.",
}: ErdDesignerProps) {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const mutate = useCallback(
    (change: (draft: ErdGraph) => void) => {
      const draft = cloneGraph(graph);
      change(draft);
      onChange(draft);
    },
    [graph, onChange],
  );

  const selectedEntity = useMemo(
    () => graph.entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [graph.entities, selectedEntityId],
  );
  const issues = useMemo(() => editorIssues(graph), [graph]);
  const notesBound = notes !== undefined;
  const notesValue = notes ?? graph.notes ?? "";

  const addTable = () => {
    const entity: ErdEntity = {
      id: newId("e"),
      name: `table_${graph.entities.length + 1}`,
      attributes: [
        { id: newId("a"), name: "id", type: "INT", nullable: false, primaryKey: true, unique: true },
      ],
    };
    mutate((draft) => {
      draft.entities.push(entity);
    });
    setSelectedEntityId(entity.id);
  };

  const renameEntity = (id: string, name: string) =>
    mutate((draft) => {
      const entity = draft.entities.find((item) => item.id === id);
      if (entity) entity.name = name;
    });

  const deleteEntity = (id: string) => {
    const referencing = graph.relationships.filter(
      (relationship) => relationship.fromEntityId === id || relationship.toEntityId === id,
    );
    if (referencing.length > 0) {
      const ok = window.confirm(
        "This table is used by one or more relationships. Deleting it will also remove those relationships. Continue?",
      );
      if (!ok) return;
    }
    mutate((draft) => {
      draft.entities = draft.entities.filter((entity) => entity.id !== id);
      draft.relationships = draft.relationships.filter(
        (relationship) => relationship.fromEntityId !== id && relationship.toEntityId !== id,
      );
    });
    setSelectedEntityId(null);
  };

  const addColumn = (entityId: string) =>
    mutate((draft) => {
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
    mutate((draft) => {
      const entity = draft.entities.find((item) => item.id === entityId);
      const attribute = entity?.attributes.find((item) => item.id === attributeId);
      if (attribute) Object.assign(attribute, patch);
    });

  const deleteColumn = (entityId: string, attributeId: string) =>
    mutate((draft) => {
      const entity = draft.entities.find((item) => item.id === entityId);
      if (entity) entity.attributes = entity.attributes.filter((item) => item.id !== attributeId);
      for (const relationship of draft.relationships) {
        if (relationship.foreignKeyAttributeId === attributeId) relationship.foreignKeyAttributeId = null;
      }
    });

  const moveEntity = (id: string, position: { x: number; y: number }) =>
    mutate((draft) => {
      const entity = draft.entities.find((item) => item.id === id);
      if (entity) entity.position = position;
    });

  const connectEntities = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    mutate((draft) => {
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

  const addRelationship = () => {
    const [first, second] = graph.entities;
    if (first && second) connectEntities(first.id, second.id);
  };

  const updateRelationship = (id: string, patch: Partial<ErdRelationship>) =>
    mutate((draft) => {
      const relationship = draft.relationships.find((item) => item.id === id);
      if (relationship) Object.assign(relationship, patch);
    });

  const deleteRelationship = (id: string) =>
    mutate((draft) => {
      draft.relationships = draft.relationships.filter((item) => item.id !== id);
    });

  const changeNotes = (value: string) => {
    if (notesBound) onNotesChange?.(value);
    else mutate((draft) => { draft.notes = value; });
  };

  return (
    <div className={`${styles.designer} ${expanded ? styles.expanded : ""}`}>
      <div className={styles.canvasBox}>
        <ErdCanvas
          graph={graph}
          mode="edit"
          onMoveEntity={moveEntity}
          onConnect={connectEntities}
          onSelect={setSelectedEntityId}
        />
        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setExpanded((value) => !value)}
          aria-pressed={expanded}
        >
          {expanded ? "⤡ Show inspector" : "⤢ Expand canvas"}
        </button>
        {graph.entities.length === 0 ? (
          <div className={styles.emptyOverlay}>
            <span className={styles.emptyTitle}>{emptyTitle}</span>
            <span className={styles.emptyText}>{emptyText}</span>
            <button type="button" className={styles.smallBtn} onClick={addTable}>
              + Add table
            </button>
          </div>
        ) : null}
      </div>

      {expanded ? null : (
        <div className={styles.inspector}>
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
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => deleteEntity(selectedEntity.id)}
                >
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
              const fromName = graph.entities.find((entity) => entity.id === relationship.fromEntityId)?.name ?? "?";
              const toName = graph.entities.find((entity) => entity.id === relationship.toEntityId)?.name ?? "?";
              const manyEntityId =
                relationship.fromCardinality === "many" ? relationship.fromEntityId : relationship.toEntityId;
              const manyEntity = graph.entities.find((entity) => entity.id === manyEntityId);
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
              value={notesValue}
              onChange={(event) => changeNotes(event.target.value)}
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
      )}
    </div>
  );
}

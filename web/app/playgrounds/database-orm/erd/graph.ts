import type { ErdAttribute, ErdEntity, ErdGraph, ErdRelationship } from "@/lib/academy";

export const EMPTY_GRAPH: ErdGraph = { schema_version: 1, entities: [], relationships: [], notes: "" };

export function emptyGraph(): ErdGraph {
  return { schema_version: 1, entities: [], relationships: [], notes: "" };
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Parse a starter/example JSON string into a graph, tolerating bad input. */
export function parseGraph(text: string | undefined): ErdGraph | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<ErdGraph>;
    if (!value || value.schema_version !== 1) return null;
    return {
      schema_version: 1,
      entities: Array.isArray(value.entities) ? (value.entities as ErdEntity[]) : [],
      relationships: Array.isArray(value.relationships) ? (value.relationships as ErdRelationship[]) : [],
      notes: typeof value.notes === "string" ? value.notes : "",
      caption_fa: value.caption_fa,
    };
  } catch {
    return null;
  }
}

export function cloneGraph(graph: ErdGraph): ErdGraph {
  return JSON.parse(JSON.stringify(graph)) as ErdGraph;
}

export function findAttribute(graph: ErdGraph, attributeId: string | null | undefined): { entity: ErdEntity; attribute: ErdAttribute } | null {
  if (!attributeId) return null;
  for (const entity of graph.entities) {
    for (const attribute of entity.attributes) {
      if (attribute.id === attributeId) return { entity, attribute };
    }
  }
  return null;
}

export function relationshipLabel(relationship: ErdRelationship): string {
  const from = relationship.fromCardinality === "one" ? "1" : "N";
  const to = relationship.toCardinality === "one" ? "1" : "N";
  return `${from}:${to}`;
}

/**
 * Non-fatal design problems shown live in the editor (English UI): duplicate
 * names, dangling references and a missing FK column. Grading is still done by
 * the server; this only helps the learner before pressing Check.
 */
export function editorIssues(graph: ErdGraph): string[] {
  const issues: string[] = [];
  const names = new Map<string, number>();
  for (const entity of graph.entities) {
    const key = entity.name.trim().toLowerCase();
    if (!key) issues.push("A table has an empty name.");
    names.set(key, (names.get(key) ?? 0) + 1);
    const columnNames = new Map<string, number>();
    for (const attribute of entity.attributes) {
      const ckey = attribute.name.trim().toLowerCase();
      if (!ckey) issues.push(`A column in "${entity.name}" has an empty name.`);
      columnNames.set(ckey, (columnNames.get(ckey) ?? 0) + 1);
    }
    for (const [name, count] of columnNames) {
      if (count > 1) issues.push(`Duplicate column "${name}" in "${entity.name}".`);
    }
  }
  for (const [name, count] of names) {
    if (name && count > 1) issues.push(`Duplicate table name "${name}".`);
  }
  const entityIds = new Set(graph.entities.map((entity) => entity.id));
  for (const relationship of graph.relationships) {
    if (!entityIds.has(relationship.fromEntityId) || !entityIds.has(relationship.toEntityId)) {
      issues.push("A relationship points at a table that no longer exists.");
    }
    if (relationship.foreignKeyAttributeId && !findAttribute(graph, relationship.foreignKeyAttributeId)) {
      issues.push("A relationship has no valid foreign-key column.");
    }
  }
  return issues;
}

export function suggestForeignKey(graph: ErdGraph, manyEntityId: string): string | null {
  const entity = graph.entities.find((item) => item.id === manyEntityId);
  if (!entity) return null;
  const named = entity.attributes.find((attribute) => /_?id$|_?ref$/i.test(attribute.name) && !attribute.primaryKey);
  return named?.id ?? entity.attributes.find((attribute) => !attribute.primaryKey)?.id ?? null;
}

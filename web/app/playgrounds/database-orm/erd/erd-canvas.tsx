"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  getStraightPath,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ErdEntity, ErdGraph, ErdRelationship } from "@/lib/academy";

import { relationshipLabel } from "./graph";
import styles from "./erd.module.css";

export const ENTITY_NODE_WIDTH = 220;
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 30;

function nodeHeight(entity: ErdEntity): number {
  return HEADER_HEIGHT + Math.max(entity.attributes.length, 1) * ROW_HEIGHT + 8;
}

interface EntityNodeData extends Record<string, unknown> {
  entity: ErdEntity;
  foreignKeyIds: string[];
  mode: "view" | "edit";
}

function EntityNode({ data, selected }: NodeProps) {
  const { entity, foreignKeyIds, mode } = data as EntityNodeData;
  return (
    <div className={`${styles.node} ${selected ? styles.nodeSelected : ""}`} style={{ width: ENTITY_NODE_WIDTH }}>
      <div className={styles.nodeHead}>{entity.name || "(unnamed)"}</div>
      <ul className={styles.nodeCols}>
        {entity.attributes.length === 0 ? (
          <li className={styles.nodeEmpty}>no columns</li>
        ) : (
          entity.attributes.map((attribute) => (
            <li key={attribute.id} className={styles.nodeCol}>
              <span className={styles.colName} dir="ltr">
                {attribute.primaryKey ? <span className={styles.pkBadge}>PK</span> : null}
                {foreignKeyIds.includes(attribute.id) ? <span className={styles.fkBadge}>FK</span> : null}
                {attribute.unique && !attribute.primaryKey ? <span className={styles.uqBadge}>UQ</span> : null}
                {attribute.name}
              </span>
              <span className={styles.colType} dir="ltr">
                {attribute.type}
                {attribute.nullable ? "" : " ·NN"}
              </span>
            </li>
          ))
        )}
      </ul>
      {mode === "edit" ? (
        <>
          <Handle type="target" position={Position.Left} className={styles.handle} />
          <Handle type="source" position={Position.Right} className={styles.handle} />
        </>
      ) : null}
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

// --- crow's foot edge -------------------------------------------------------

interface ErdEdgeData extends Record<string, unknown> {
  relationship: ErdRelationship;
  mode: "view" | "edit";
}

function unit(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { d: { x: dx / len, y: dy / len }, n: { x: -dy / len, y: dx / len } };
}

function markerGeometry(x: number, y: number, dirX: number, dirY: number, cardinality: "one" | "many", optional: boolean) {
  const n = { x: -dirY, y: dirX };
  const t = 16;
  const spread = 7;
  const paths: string[] = [];
  const anchor = { x: x + dirX * t, y: y + dirY * t };
  if (cardinality === "many") {
    paths.push(`M${x},${y} L${anchor.x + n.x * spread},${anchor.y + n.y * spread}`);
    paths.push(`M${x},${y} L${anchor.x},${anchor.y}`);
    paths.push(`M${x},${y} L${anchor.x - n.x * spread},${anchor.y - n.y * spread}`);
  } else {
    paths.push(
      `M${anchor.x + n.x * spread},${anchor.y + n.y * spread} L${anchor.x - n.x * spread},${anchor.y - n.y * spread}`,
    );
  }
  let circle: { cx: number; cy: number } | null = null;
  if (optional) {
    circle = { cx: x + dirX * (t + 8), cy: y + dirY * (t + 8) };
  }
  return { paths, circle };
}

function ErdEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, style }: EdgeProps) {
  const edgeData = data as ErdEdgeData | undefined;
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const relationship = edgeData?.relationship;

  const start = useMemo(() => {
    if (!relationship) return null;
    const { d } = unit({ x: sourceX, y: sourceY }, { x: targetX, y: targetY });
    return markerGeometry(sourceX, sourceY, d.x, d.y, relationship.fromCardinality, false);
  }, [relationship, sourceX, sourceY, targetX, targetY]);

  const end = useMemo(() => {
    if (!relationship) return null;
    const { d } = unit({ x: targetX, y: targetY }, { x: sourceX, y: sourceY });
    return markerGeometry(
      targetX,
      targetY,
      d.x,
      d.y,
      relationship.toCardinality,
      relationship.optionality === "optional",
    );
  }, [relationship, sourceX, sourceY, targetX, targetY]);

  return (
    <g>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {start?.paths.map((d, i) => (
        <path key={`s${i}`} d={d} className={styles.crowFoot} />
      ))}
      {end?.paths.map((d, i) => (
        <path key={`e${i}`} d={d} className={styles.crowFoot} />
      ))}
      {end?.circle ? <circle cx={end.circle.cx} cy={end.circle.cy} r={4} className={styles.optionalCircle} /> : null}
      {relationship ? (
        <g>
          <rect x={labelX - 22} y={labelY - 11} width={44} height={20} rx={4} className={styles.edgeLabelBg} />
          <text x={labelX} y={labelY + 3} textAnchor="middle" className={styles.edgeLabel}>
            {relationshipLabel(relationship)}
          </text>
        </g>
      ) : null}
    </g>
  );
}

const edgeTypes = { erd: ErdEdge };

function buildNodes(graph: ErdGraph, mode: "view" | "edit"): Node[] {
  const foreignKeyIds = graph.relationships
    .map((relationship) => relationship.foreignKeyAttributeId)
    .filter((value): value is string => Boolean(value));
  return graph.entities.map((entity, index) => ({
    id: entity.id,
    type: "entity",
    position: entity.position ?? { x: 60 + (index % 3) * 280, y: 40 + Math.floor(index / 3) * 200 },
    draggable: mode === "edit",
    data: { entity, foreignKeyIds, mode } satisfies EntityNodeData,
    width: ENTITY_NODE_WIDTH,
    height: nodeHeight(entity),
  }));
}

function buildEdges(graph: ErdGraph, mode: "view" | "edit"): Edge[] {
  return graph.relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.fromEntityId,
    target: relationship.toEntityId,
    type: "erd",
    animated: false,
    selectable: mode === "edit",
    data: { relationship, mode } satisfies ErdEdgeData,
    style: { stroke: "#94a3b8", strokeWidth: 1.6 },
  }));
}

interface ErdCanvasProps {
  graph: ErdGraph;
  mode: "view" | "edit";
  onMoveEntity?: (id: string, position: { x: number; y: number }) => void;
  onConnect?: (fromId: string, toId: string) => void;
  onSelect?: (id: string | null) => void;
}

export function ErdCanvas({ graph, mode, onMoveEntity, onConnect, onSelect }: ErdCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes(graph, mode));
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges(graph, mode));
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setNodes(buildNodes(graph, mode));
    setEdges(buildEdges(graph, mode));
  }, [graph, mode, setNodes, setEdges]);

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, node) => onMoveEntity?.(node.id, node.position)}
        onNodeClick={(_, node) => {
          setSelected(node.id);
          onSelect?.(node.id);
        }}
        onPaneClick={() => {
          setSelected(null);
          onSelect?.(null);
        }}
        onConnect={(connection: Connection) => {
          if (mode === "edit" && connection.source && connection.target) {
            onConnect?.(connection.source, connection.target);
          }
        }}
        nodesDraggable={mode === "edit"}
        nodesConnectable={mode === "edit"}
        elementsSelectable={mode === "edit"}
        fitView
        minZoom={0.3}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className={styles.minimap} />
      </ReactFlow>
    </div>
  );
}

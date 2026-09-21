import type { DiagramDsl, DiagramEdge, DiagramLane, DiagramNode } from "../../contracts/src/diagramTypes.js";
import { validateDiagramRules, type DiagramRuleIssue } from "./businessValidator.js";

export interface GraphLane {
  id: string;
  label: string;
}

export interface GraphNode {
  id: string;
  kind: DiagramNode["type"];
  label: string;
  description?: string;
  laneId?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface GraphModel {
  schemaVersion: DiagramDsl["schemaVersion"];
  diagramType: DiagramDsl["diagramType"];
  title: string;
  orientation: DiagramDsl["orientation"];
  lanes: readonly GraphLane[];
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
}

export interface GraphModelResult {
  model: GraphModel;
  warnings: readonly DiagramRuleIssue[];
}

export class GraphModelValidationError extends Error {
  readonly code = "GRAPH_MODEL_VALIDATION_ERROR" as const;

  constructor(readonly issues: readonly DiagramRuleIssue[]) {
    super("Diagram DSL business rules must pass before Graph Model conversion");
    this.name = "GraphModelValidationError";
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortLanes(lanes: readonly DiagramLane[]): GraphLane[] {
  return lanes
    .map((lane) => ({ id: lane.id, label: lane.label }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
}

function sortNodes(nodes: readonly DiagramNode[]): GraphNode[] {
  return nodes
    .map((node) => ({
      id: node.id,
      kind: node.type,
      label: node.label,
      ...(node.description === undefined ? {} : { description: node.description }),
      ...(node.laneId === undefined ? {} : { laneId: node.laneId })
    }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
}

function sortEdges(edges: readonly DiagramEdge[]): GraphEdge[] {
  return edges
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      ...(edge.label === undefined ? {} : { label: edge.label })
    }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
}

export function toGraphModel(dsl: DiagramDsl): GraphModelResult {
  const validation = validateDiagramRules(dsl);
  if (!validation.valid) {
    throw new GraphModelValidationError(validation.errors);
  }

  return {
    model: {
      schemaVersion: dsl.schemaVersion,
      diagramType: dsl.diagramType,
      title: dsl.title,
      orientation: dsl.orientation,
      lanes: sortLanes(dsl.lanes),
      nodes: sortNodes(dsl.nodes),
      edges: sortEdges(dsl.edges)
    },
    warnings: validation.warnings
  };
}

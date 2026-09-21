import { DIAGRAM_SCHEMA_VERSION } from "./diagram.js";

export type DiagramType = "flowchart" | "swimlane";
export type DiagramOrientation = "horizontal" | "vertical";
export type DiagramNodeType =
  | "start"
  | "end"
  | "task"
  | "decision"
  | "subprocess"
  | "data"
  | "document";

export interface DiagramLane {
  id: string;
  label: string;
}

export interface DiagramNode {
  id: string;
  type: DiagramNodeType;
  label: string;
  description?: string;
  laneId?: string;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface DiagramSourceRef {
  meetingId: string;
  nodeId: string;
  locatorType: "char_range";
  startOffset: number;
  endOffset: number;
  quote?: string;
}

export interface DiagramDsl {
  schemaVersion: typeof DIAGRAM_SCHEMA_VERSION;
  diagramType: DiagramType;
  title: string;
  orientation: DiagramOrientation;
  lanes: DiagramLane[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  sourceRefs?: DiagramSourceRef[];
}

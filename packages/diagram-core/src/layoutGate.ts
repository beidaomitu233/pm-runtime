import ELK from "elkjs/lib/elk.bundled.js";
import dagre from "dagre";

import type { GraphModel } from "./graphModel.js";

export const layoutGateConfig = {
  preferred: "elk",
  fallback: "dagre",
  elk: {
    algorithm: "layered",
    compoundLanes: true,
    directionHorizontal: "RIGHT",
    directionVertical: "DOWN"
  },
  dagre: {
    laneFallback: "banded-lanes",
    directionHorizontal: "LR",
    directionVertical: "TB"
  }
} as const;

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutCandidate {
  engine: "elk" | "dagre";
  durationMs: number;
  nodes: readonly LayoutPoint[];
  hasOverlap: boolean;
}

export interface LayoutComparison {
  preferred: "elk";
  fallback: "dagre";
  candidates: readonly LayoutCandidate[];
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 72;

function overlap(left: LayoutPoint, right: LayoutPoint): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function hasOverlap(nodes: readonly LayoutPoint[]): boolean {
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      if (overlap(nodes[left], nodes[right])) {
        return true;
      }
    }
  }
  return false;
}

function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}

async function layoutWithElk(graph: GraphModel): Promise<LayoutCandidate> {
  const start = performance.now();
  const elk = new ELK();
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": layoutGateConfig.elk.algorithm,
      "elk.direction": graph.orientation === "horizontal"
        ? layoutGateConfig.elk.directionHorizontal
        : layoutGateConfig.elk.directionVertical,
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      "elk.spacing.nodeNode": "32"
    },
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target]
    }))
  });
  const nodes = (result.children ?? []).map((node) => ({
    id: node.id,
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? NODE_WIDTH,
    height: node.height ?? NODE_HEIGHT
  }));
  return { engine: "elk", durationMs: elapsed(start), nodes, hasOverlap: hasOverlap(nodes) };
}

function layoutWithDagre(graph: GraphModel): LayoutCandidate {
  const start = performance.now();
  const dagreGraph = new dagre.graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: graph.orientation === "horizontal"
      ? layoutGateConfig.dagre.directionHorizontal
      : layoutGateConfig.dagre.directionVertical,
    nodesep: 32,
    ranksep: 48,
    marginx: 24,
    marginy: 24
  });
  for (const node of graph.nodes) {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    dagreGraph.setEdge(edge.source, edge.target, {}, edge.id);
  }
  dagre.layout(dagreGraph);
  const nodes = graph.nodes.map((node) => {
    const positioned = dagreGraph.node(node.id);
    return {
      id: node.id,
      x: positioned.x - positioned.width / 2,
      y: positioned.y - positioned.height / 2,
      width: positioned.width,
      height: positioned.height
    };
  });
  return { engine: "dagre", durationMs: elapsed(start), nodes, hasOverlap: hasOverlap(nodes) };
}

export async function compareLayoutEngines(graph: GraphModel): Promise<LayoutComparison> {
  const elk = await layoutWithElk(graph);
  const dagreCandidate = layoutWithDagre(graph);
  return {
    preferred: "elk",
    fallback: "dagre",
    candidates: [elk, dagreCandidate]
  };
}

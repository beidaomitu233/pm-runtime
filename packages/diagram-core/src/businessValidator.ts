import type { DiagramDsl, DiagramEdge, DiagramNode } from "../../contracts/src/diagramTypes.js";

export type DiagramRuleSeverity = "error" | "warning";

export interface DiagramRuleIssue {
  code: string;
  path: string;
  message: string;
  severity: DiagramRuleSeverity;
}

export interface DiagramBusinessValidationResult {
  valid: boolean;
  errors: readonly DiagramRuleIssue[];
  warnings: readonly DiagramRuleIssue[];
}

function normalizedLabel(label: string | undefined): string {
  return (label ?? "").trim().normalize("NFC");
}

function addIssue(
  target: DiagramRuleIssue[],
  severity: DiagramRuleSeverity,
  code: string,
  path: string,
  message: string
): void {
  target.push({ code, path, message, severity });
}

function reachable(startIds: readonly string[], graph: ReadonlyMap<string, readonly string[]>): Set<string> {
  const visited = new Set<string>();
  const queue = [...startIds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const next of graph.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }
  return visited;
}

function sortIssues(issues: DiagramRuleIssue[]): DiagramRuleIssue[] {
  return issues.sort((left, right) =>
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );
}

export function validateDiagramRules(dsl: DiagramDsl): DiagramBusinessValidationResult {
  const errors: DiagramRuleIssue[] = [];
  const warnings: DiagramRuleIssue[] = [];
  const laneIndexes = new Map<string, number>();
  const nodeIndexes = new Map<string, number>();
  const nodesById = new Map<string, DiagramNode>();

  dsl.lanes.forEach((lane, index) => {
    const path = `/lanes/${index}/id`;
    if (laneIndexes.has(lane.id)) {
      addIssue(errors, "error", "DUPLICATE_LANE_ID", path, `Lane ID '${lane.id}' is duplicated`);
    } else {
      laneIndexes.set(lane.id, index);
    }
  });

  dsl.nodes.forEach((node, index) => {
    const path = `/nodes/${index}/id`;
    if (nodeIndexes.has(node.id)) {
      addIssue(errors, "error", "DUPLICATE_NODE_ID", path, `Node ID '${node.id}' is duplicated`);
    } else {
      nodeIndexes.set(node.id, index);
      nodesById.set(node.id, node);
    }

    if (dsl.diagramType === "swimlane" && (node.type === "task" || node.type === "decision")) {
      if (!node.laneId) {
        addIssue(errors, "error", "NODE_LANE_REQUIRED", `/nodes/${index}/laneId`, "Task and decision nodes require a lane");
      } else if (!laneIndexes.has(node.laneId)) {
        addIssue(errors, "error", "NODE_LANE_NOT_FOUND", `/nodes/${index}/laneId`, `Lane '${node.laneId}' does not exist`);
      }
    }
    if (dsl.diagramType === "flowchart" && node.laneId) {
      addIssue(errors, "error", "FLOWCHART_NODE_LANE_FORBIDDEN", `/nodes/${index}/laneId`, "Flowchart nodes cannot reference a lane");
    }
  });

  if (dsl.diagramType === "flowchart" && dsl.lanes.length > 0) {
    addIssue(errors, "error", "FLOWCHART_LANES_NOT_EMPTY", "/lanes", "Flowcharts cannot contain lanes");
  }
  if (dsl.diagramType === "swimlane" && dsl.lanes.length === 0) {
    addIssue(errors, "error", "SWIMLANE_LANES_REQUIRED", "/lanes", "Swimlane diagrams require at least one lane");
  }

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const node of dsl.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  const duplicateEdges = new Set<string>();
  dsl.edges.forEach((edge: DiagramEdge, index) => {
    const path = `/edges/${index}`;
    if (edge.from === edge.to) {
      addIssue(errors, "error", "SELF_LOOP", path, "An edge cannot connect a node to itself");
    }
    if (!nodesById.has(edge.from)) {
      addIssue(errors, "error", "EDGE_SOURCE_NOT_FOUND", `${path}/from`, `Node '${edge.from}' does not exist`);
    }
    if (!nodesById.has(edge.to)) {
      addIssue(errors, "error", "EDGE_TARGET_NOT_FOUND", `${path}/to`, `Node '${edge.to}' does not exist`);
    }

    const duplicateKey = `${edge.from}\u0000${edge.to}\u0000${normalizedLabel(edge.label)}`;
    if (duplicateEdges.has(duplicateKey)) {
      addIssue(warnings, "warning", "DUPLICATE_EDGE", path, "Duplicate edge retained as a warning");
    }
    duplicateEdges.add(duplicateKey);

    if (outgoing.has(edge.from) && incoming.has(edge.to)) {
      outgoing.get(edge.from)!.push(edge.to);
      incoming.get(edge.to)!.push(edge.from);
    }
  });

  const startNodes = dsl.nodes.filter((node) => node.type === "start");
  const endNodes = dsl.nodes.filter((node) => node.type === "end");
  if (startNodes.length === 0) {
    addIssue(errors, "error", "START_NODE_REQUIRED", "/nodes", "At least one start node is required");
  }
  if (endNodes.length === 0) {
    addIssue(errors, "error", "END_NODE_REQUIRED", "/nodes", "At least one end node is required");
  }

  for (const decision of dsl.nodes.filter((node) => node.type === "decision")) {
    const index = nodeIndexes.get(decision.id) ?? 0;
    const edges = dsl.edges.filter((edge) => edge.from === decision.id);
    if (edges.length < 2) {
      addIssue(errors, "error", "DECISION_BRANCHES_REQUIRED", `/nodes/${index}`, "A decision requires at least two outgoing edges");
    }
    const labels = new Set<string>();
    edges.forEach((edge, edgeIndex) => {
      const label = normalizedLabel(edge.label);
      if (!label) {
        const originalIndex = dsl.edges.indexOf(edge);
        addIssue(errors, "error", "DECISION_BRANCH_LABEL_REQUIRED", `/edges/${originalIndex >= 0 ? originalIndex : edgeIndex}/label`, "Decision branches require labels");
      } else if (labels.has(label)) {
        const originalIndex = dsl.edges.indexOf(edge);
        addIssue(errors, "error", "DUPLICATE_DECISION_BRANCH_LABEL", `/edges/${originalIndex >= 0 ? originalIndex : edgeIndex}/label`, "Decision branch labels must be unique");
      }
      labels.add(label);
    });
  }

  if (startNodes.length > 0 && endNodes.length > 0) {
    const fromStart = reachable(startNodes.map((node) => node.id), outgoing);
    const toEnd = reachable(endNodes.map((node) => node.id), incoming);
    dsl.nodes.forEach((node, index) => {
      if (!fromStart.has(node.id) || !toEnd.has(node.id)) {
        addIssue(errors, "error", "NODE_NOT_ON_START_END_PATH", `/nodes/${index}`, "Node must be reachable from a start and lead to an end");
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors: sortIssues(errors),
    warnings: sortIssues(warnings)
  };
}

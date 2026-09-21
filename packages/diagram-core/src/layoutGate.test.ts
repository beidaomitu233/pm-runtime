import { describe, expect, it } from "vitest";

import { validDiagramFixtures } from "../../contracts/src/index.js";
import { toGraphModel, type GraphModel } from "./graphModel.js";
import { compareLayoutEngines, layoutGateConfig } from "./layoutGate.js";

function thirtyNodeGraph(): GraphModel {
  const nodes = [
    { id: "start", kind: "start" as const, label: "开始" },
    ...Array.from({ length: 28 }, (_, index) => ({
      id: `task-${String(index).padStart(2, "0")}`,
      kind: "task" as const,
      label: `任务 ${index}`
    })),
    { id: "end", kind: "end" as const, label: "结束" }
  ];
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${index}`,
    source: node.id,
    target: nodes[index + 1].id
  }));
  return {
    schemaVersion: "0.1",
    diagramType: "flowchart",
    title: "layout gate",
    orientation: "horizontal",
    lanes: [],
    nodes,
    edges
  };
}

describe("layout technology gate", () => {
  it("compares ELK and Dagre on a flowchart without overlapping nodes", async () => {
    const graph = toGraphModel(validDiagramFixtures[0]).model;
    const result = await compareLayoutEngines(graph);

    expect(result.preferred).toBe("elk");
    expect(result.fallback).toBe("dagre");
    expect(result.candidates.map((candidate) => candidate.engine)).toEqual(["elk", "dagre"]);
    expect(result.candidates.every((candidate) => candidate.nodes.length === graph.nodes.length)).toBe(true);
    expect(result.candidates.every((candidate) => !candidate.hasOverlap)).toBe(true);
  });

  it("runs the 30-node benchmark shape for both engines", async () => {
    const result = await compareLayoutEngines(thirtyNodeGraph());
    expect(result.candidates.every((candidate) => candidate.nodes.length === 30)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.durationMs >= 0)).toBe(true);
  });

  it("records the lane-aware preference and fallback policy", () => {
    expect(layoutGateConfig.elk.compoundLanes).toBe(true);
    expect(layoutGateConfig.dagre.laneFallback).toBe("banded-lanes");
  });
});

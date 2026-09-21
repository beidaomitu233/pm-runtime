import { describe, expect, it } from "vitest";

import { validDiagramFixtures } from "../../contracts/src/index.js";
import { validateDiagramRules } from "./businessValidator.js";

describe("diagram business validator", () => {
  it("accepts flowchart fixtures and a semantically valid swimlane", () => {
    for (const fixture of validDiagramFixtures.slice(0, 8)) {
      const result = validateDiagramRules(fixture);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    }

    const swimlane = structuredClone(validDiagramFixtures[8]);
    swimlane.nodes.push({ id: "end-2", type: "end", label: "结束 2" });
    swimlane.edges.push({ id: "edge-review-end-2", from: "review", to: "end-2", label: "否" });
    const result = validateDiagramRules(swimlane);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing references, self-loops, disconnected nodes, and duplicate IDs", () => {
    const fixture = structuredClone(validDiagramFixtures[0]);
    fixture.nodes.push({ id: "orphan", type: "task", label: "孤立任务" });
    fixture.nodes.push({ id: "task", type: "task", label: "重复任务" });
    fixture.edges.push({ id: "self", from: "task", to: "task" });
    fixture.edges.push({ id: "missing", from: "missing", to: "end" });

    const result = validateDiagramRules(fixture);
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_NODE_ID",
      "SELF_LOOP",
      "EDGE_SOURCE_NOT_FOUND",
      "NODE_NOT_ON_START_END_PATH"
    ]));
  });

  it("requires labelled and distinct decision branches", () => {
    const fixture = structuredClone(validDiagramFixtures[8]);
    fixture.nodes.push({ id: "end-2", type: "end", label: "结束 2" });
    fixture.edges.push({ id: "edge-review-end-2", from: "review", to: "end-2", label: "是" });
    fixture.edges.push({ id: "edge-review-end-3", from: "review", to: "end-2" });

    const result = validateDiagramRules(fixture);
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_DECISION_BRANCH_LABEL",
      "DECISION_BRANCH_LABEL_REQUIRED"
    ]));
  });

  it("keeps exact duplicate edges as deterministic warnings", () => {
    const fixture = structuredClone(validDiagramFixtures[0]);
    fixture.edges.push({ id: "duplicate", from: "start", to: "task" });

    const result = validateDiagramRules(fixture);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "DUPLICATE_EDGE", path: "/edges/2", severity: "warning" })
    ]);
  });
});

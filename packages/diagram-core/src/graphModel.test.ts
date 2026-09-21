import { describe, expect, it } from "vitest";

import { validDiagramFixtures } from "../../contracts/src/index.js";
import { GraphModelValidationError, toGraphModel } from "./graphModel.js";

describe("Graph Model conversion", () => {
  it("converts a valid flowchart without draw.io-specific fields", () => {
    const result = toGraphModel(validDiagramFixtures[0]);

    expect(result.warnings).toEqual([]);
    expect(result.model.nodes.map((node) => node.id)).toEqual(["end", "start", "task"]);
    expect(result.model.edges.map((edge) => edge.id)).toEqual([
      "edge-start-task",
      "edge-task-end"
    ]);
    expect(result.model.nodes[1]).toMatchObject({ kind: "start", label: "开始" });
    expect(result.model).not.toHaveProperty("xml");
    expect(result.model).not.toHaveProperty("x");
  });

  it("produces deterministic output and does not mutate the DSL", () => {
    const input = structuredClone(validDiagramFixtures[0]);
    const before = structuredClone(input);
    const first = toGraphModel(input);
    const second = toGraphModel(input);

    expect(first).toEqual(second);
    expect(input).toEqual(before);
  });

  it("retains business warnings while preserving stable edge IDs", () => {
    const input = structuredClone(validDiagramFixtures[0]);
    input.edges.push({ id: "duplicate", from: "start", to: "task" });
    const result = toGraphModel(input);

    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "DUPLICATE_EDGE", severity: "warning" })
    ]);
    expect(result.model.edges.map((edge) => edge.id)).toEqual([
      "duplicate",
      "edge-start-task",
      "edge-task-end"
    ]);
  });

  it("rejects a graph that fails business validation", () => {
    const input = structuredClone(validDiagramFixtures[0]);
    input.nodes.push({ id: "orphan", type: "task", label: "孤立" });

    expect(() => toGraphModel(input)).toThrow(GraphModelValidationError);
    try {
      toGraphModel(input);
    } catch (error) {
      expect(error).toBeInstanceOf(GraphModelValidationError);
      expect((error as GraphModelValidationError).issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "NODE_NOT_ON_START_END_PATH" })])
      );
    }
  });
});

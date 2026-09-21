import { describe, expect, it } from "vitest";

import { invalidDiagramFixtures, validDiagramFixtures } from "./diagramFixtures.js";
import { parseDiagramDsl, validateDiagramDsl } from "./diagramValidation.js";
import { ContractValidationError } from "./validation.js";

describe("Diagram DSL v0.1 schema", () => {
  it("accepts at least ten documented valid fixtures", () => {
    expect(validDiagramFixtures).toHaveLength(10);

    for (const fixture of validDiagramFixtures) {
      expect(parseDiagramDsl(fixture)).toBe(fixture);
      expect(validateDiagramDsl(fixture)).toBe(true);
    }
  });

  it("rejects at least twenty documented invalid fixtures", () => {
    expect(invalidDiagramFixtures.length).toBeGreaterThanOrEqual(20);

    for (const fixture of invalidDiagramFixtures) {
      expect(() => parseDiagramDsl(fixture.value), fixture.name).toThrow(
        ContractValidationError
      );
    }
  });

  it("returns JSON Pointer paths for schema failures", () => {
    expect(() => parseDiagramDsl({
      ...validDiagramFixtures[0],
      nodes: [{ id: "bad/id", type: "task", label: "任务" }]
    })).toThrowError(/Contract validation failed/);

    try {
      parseDiagramDsl({
        ...validDiagramFixtures[0],
        nodes: [{ id: "bad/id", type: "task", label: "任务" }]
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).issues.some(
        (issue) => issue.instancePath === "/nodes/0/id"
      )).toBe(true);
    }
  });
});

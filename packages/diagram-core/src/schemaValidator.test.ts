import { describe, expect, it } from "vitest";

import { invalidDiagramFixtures, validDiagramFixtures } from "../../contracts/src/index.js";
import { validateDiagramSchema } from "./schemaValidator.js";

describe("diagram schema validator", () => {
  it("returns the typed DSL for valid input", () => {
    const result = validateDiagramSchema(validDiagramFixtures[0]);
    expect(result).toEqual({ ok: true, data: validDiagramFixtures[0] });
  });

  it("maps Ajv errors to stable JSON Pointer paths", () => {
    const result = validateDiagramSchema({
      ...validDiagramFixtures[0],
      nodes: [{ id: "bad/id", type: "task" }]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.truncated).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "/nodes/0/label", rule: "required" }),
        expect.objectContaining({ path: "/nodes/0/id", rule: "pattern" })
      ]));
    }
  });

  it("caps error output and exposes truncation for error explosions", () => {
    const result = validateDiagramSchema({
      ...validDiagramFixtures[0],
      nodes: Array.from({ length: 101 }, (_, index) => ({
        id: `node-${index}`,
        type: "task"
      }))
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeLessThanOrEqual(100);
      expect(result.truncated).toBe(true);
    }
  });

  it("shares the documented fixture corpus", () => {
    expect(invalidDiagramFixtures.length).toBeGreaterThanOrEqual(20);
  });
});

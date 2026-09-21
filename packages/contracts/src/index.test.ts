import { describe, expect, it } from "vitest";

import { contractsPackage } from "./index.js";

describe("contracts package skeleton", () => {
  it("exports the package marker", () => {
    expect(contractsPackage).toBe("@pm/contracts");
  });
});

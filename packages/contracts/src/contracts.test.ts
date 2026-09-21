import { describe, expect, it } from "vitest";

import { errorExample, pageExample, successExample } from "./examples.js";
import {
  ContractValidationError,
  parseErrorEnvelope,
  parsePage,
  parsePageQuery,
  parseSuccessEnvelope
} from "./validation.js";

describe("v0.1 contracts", () => {
  it("accepts the documented success, error, and page examples", () => {
    expect(parseSuccessEnvelope(successExample).data).toEqual({ status: "ok" });
    expect(parseErrorEnvelope(errorExample).error.code).toBe("VALIDATION_SCHEMA_ERROR");
    expect(parsePage(pageExample).nextCursor).toBeNull();
  });

  it("applies the pagination bounds", () => {
    expect(parsePageQuery({ limit: 200 })).toEqual({ limit: 200 });
    expect(() => parsePageQuery({ limit: 201 })).toThrow(ContractValidationError);
    expect(() => parsePageQuery({ limit: 0 })).toThrow(ContractValidationError);
  });

  it("rejects unknown error codes and malformed request IDs", () => {
    expect(() => parseErrorEnvelope({
      error: { code: "NOT_A_CODE", message: "bad", retryable: false },
      requestId: successExample.requestId
    })).toThrow(ContractValidationError);

    expect(() => parseSuccessEnvelope({
      data: {},
      requestId: "not-a-ulid"
    })).toThrow(ContractValidationError);
  });

  it("caps detailed validation errors at one hundred entries", () => {
    const details = Array.from({ length: 101 }, (_, index) => ({
      path: `/field/${index}`,
      rule: "invalid"
    }));

    expect(() => parseErrorEnvelope({
      error: {
        code: "VALIDATION_SCHEMA_ERROR",
        message: "too many details",
        details,
        truncated: true,
        retryable: false
      },
      requestId: successExample.requestId
    })).toThrow(ContractValidationError);
  });
});

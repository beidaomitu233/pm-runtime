import type { ErrorEnvelope, Page, SuccessEnvelope } from "./types.js";

export const successExample: SuccessEnvelope<{ status: "ok" }> = {
  data: { status: "ok" },
  requestId: "01J8Z7QK2N4G6H8J9K0M1N2P3Q" as SuccessEnvelope<unknown>["requestId"]
};

export const errorExample: ErrorEnvelope = {
  error: {
    code: "VALIDATION_SCHEMA_ERROR",
    message: "Diagram DSL 校验失败",
    details: [{ path: "/nodes/2/label", rule: "minLength" }],
    retryable: false
  },
  requestId: "01J8Z7QK2N4G6H8J9K0M1N2P3Q" as ErrorEnvelope["requestId"]
};

export const pageExample: Page<{ id: string }> = {
  items: [{ id: "example" }],
  nextCursor: null
};

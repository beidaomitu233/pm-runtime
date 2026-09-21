export const ULID_PATTERN = "^[0-9A-HJKMNP-TV-Z]{26}$";
export const UTC_ISO_DATETIME_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";

export const ulidSchema = {
  $id: "https://pm-runtime.local/schemas/ulid.json",
  type: "string",
  pattern: ULID_PATTERN,
  minLength: 26,
  maxLength: 26
} as const;

export const utcIsoDateTimeSchema = {
  $id: "https://pm-runtime.local/schemas/utc-iso-datetime.json",
  type: "string",
  pattern: UTC_ISO_DATETIME_PATTERN
} as const;

export const pageQuerySchema = {
  $id: "https://pm-runtime.local/schemas/page-query.json",
  type: "object",
  additionalProperties: false,
  properties: {
    cursor: { type: "string", minLength: 1, maxLength: 512 },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
  }
} as const;

export const pageSchema = {
  $id: "https://pm-runtime.local/schemas/page.json",
  type: "object",
  additionalProperties: false,
  required: ["items", "nextCursor"],
  properties: {
    items: { type: "array" },
    nextCursor: { type: ["string", "null"], maxLength: 512 }
  }
} as const;

export const errorCodeSchema = {
  $id: "https://pm-runtime.local/schemas/error-code.json",
  type: "string",
  enum: [
    "UNAUTHORIZED_LOCAL_CLIENT",
    "INVALID_ARGUMENT",
    "VALIDATION_SCHEMA_ERROR",
    "PROJECT_NOT_FOUND",
    "MEETING_NOT_FOUND",
    "NOT_READY",
    "MEETING_TOO_LARGE",
    "IMPORT_UNSUPPORTED_TYPE",
    "IMPORT_PARSE_FAILED",
    "DIAGRAM_NOT_FOUND",
    "CONFLICT_REVISION",
    "XML_INVALID",
    "RENDERER_ERROR",
    "INTERNAL_ERROR"
  ]
} as const;

export const errorDetailSchema = {
  $id: "https://pm-runtime.local/schemas/error-detail.json",
  type: "object",
  additionalProperties: false,
  required: ["path", "rule"],
  properties: {
    path: { type: "string", minLength: 1, maxLength: 512 },
    rule: { type: "string", minLength: 1, maxLength: 128 },
    message: { type: "string", minLength: 1, maxLength: 512 }
  }
} as const;

export const successEnvelopeSchema = {
  $id: "https://pm-runtime.local/schemas/success-envelope.json",
  type: "object",
  additionalProperties: false,
  required: ["data", "requestId"],
  properties: {
    data: {},
    requestId: { $ref: ulidSchema.$id }
  }
} as const;

export const errorEnvelopeSchema = {
  $id: "https://pm-runtime.local/schemas/error-envelope.json",
  type: "object",
  additionalProperties: false,
  required: ["error", "requestId"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "retryable"],
      properties: {
        code: { $ref: errorCodeSchema.$id },
        message: { type: "string", minLength: 1, maxLength: 512 },
        details: {
          type: "array",
          maxItems: 100,
          items: { $ref: errorDetailSchema.$id }
        },
        truncated: { type: "boolean" },
        retryable: { type: "boolean" }
      }
    },
    requestId: { $ref: ulidSchema.$id }
  }
} as const;

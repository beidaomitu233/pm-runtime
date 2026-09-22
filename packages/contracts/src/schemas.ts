export const ULID_PATTERN = "^[0-9A-HJKMNP-TV-Z]{26}$";
export const UTC_ISO_DATETIME_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
export const SHA256_HEX_PATTERN = "^[a-f0-9]{64}$";
export const API_SCHEMA_VERSION = "0.1";

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
    "VALIDATION_RULE_ERROR",
    "RUNTIME_UNAVAILABLE",
    "PROJECT_NOT_FOUND",
    "CONFLICT_PROJECT",
    "MEETING_NOT_FOUND",
    "MEETING_NOT_READY",
    "MEETING_TOO_LARGE",
    "IMPORT_UNSUPPORTED_TYPE",
    "IMPORT_PARSE_FAILED",
    "DIAGRAM_NOT_FOUND",
    "CONFLICT_REVISION",
    "XML_INVALID",
    "RENDERER_ERROR",
    "EXPORT_ERROR",
    "PATH_OUT_OF_SCOPE",
    "CONFIG_PREVIEW_STALE",
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

export const healthResponseSchema = {
  $id: "https://pm-runtime.local/schemas/health-response.json",
  type: "object",
  additionalProperties: false,
  required: ["appVersion", "sidecarVersion", "schemaVersion", "status"],
  properties: {
    appVersion: { type: "string", minLength: 1, maxLength: 64 },
    sidecarVersion: { type: "string", minLength: 1, maxLength: 64 },
    schemaVersion: { type: "string", minLength: 1, maxLength: 32 },
    status: { enum: ["ready", "degraded", "unavailable", "incompatible"] },
    dataDirMasked: { type: "string", maxLength: 256 }
  }
} as const;

export const projectSchema = {
  $id: "https://pm-runtime.local/schemas/project.json",
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "description", "createdAt", "updatedAt"],
  properties: {
    id: { $ref: ulidSchema.$id },
    name: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: ["string", "null"], maxLength: 2000 },
    createdAt: { $ref: utcIsoDateTimeSchema.$id },
    updatedAt: { $ref: utcIsoDateTimeSchema.$id }
  }
} as const;

export const projectListSchema = {
  $id: "https://pm-runtime.local/schemas/project-list.json",
  type: "object",
  additionalProperties: false,
  required: ["items", "nextCursor"],
  properties: {
    items: { type: "array", items: { $ref: projectSchema.$id } },
    nextCursor: { type: ["string", "null"], maxLength: 512 }
  }
} as const;

export const meetingSummarySchema = {
  $id: "https://pm-runtime.local/schemas/meeting-summary.json",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "projectId",
    "title",
    "sourceType",
    "originalFilename",
    "charCount",
    "byteCount",
    "status",
    "errorCode",
    "createdAt",
    "updatedAt"
  ],
  properties: {
    id: { $ref: ulidSchema.$id },
    projectId: { $ref: ulidSchema.$id },
    title: { type: "string", minLength: 1, maxLength: 120 },
    sourceType: { enum: ["paste", "txt", "md", "docx"] },
    originalFilename: { type: ["string", "null"], maxLength: 512 },
    charCount: { type: "integer", minimum: 0 },
    byteCount: { type: "integer", minimum: 0 },
    status: { enum: ["importing", "ready", "failed"] },
    errorCode: { type: ["string", "null"], maxLength: 128 },
    createdAt: { $ref: utcIsoDateTimeSchema.$id },
    updatedAt: { $ref: utcIsoDateTimeSchema.$id }
  }
} as const;

export const meetingListSchema = {
  $id: "https://pm-runtime.local/schemas/meeting-list.json",
  type: "object",
  additionalProperties: false,
  required: ["items", "nextCursor"],
  properties: {
    items: { type: "array", items: { $ref: meetingSummarySchema.$id } },
    nextCursor: { type: ["string", "null"], maxLength: 512 }
  }
} as const;

export const meetingContentSchema = {
  $id: "https://pm-runtime.local/schemas/meeting-content.json",
  type: "object",
  additionalProperties: false,
  required: ["text", "offset", "endOffset", "totalChars", "hasMore"],
  properties: {
    text: { type: "string", maxLength: 20000 },
    offset: { type: "integer", minimum: 0 },
    endOffset: { type: "integer", minimum: 0 },
    totalChars: { type: "integer", minimum: 0 },
    hasMore: { type: "boolean" }
  }
} as const;

export const contractWarningSchema = {
  $id: "https://pm-runtime.local/schemas/contract-warning.json",
  type: "object",
  additionalProperties: false,
  required: ["code", "message"],
  properties: {
    code: { type: "string", minLength: 1, maxLength: 128 },
    message: { type: "string", minLength: 1, maxLength: 512 },
    path: { type: "string", maxLength: 512 }
  }
} as const;

export const revisionSummarySchema = {
  $id: "https://pm-runtime.local/schemas/revision-summary.json",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "diagramId",
    "revisionNo",
    "baseRevisionNo",
    "source",
    "dslStatus",
    "baseDslRevisionNo",
    "contentSha256",
    "rendererVersion",
    "changeNote",
    "createdAt"
  ],
  properties: {
    id: { $ref: ulidSchema.$id },
    diagramId: { $ref: ulidSchema.$id },
    revisionNo: { type: "integer", minimum: 1 },
    baseRevisionNo: { type: ["integer", "null"], minimum: 1 },
    source: { enum: ["agent_render", "editor_save", "history_fork"] },
    dslStatus: { enum: ["current", "stale", "none"] },
    baseDslRevisionNo: { type: ["integer", "null"], minimum: 1 },
    contentSha256: { type: "string", pattern: SHA256_HEX_PATTERN },
    rendererVersion: { type: "string", minLength: 1, maxLength: 64 },
    changeNote: { type: ["string", "null"], maxLength: 1000 },
    createdAt: { $ref: utcIsoDateTimeSchema.$id }
  }
} as const;

export const revisionArtifactSchema = {
  $id: "https://pm-runtime.local/schemas/revision-artifact.json",
  type: "object",
  additionalProperties: false,
  required: ["id", "revisionId", "format", "optionsHash", "byteCount", "contentSha256", "createdAt"],
  properties: {
    id: { $ref: ulidSchema.$id },
    revisionId: { $ref: ulidSchema.$id },
    format: { enum: ["drawio", "svg", "png"] },
    optionsHash: { type: "string", minLength: 1, maxLength: 256 },
    byteCount: { type: "integer", minimum: 0 },
    contentSha256: { type: "string", pattern: SHA256_HEX_PATTERN },
    createdAt: { $ref: utcIsoDateTimeSchema.$id }
  }
} as const;

const diagramSummaryProperties = {
  id: { $ref: ulidSchema.$id },
  projectId: { $ref: ulidSchema.$id },
  meetingId: { type: ["string", "null"], pattern: ULID_PATTERN, minLength: 26, maxLength: 26 },
  title: { type: "string", minLength: 1, maxLength: 120 },
  diagramType: { enum: ["flowchart", "swimlane"] },
  orientation: { enum: ["horizontal", "vertical"] },
  status: { enum: ["rendering", "ready", "render_failed"] },
  currentRevisionNo: { type: "integer", minimum: 0 },
  lastErrorCode: { type: ["string", "null"], maxLength: 128 },
  createdAt: { $ref: utcIsoDateTimeSchema.$id },
  updatedAt: { $ref: utcIsoDateTimeSchema.$id }
} as const;

const diagramSummaryRequired = [
  "id",
  "projectId",
  "meetingId",
  "title",
  "diagramType",
  "orientation",
  "status",
  "currentRevisionNo",
  "lastErrorCode",
  "createdAt",
  "updatedAt"
] as const;

export const diagramSummarySchema = {
  $id: "https://pm-runtime.local/schemas/diagram-summary.json",
  type: "object",
  additionalProperties: false,
  required: diagramSummaryRequired,
  properties: diagramSummaryProperties
} as const;

export const diagramListSchema = {
  $id: "https://pm-runtime.local/schemas/diagram-list.json",
  type: "object",
  additionalProperties: false,
  required: ["items", "nextCursor"],
  properties: {
    items: { type: "array", items: { $ref: diagramSummarySchema.$id } },
    nextCursor: { type: ["string", "null"], maxLength: 512 }
  }
} as const;

export const diagramDetailSchema = {
  $id: "https://pm-runtime.local/schemas/diagram-detail.json",
  type: "object",
  additionalProperties: false,
  required: [...diagramSummaryRequired, "currentRevision", "warnings"],
  properties: {
    ...diagramSummaryProperties,
    currentRevision: {
      anyOf: [{ type: "null" }, { $ref: revisionSummarySchema.$id }]
    },
    warnings: {
      type: "array",
      maxItems: 100,
      items: { $ref: contractWarningSchema.$id }
    },
    revisions: {
      type: "array",
      maxItems: 200,
      items: { $ref: revisionSummarySchema.$id }
    },
    artifacts: {
      type: "array",
      maxItems: 100,
      items: { $ref: revisionArtifactSchema.$id }
    }
  }
} as const;

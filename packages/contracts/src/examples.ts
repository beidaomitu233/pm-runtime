import type {
  DiagramDetail,
  DiagramSummary,
  ErrorEnvelope,
  HealthResponse,
  MeetingContent,
  MeetingSummary,
  Page,
  Project,
  RevisionSummary,
  SuccessEnvelope
} from "./types.js";

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

export const healthExample: HealthResponse = {
  appVersion: "0.1.0",
  sidecarVersion: "0.1.0",
  schemaVersion: "0.1",
  status: "ready",
  dataDirMasked: "[local-data]"
};

export const projectExample: Project = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  name: "示例项目",
  description: null,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z"
};

export const projectListExample: Page<Project> = {
  items: [projectExample],
  nextCursor: null
};

export const meetingSummaryExample: MeetingSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
  projectId: projectExample.id,
  title: "需求评审会议",
  sourceType: "paste",
  originalFilename: null,
  charCount: 120,
  byteCount: 480,
  status: "ready",
  errorCode: null,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z"
};

export const meetingContentExample: MeetingContent = {
  text: "讨论记录",
  offset: 0,
  endOffset: 4,
  totalChars: 4,
  hasMore: false
};

export const revisionSummaryExample: RevisionSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FB2",
  diagramId: "01ARZ3NDEKTSV4RRFFQ69G5FB3",
  revisionNo: 1,
  baseRevisionNo: null,
  source: "agent_render",
  dslStatus: "current",
  baseDslRevisionNo: null,
  contentSha256: "a".repeat(64),
  rendererVersion: "0.1.0",
  changeNote: null,
  createdAt: "2026-09-22T00:00:00.000Z"
};

export const diagramSummaryExample: DiagramSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FB3",
  projectId: projectExample.id,
  meetingId: null,
  title: "示例流程图",
  diagramType: "flowchart",
  orientation: "horizontal",
  status: "ready",
  currentRevisionNo: 1,
  lastErrorCode: null,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z"
};

export const diagramDetailExample: DiagramDetail = {
  ...diagramSummaryExample,
  currentRevision: revisionSummaryExample,
  warnings: [
    {
      code: "SOURCE_REF_MISSING",
      message: "缺少来源引用",
      path: "/sourceRefs"
    }
  ]
};

import type { DiagramOrientation, DiagramType } from "./diagramTypes.js";

export type Ulid = string & { readonly __brand: "Ulid" };
export type RequestId = Ulid;
export type UtcIsoDateTime = string & { readonly __brand: "UtcIsoDateTime" };

export type ApiErrorCode =
  | "UNAUTHORIZED_LOCAL_CLIENT"
  | "INVALID_ARGUMENT"
  | "VALIDATION_SCHEMA_ERROR"
  | "VALIDATION_RULE_ERROR"
  | "RUNTIME_UNAVAILABLE"
  | "PROJECT_NOT_FOUND"
  | "CONFLICT_PROJECT"
  | "MEETING_NOT_FOUND"
  | "MEETING_NOT_READY"
  | "MEETING_TOO_LARGE"
  | "IMPORT_UNSUPPORTED_TYPE"
  | "IMPORT_PARSE_FAILED"
  | "DIAGRAM_NOT_FOUND"
  | "CONFLICT_REVISION"
  | "XML_INVALID"
  | "RENDERER_ERROR"
  | "EXPORT_ERROR"
  | "PATH_OUT_OF_SCOPE"
  | "CONFIG_PREVIEW_STALE"
  | "INTERNAL_ERROR";

export interface PageQuery {
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SuccessEnvelope<T> {
  data: T;
  requestId: RequestId;
}

export interface ErrorDetail {
  path: string;
  rule: string;
  message?: string;
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: ErrorDetail[];
  truncated?: boolean;
  retryable: boolean;
}

export interface ErrorEnvelope {
  error: ApiError;
  requestId: RequestId;
}

export type HealthStatus = "ready" | "degraded" | "unavailable" | "incompatible";

export interface HealthResponse {
  appVersion: string;
  sidecarVersion: string;
  schemaVersion: string;
  status: HealthStatus;
  dataDirMasked?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MeetingSourceType = "paste" | "txt" | "md" | "docx";
export type MeetingStatus = "importing" | "ready" | "failed";

export interface MeetingSummary {
  id: string;
  projectId: string;
  title: string;
  sourceType: MeetingSourceType;
  originalFilename: string | null;
  charCount: number;
  byteCount: number;
  status: MeetingStatus;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingContent {
  text: string;
  offset: number;
  endOffset: number;
  totalChars: number;
  hasMore: boolean;
}

export type DiagramStatus = "rendering" | "ready" | "render_failed";

export interface ContractWarning {
  code: string;
  message: string;
  path?: string;
}

export interface DiagramSummary {
  id: string;
  projectId: string;
  meetingId: string | null;
  title: string;
  diagramType: DiagramType;
  orientation: DiagramOrientation;
  status: DiagramStatus;
  currentRevisionNo: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RevisionSource = "agent_render" | "editor_save" | "history_fork";
export type DslStatus = "current" | "stale" | "none";

export interface RevisionSummary {
  id: string;
  diagramId: string;
  revisionNo: number;
  baseRevisionNo: number | null;
  source: RevisionSource;
  dslStatus: DslStatus;
  baseDslRevisionNo: number | null;
  contentSha256: string;
  rendererVersion: string;
  changeNote: string | null;
  createdAt: string;
}

export type ArtifactFormat = "drawio" | "svg" | "png";

export interface RevisionArtifact {
  id: string;
  revisionId: string;
  format: ArtifactFormat;
  optionsHash: string;
  byteCount: number;
  contentSha256: string;
  createdAt: string;
}

export interface DiagramDetail extends DiagramSummary {
  currentRevision: RevisionSummary | null;
  warnings: ContractWarning[];
  revisions?: RevisionSummary[];
  artifacts?: RevisionArtifact[];
}

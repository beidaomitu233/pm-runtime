export type Ulid = string & { readonly __brand: "Ulid" };
export type RequestId = Ulid;
export type UtcIsoDateTime = string & { readonly __brand: "UtcIsoDateTime" };

export type ApiErrorCode =
  | "UNAUTHORIZED_LOCAL_CLIENT"
  | "INVALID_ARGUMENT"
  | "VALIDATION_SCHEMA_ERROR"
  | "PROJECT_NOT_FOUND"
  | "MEETING_NOT_FOUND"
  | "NOT_READY"
  | "MEETING_TOO_LARGE"
  | "IMPORT_UNSUPPORTED_TYPE"
  | "IMPORT_PARSE_FAILED"
  | "DIAGRAM_NOT_FOUND"
  | "CONFLICT_REVISION"
  | "XML_INVALID"
  | "RENDERER_ERROR"
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

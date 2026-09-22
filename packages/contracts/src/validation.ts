import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import {
  contractWarningSchema,
  diagramDetailSchema,
  diagramListSchema,
  diagramSummarySchema,
  errorCodeSchema,
  errorDetailSchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  meetingContentSchema,
  meetingListSchema,
  meetingSummarySchema,
  pageQuerySchema,
  pageSchema,
  projectListSchema,
  projectSchema,
  revisionArtifactSchema,
  revisionSummarySchema,
  successEnvelopeSchema,
  ulidSchema,
  utcIsoDateTimeSchema
} from "./schemas.js";
import type {
  DiagramDetail,
  DiagramSummary,
  ErrorEnvelope,
  HealthResponse,
  MeetingContent,
  MeetingSummary,
  Page,
  PageQuery,
  Project,
  SuccessEnvelope
} from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: true, removeAdditional: false });
addFormats(ajv);

for (const schema of [
  ulidSchema,
  utcIsoDateTimeSchema,
  pageQuerySchema,
  pageSchema,
  errorCodeSchema,
  errorDetailSchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  projectSchema,
  projectListSchema,
  meetingSummarySchema,
  meetingListSchema,
  meetingContentSchema,
  contractWarningSchema,
  revisionSummarySchema,
  revisionArtifactSchema,
  diagramSummarySchema,
  diagramListSchema,
  diagramDetailSchema
]) {
  ajv.addSchema(schema);
}

export class ContractValidationError extends Error {
  readonly code = "VALIDATION_SCHEMA_ERROR" as const;
  readonly issues: ReadonlyArray<ErrorObject>;
  readonly truncated: boolean;

  constructor(issues: ReadonlyArray<ErrorObject>) {
    super("Contract validation failed");
    this.name = "ContractValidationError";
    this.truncated = issues.length > 100;
    this.issues = issues.slice(0, 100);
  }
}

function parse<T>(validator: ValidateFunction<T>, value: unknown): T {
  if (validator(value)) {
    return value;
  }
  throw new ContractValidationError(validator.errors ?? []);
}

const validateSuccess = ajv.getSchema<SuccessEnvelope<unknown>>(successEnvelopeSchema.$id);
const validateError = ajv.getSchema<ErrorEnvelope>(errorEnvelopeSchema.$id);
const validatePageQuery = ajv.getSchema<PageQuery>(pageQuerySchema.$id);
const validatePage = ajv.getSchema<Page<unknown>>(pageSchema.$id);
const validateHealth = ajv.getSchema<HealthResponse>(healthResponseSchema.$id);
const validateProject = ajv.getSchema<Project>(projectSchema.$id);
const validateProjectList = ajv.getSchema<Page<Project>>(projectListSchema.$id);
const validateMeetingSummary = ajv.getSchema<MeetingSummary>(meetingSummarySchema.$id);
const validateMeetingList = ajv.getSchema<Page<MeetingSummary>>(meetingListSchema.$id);
const validateMeetingContent = ajv.getSchema<MeetingContent>(meetingContentSchema.$id);
const validateDiagramSummary = ajv.getSchema<DiagramSummary>(diagramSummarySchema.$id);
const validateDiagramList = ajv.getSchema<Page<DiagramSummary>>(diagramListSchema.$id);
const validateDiagramDetail = ajv.getSchema<DiagramDetail>(diagramDetailSchema.$id);

if (
  !validateSuccess ||
  !validateError ||
  !validatePageQuery ||
  !validatePage ||
  !validateHealth ||
  !validateProject ||
  !validateProjectList ||
  !validateMeetingSummary ||
  !validateMeetingList ||
  !validateMeetingContent ||
  !validateDiagramSummary ||
  !validateDiagramList ||
  !validateDiagramDetail
) {
  throw new Error("Contract schemas were not registered");
}

export function parseSuccessEnvelope<T>(value: unknown): SuccessEnvelope<T> {
  return parse(validateSuccess!, value) as SuccessEnvelope<T>;
}

export function parseErrorEnvelope(value: unknown): ErrorEnvelope {
  return parse(validateError!, value);
}

export function parsePageQuery(value: unknown): PageQuery {
  return parse(validatePageQuery!, value);
}

export function parsePage<T>(value: unknown): Page<T> {
  return parse(validatePage!, value) as Page<T>;
}

export function parseHealthResponse(value: unknown): HealthResponse {
  return parse(validateHealth!, value);
}

export function parseProject(value: unknown): Project {
  return parse(validateProject!, value);
}

export function parseProjectList(value: unknown): Page<Project> {
  return parse(validateProjectList!, value);
}

export function parseMeetingSummary(value: unknown): MeetingSummary {
  return parse(validateMeetingSummary!, value);
}

export function parseMeetingList(value: unknown): Page<MeetingSummary> {
  return parse(validateMeetingList!, value);
}

export function parseMeetingContent(value: unknown): MeetingContent {
  return parse(validateMeetingContent!, value);
}

export function parseDiagramSummary(value: unknown): DiagramSummary {
  return parse(validateDiagramSummary!, value);
}

export function parseDiagramList(value: unknown): Page<DiagramSummary> {
  return parse(validateDiagramList!, value);
}

export function parseDiagramDetail(value: unknown): DiagramDetail {
  return parse(validateDiagramDetail!, value);
}

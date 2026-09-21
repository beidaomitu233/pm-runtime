import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import {
  errorCodeSchema,
  errorDetailSchema,
  errorEnvelopeSchema,
  pageQuerySchema,
  pageSchema,
  successEnvelopeSchema,
  ulidSchema,
  utcIsoDateTimeSchema
} from "./schemas.js";
import type { ErrorEnvelope, Page, PageQuery, SuccessEnvelope } from "./types.js";

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
  errorEnvelopeSchema
]) {
  ajv.addSchema(schema);
}

export class ContractValidationError extends Error {
  readonly code = "VALIDATION_SCHEMA_ERROR" as const;
  readonly issues: ReadonlyArray<ErrorObject>;

  constructor(issues: ReadonlyArray<ErrorObject>) {
    super("Contract validation failed");
    this.name = "ContractValidationError";
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

if (!validateSuccess || !validateError || !validatePageQuery || !validatePage) {
  throw new Error("Contract schemas were not registered");
}

export function parseSuccessEnvelope<T>(value: unknown): SuccessEnvelope<T> {
  return parse(validateSuccess, value) as SuccessEnvelope<T>;
}

export function parseErrorEnvelope(value: unknown): ErrorEnvelope {
  return parse(validateError, value);
}

export function parsePageQuery(value: unknown): PageQuery {
  return parse(validatePageQuery, value);
}

export function parsePage<T>(value: unknown): Page<T> {
  return parse(validatePage, value) as Page<T>;
}

import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { ContractValidationError } from "./validation.js";
import { diagramDslSchema } from "./diagramSchema.js";
import type { DiagramDsl } from "./diagramTypes.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  removeAdditional: false
});
addFormats(ajv);

ajv.addSchema(diagramDslSchema);

const validateDiagram = ajv.getSchema<DiagramDsl>(diagramDslSchema.$id) as ValidateFunction<DiagramDsl> | undefined;

if (!validateDiagram) {
  throw new Error("Diagram DSL schema was not registered");
}

function collectIssues(validator: ValidateFunction<DiagramDsl>): ReadonlyArray<ErrorObject> {
  return validator.errors ?? [];
}

export function validateDiagramDsl(value: unknown): value is DiagramDsl {
  return validateDiagram!(value) === true;
}

export function parseDiagramDsl(value: unknown): DiagramDsl {
  if (validateDiagram!(value) === true) {
    return value;
  }
  throw new ContractValidationError(collectIssues(validateDiagram!));
}

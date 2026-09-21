import type { ErrorObject } from "ajv";

import {
  ContractValidationError,
  parseDiagramDsl,
  type DiagramDsl
} from "../../contracts/src/index.js";

export interface DiagramSchemaIssue {
  path: string;
  rule: string;
  message: string;
}

export type DiagramSchemaValidationResult =
  | { ok: true; data: DiagramDsl }
  | { ok: false; errors: readonly DiagramSchemaIssue[]; truncated: boolean };

function escapeJsonPointerPart(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function issuePath(issue: ErrorObject): string {
  const base = issue.instancePath || "/";
  if (issue.keyword === "required" && typeof issue.params.missingProperty === "string") {
    return `${base === "/" ? "" : base}/${escapeJsonPointerPart(issue.params.missingProperty)}` || "/";
  }
  if (
    issue.keyword === "additionalProperties" &&
    typeof issue.params.additionalProperty === "string"
  ) {
    return `${base === "/" ? "" : base}/${escapeJsonPointerPart(issue.params.additionalProperty)}` || "/";
  }
  return base;
}

export function validateDiagramSchema(value: unknown): DiagramSchemaValidationResult {
  try {
    return { ok: true, data: parseDiagramDsl(value) };
  } catch (error) {
    if (!(error instanceof ContractValidationError)) {
      throw error;
    }
    return {
      ok: false,
      errors: error.issues.map((issue) => ({
        path: issuePath(issue),
        rule: issue.keyword,
        message: issue.message ?? "Diagram DSL validation failed"
      })),
      truncated: error.truncated
    };
  }
}

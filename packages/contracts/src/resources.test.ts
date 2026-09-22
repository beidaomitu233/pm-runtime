import { describe, expect, it } from "vitest";

import {
  diagramDetailExample,
  diagramSummaryExample,
  healthExample,
  meetingContentExample,
  meetingSummaryExample,
  projectExample,
  projectListExample
} from "./examples.js";
import {
  ContractValidationError,
  parseDiagramDetail,
  parseDiagramList,
  parseHealthResponse,
  parseMeetingContent,
  parseMeetingList,
  parseMeetingSummary,
  parseProject,
  parseProjectList
} from "./validation.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function clone(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("v0.1 resource contracts", () => {
  it("accepts the documented health, project, meeting, and diagram examples", () => {
    expect(parseHealthResponse(healthExample)).toBe(healthExample);
    expect(parseProject(projectExample)).toBe(projectExample);
    expect(parseProjectList(projectListExample)).toBe(projectListExample);
    expect(parseMeetingSummary(meetingSummaryExample)).toBe(meetingSummaryExample);
    expect(parseMeetingList({ items: [meetingSummaryExample], nextCursor: null }).items).toHaveLength(1);
    expect(parseMeetingContent(meetingContentExample)).toBe(meetingContentExample);
    expect(parseDiagramList({ items: [diagramSummaryExample], nextCursor: null }).items).toHaveLength(1);
    expect(parseDiagramDetail(diagramDetailExample)).toBe(diagramDetailExample);
  });

  it("rejects malformed health payloads", () => {
    expect(() => parseHealthResponse({ ...healthExample, status: "starting" })).toThrow(ContractValidationError);
    expect(() => parseHealthResponse({ appVersion: "0.1.0" })).toThrow(ContractValidationError);
    expect(() => parseHealthResponse({ ...healthExample, unexpected: true })).toThrow(ContractValidationError);
  });

  it("rejects malformed project payloads", () => {
    const missingDescription = clone(projectExample);
    delete missingDescription.description;
    expect(() => parseProject(missingDescription)).toThrow(ContractValidationError);
    expect(() => parseProject({ ...projectExample, createdAt: "2026-09-22" })).toThrow(ContractValidationError);
    expect(() => parseProject({ ...projectExample, id: "not-a-ulid" })).toThrow(ContractValidationError);
    expect(() =>
      parseProjectList({ items: [{ ...projectExample, name: "" }], nextCursor: null })
    ).toThrow(ContractValidationError);
  });

  it("rejects the legacy frontend meeting field names", () => {
    const legacy = clone(meetingSummaryExample);
    legacy.importStatus = legacy.status;
    delete legacy.status;
    expect(() => parseMeetingSummary(legacy)).toThrow(ContractValidationError);
    expect(() => parseMeetingSummary({ ...meetingSummaryExample, charCount: -1 })).toThrow(ContractValidationError);
    expect(() =>
      parseMeetingList({ items: [{ ...meetingSummaryExample, sourceType: "email" }], nextCursor: null })
    ).toThrow(ContractValidationError);
  });

  it("rejects statuses outside the confirmed diagram lifecycle", () => {
    expect(() =>
      parseDiagramList({ items: [{ ...diagramSummaryExample, status: "validating" }], nextCursor: null })
    ).toThrow(ContractValidationError);
    expect(() =>
      parseDiagramList({ items: [{ ...diagramSummaryExample, status: "validation_failed" }], nextCursor: null })
    ).toThrow(ContractValidationError);
    expect(() =>
      parseDiagramDetail({ ...diagramDetailExample, currentRevision: { revisionNo: 1 } })
    ).toThrow(ContractValidationError);
    expect(() =>
      parseDiagramDetail({ ...diagramDetailExample, warnings: [{ code: 1, message: "bad" }] })
    ).toThrow(ContractValidationError);
    expect(asRecord(diagramDetailExample).revisions).toBeUndefined();
  });
});

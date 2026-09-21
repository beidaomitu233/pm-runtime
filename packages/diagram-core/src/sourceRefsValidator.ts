import type { DiagramDsl, DiagramSourceRef } from "../../contracts/src/diagramTypes.js";

export interface SourceMeetingContext {
  projectId: string;
  text: string;
}

export interface SourceRefsContext {
  projectId: string;
  meetings: ReadonlyMap<string, SourceMeetingContext>;
}

export interface SourceRefIssue {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface SourceRefsValidationResult {
  valid: boolean;
  refs: readonly DiagramSourceRef[];
  errors: readonly SourceRefIssue[];
  warnings: readonly SourceRefIssue[];
}

function codePointLength(text: string): number {
  return Array.from(text).length;
}

function codePointSlice(text: string, startOffset: number, endOffset: number): string {
  return Array.from(text).slice(startOffset, endOffset).join("");
}

function normalizeQuote(value: string): string {
  return value.normalize("NFC");
}

function sortIssues(issues: SourceRefIssue[]): SourceRefIssue[] {
  return issues.sort((left, right) =>
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );
}

export function validateSourceRefs(
  dsl: DiagramDsl,
  context: SourceRefsContext
): SourceRefsValidationResult {
  const refs: DiagramSourceRef[] = [];
  const errors: SourceRefIssue[] = [];
  const warnings: SourceRefIssue[] = [];
  const nodeIds = new Set(dsl.nodes.map((node) => node.id));

  for (const [index, ref] of (dsl.sourceRefs ?? []).entries()) {
    const path = `/sourceRefs/${index}`;
    const meeting = context.meetings.get(ref.meetingId);
    let valid = true;

    if (!nodeIds.has(ref.nodeId)) {
      errors.push({
        code: "SOURCE_REF_NODE_NOT_FOUND",
        path: `${path}/nodeId`,
        message: `Node '${ref.nodeId}' does not exist`,
        severity: "error"
      });
      valid = false;
    }
    if (!meeting) {
      errors.push({
        code: "SOURCE_REF_MEETING_NOT_FOUND",
        path: `${path}/meetingId`,
        message: `Meeting '${ref.meetingId}' does not exist`,
        severity: "error"
      });
      valid = false;
    } else if (meeting.projectId !== context.projectId) {
      errors.push({
        code: "SOURCE_REF_PROJECT_MISMATCH",
        path: `${path}/meetingId`,
        message: "Source meeting does not belong to the diagram project",
        severity: "error"
      });
      valid = false;
    }

    if (
      ref.locatorType !== "char_range" ||
      !Number.isInteger(ref.startOffset) ||
      !Number.isInteger(ref.endOffset) ||
      ref.startOffset < 0 ||
      ref.endOffset <= ref.startOffset ||
      (meeting && ref.endOffset > codePointLength(meeting.text))
    ) {
      errors.push({
        code: "SOURCE_REF_OFFSET_INVALID",
        path: `${path}/startOffset`,
        message: "Source reference character range is outside the meeting text",
        severity: "error"
      });
      valid = false;
    }

    if (meeting && ref.startOffset >= 0 && ref.endOffset > ref.startOffset && ref.endOffset <= codePointLength(meeting.text)) {
      const expectedQuote = codePointSlice(meeting.text, ref.startOffset, ref.endOffset);
      if (ref.quote !== undefined && normalizeQuote(ref.quote) !== normalizeQuote(expectedQuote)) {
        warnings.push({
          code: "SOURCE_REF_QUOTE_MISMATCH",
          path: `${path}/quote`,
          message: "Source quote does not match the referenced meeting text",
          severity: "warning"
        });
      }
    }

    if (valid) {
      refs.push({
        ...ref,
        ...(ref.quote === undefined ? {} : { quote: normalizeQuote(ref.quote) })
      });
    }
  }

  return {
    valid: errors.length === 0,
    refs,
    errors: sortIssues(errors),
    warnings: sortIssues(warnings)
  };
}

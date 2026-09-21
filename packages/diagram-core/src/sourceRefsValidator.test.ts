import { describe, expect, it } from "vitest";

import { validDiagramFixtures } from "../../contracts/src/index.js";
import { validateSourceRefs } from "./sourceRefsValidator.js";

const meetingId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("diagram source refs validator", () => {
  it("validates node, project, and Unicode character ranges", () => {
    const fixture = structuredClone(validDiagramFixtures[0]);
    fixture.sourceRefs = [{
      meetingId,
      nodeId: "task",
      locatorType: "char_range",
      startOffset: 2,
      endOffset: 5,
      quote: "议程🙂"
    }];
    const result = validateSourceRefs(fixture, {
      projectId: "project-1",
      meetings: new Map([[meetingId, { projectId: "project-1", text: "前言议程🙂结论" }]])
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.refs[0].quote).toBe("议程🙂");
  });

  it("rejects missing meetings, cross-project refs, nodes, and invalid ranges", () => {
    const fixture = structuredClone(validDiagramFixtures[0]);
    fixture.sourceRefs = [
      {
        meetingId,
        nodeId: "missing",
        locatorType: "char_range",
        startOffset: 0,
        endOffset: 99
      },
      {
        meetingId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
        nodeId: "task",
        locatorType: "char_range",
        startOffset: 3,
        endOffset: 1
      }
    ];
    const result = validateSourceRefs(fixture, {
      projectId: "project-1",
      meetings: new Map([[meetingId, { projectId: "project-2", text: "资料" }]])
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "SOURCE_REF_NODE_NOT_FOUND",
      "SOURCE_REF_PROJECT_MISMATCH",
      "SOURCE_REF_MEETING_NOT_FOUND",
      "SOURCE_REF_OFFSET_INVALID"
    ]));
    expect(result.refs).toEqual([]);
  });

  it("keeps a valid ref and warns when an optional quote differs", () => {
    const fixture = structuredClone(validDiagramFixtures[0]);
    fixture.sourceRefs = [{
      meetingId,
      nodeId: "task",
      locatorType: "char_range",
      startOffset: 0,
      endOffset: 2,
      quote: "错误"
    }];
    const result = validateSourceRefs(fixture, {
      projectId: "project-1",
      meetings: new Map([[meetingId, { projectId: "project-1", text: "处理请求" }]])
    });

    expect(result.valid).toBe(true);
    expect(result.refs).toHaveLength(1);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "SOURCE_REF_QUOTE_MISMATCH", severity: "warning" })
    ]);
  });
});

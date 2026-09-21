import { DIAGRAM_SCHEMA_VERSION } from "./diagram.js";
import { ULID_PATTERN } from "./schemas.js";

const identifier = {
  type: "string",
  minLength: 1,
  maxLength: 64,
  pattern: "^[A-Za-z0-9_-]+$"
} as const;

const text = {
  type: "string",
  pattern: "^[^\\u0000-\\u001F\\u007F]+$"
} as const;

export const diagramDslSchema = {
  $id: "https://pm-runtime.local/schemas/diagram-dsl-0.1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "PM Runtime Diagram DSL v0.1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "diagramType",
    "title",
    "orientation",
    "lanes",
    "nodes",
    "edges"
  ],
  properties: {
    schemaVersion: { const: DIAGRAM_SCHEMA_VERSION },
    diagramType: { enum: ["flowchart", "swimlane"] },
    title: { ...text, minLength: 1, maxLength: 120 },
    orientation: { enum: ["horizontal", "vertical"] },
    lanes: {
      type: "array",
      items: { $ref: "#/$defs/lane" }
    },
    nodes: {
      type: "array",
      minItems: 2,
      maxItems: 100,
      items: { $ref: "#/$defs/node" }
    },
    edges: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: { $ref: "#/$defs/edge" }
    },
    sourceRefs: {
      type: "array",
      maxItems: 200,
      items: { $ref: "#/$defs/sourceRef" }
    }
  },
  allOf: [
    {
      if: {
        properties: { diagramType: { const: "swimlane" } },
        required: ["diagramType"]
      },
      then: { properties: { lanes: { type: "array", minItems: 1 } } }
    },
    {
      if: {
        properties: { diagramType: { const: "flowchart" } },
        required: ["diagramType"]
      },
      then: { properties: { lanes: { type: "array", maxItems: 0 } } }
    }
  ],
  $defs: {
    lane: {
      type: "object",
      additionalProperties: false,
      required: ["id", "label"],
      properties: {
        id: identifier,
        label: { ...text, minLength: 1, maxLength: 80 }
      }
    },
    node: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "label"],
      properties: {
        id: identifier,
        type: {
          enum: [
            "start",
            "end",
            "task",
            "decision",
            "subprocess",
            "data",
            "document"
          ]
        },
        label: { ...text, minLength: 1, maxLength: 80 },
        description: { ...text, minLength: 1, maxLength: 1000 },
        laneId: identifier
      }
    },
    edge: {
      type: "object",
      additionalProperties: false,
      required: ["id", "from", "to"],
      properties: {
        id: identifier,
        from: identifier,
        to: identifier,
        label: { ...text, minLength: 1, maxLength: 80 }
      }
    },
    sourceRef: {
      type: "object",
      additionalProperties: false,
      required: [
        "meetingId",
        "nodeId",
        "locatorType",
        "startOffset",
        "endOffset"
      ],
      properties: {
        meetingId: { type: "string", pattern: ULID_PATTERN },
        nodeId: identifier,
        locatorType: { const: "char_range" },
        startOffset: { type: "integer", minimum: 0 },
        endOffset: { type: "integer", minimum: 1 },
        quote: { ...text, minLength: 1, maxLength: 500 }
      }
    }
  }
} as const;

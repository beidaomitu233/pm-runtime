import type { DiagramDsl } from "./diagramTypes.js";

const meetingId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function flowchartFixture(suffix: number): DiagramDsl {
  return {
    schemaVersion: "0.1",
    diagramType: "flowchart",
    title: `流程图样例 ${suffix}`,
    orientation: suffix % 2 === 0 ? "horizontal" : "vertical",
    lanes: [],
    nodes: [
      { id: "start", type: "start", label: "开始" },
      { id: "task", type: "task", label: "处理请求", description: "执行基础处理" },
      { id: "end", type: "end", label: "结束" }
    ],
    edges: [
      { id: "edge-start-task", from: "start", to: "task" },
      { id: "edge-task-end", from: "task", to: "end" }
    ],
    sourceRefs: [
      {
        meetingId,
        nodeId: "task",
        locatorType: "char_range",
        startOffset: 0,
        endOffset: 4,
        quote: "处理请求"
      }
    ]
  };
}

function swimlaneFixture(suffix: number): DiagramDsl {
  return {
    schemaVersion: "0.1",
    diagramType: "swimlane",
    title: `泳道图样例 ${suffix}`,
    orientation: suffix % 2 === 0 ? "horizontal" : "vertical",
    lanes: [
      { id: "customer", label: "客户" },
      { id: "service", label: "服务方" }
    ],
    nodes: [
      { id: "start", type: "start", label: "开始" },
      { id: "submit", type: "task", label: "提交资料", laneId: "customer" },
      { id: "review", type: "decision", label: "资料完整？", laneId: "service" },
      { id: "end", type: "end", label: "结束" }
    ],
    edges: [
      { id: "edge-start-submit", from: "start", to: "submit" },
      { id: "edge-submit-review", from: "submit", to: "review" },
      { id: "edge-review-end", from: "review", to: "end", label: "是" }
    ]
  };
}

export const validDiagramFixtures: readonly DiagramDsl[] = [
  flowchartFixture(1),
  flowchartFixture(2),
  flowchartFixture(3),
  flowchartFixture(4),
  flowchartFixture(5),
  flowchartFixture(6),
  flowchartFixture(7),
  flowchartFixture(8),
  swimlaneFixture(9),
  swimlaneFixture(10)
];

function cloneFixture(fixture: DiagramDsl): DiagramDsl {
  return JSON.parse(JSON.stringify(fixture)) as DiagramDsl;
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function invalidFixture(
  name: string,
  mutate: (fixture: DiagramDsl) => void
): { name: string; value: unknown } {
  const fixture = cloneFixture(validDiagramFixtures[0]);
  mutate(fixture);
  return { name, value: fixture };
}

const invalidWithTooManyNodes = cloneFixture(validDiagramFixtures[0]);
invalidWithTooManyNodes.nodes.push(
  ...Array.from({ length: 99 }, (_, index) => ({
    id: `extra-${index}`,
    type: "task" as const,
    label: "额外节点"
  }))
);

export const invalidDiagramFixtures: readonly { name: string; value: unknown }[] = [
  invalidFixture("missing schemaVersion", (fixture) => {
    delete record(fixture).schemaVersion;
  }),
  invalidFixture("unsupported schemaVersion", (fixture) => {
    record(fixture).schemaVersion = "0.2";
  }),
  invalidFixture("unsupported diagram type", (fixture) => {
    record(fixture).diagramType = "mindmap";
  }),
  invalidFixture("empty title", (fixture) => {
    record(fixture).title = "";
  }),
  invalidFixture("title too long", (fixture) => {
    record(fixture).title = "长".repeat(121);
  }),
  invalidFixture("unsupported orientation", (fixture) => {
    record(fixture).orientation = "diagonal";
  }),
  invalidFixture("flowchart contains lanes", (fixture) => {
    fixture.lanes.push({ id: "unexpected", label: "不应存在" });
  }),
  invalidFixture("swimlane without lanes", (fixture) => {
    record(fixture).diagramType = "swimlane";
  }),
  invalidFixture("too few nodes", (fixture) => {
    fixture.nodes = [fixture.nodes[0]];
  }),
  { name: "too many nodes", value: invalidWithTooManyNodes },
  invalidFixture("node missing label", (fixture) => {
    delete record(fixture.nodes[0]).label;
  }),
  invalidFixture("unsupported node type", (fixture) => {
    record(fixture.nodes[0]).type = "event";
  }),
  invalidFixture("node has unknown property", (fixture) => {
    record(fixture.nodes[0]).unknown = true;
  }),
  invalidFixture("node id has invalid characters", (fixture) => {
    fixture.nodes[0].id = "node/id";
  }),
  invalidFixture("edge missing from", (fixture) => {
    delete record(fixture.edges[0]).from;
  }),
  invalidFixture("edge label empty", (fixture) => {
    fixture.edges[0].label = "";
  }),
  invalidFixture("edges are required", (fixture) => {
    fixture.edges = [];
  }),
  invalidFixture("sourceRef locator type", (fixture) => {
    record(fixture.sourceRefs![0]).locatorType = "timestamp";
  }),
  invalidFixture("sourceRef negative offset", (fixture) => {
    fixture.sourceRefs![0].startOffset = -1;
  }),
  invalidFixture("sourceRef quote too long", (fixture) => {
    fixture.sourceRefs![0].quote = "字".repeat(501);
  }),
  invalidFixture("sourceRef meeting id", (fixture) => {
    fixture.sourceRefs![0].meetingId = "meeting-1";
  }),
  invalidFixture("top-level unknown property", (fixture) => {
    record(fixture).unexpected = true;
  })
];

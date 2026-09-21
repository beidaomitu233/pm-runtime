# ADR: BE-017 Diagram 业务规则

日期：2026-09-21  
状态：v0.1 实现约定

## 规则

- Schema 通过后，业务 validator 再检查节点、边和泳道的跨对象关系。
- 节点和泳道 ID 必须唯一；边的 from/to 必须引用现有节点；禁止 self-loop。
- 图必须有 start 和 end；每个节点都必须从 start 可达并能到达 end。
- swimlane 中 task/decision 必须引用存在的 lane；flowchart 不接受 lane 或 node laneId。
- decision 至少有两条出边；分支 label 去空格并 NFC 规范化后必须非空且不重复。

## 重复边处理

完全相同的 `from`、`to` 和规范化 label 的重复边返回 warning，不阻止图继续进入后续渲染。这样保留了并行边的表达空间，同时让 UI 和 Agent 能发现重复输入；self-loop 仍为 error。warning/error 的输出顺序按 JSON Pointer 和规则编码稳定排序。

业务 validator 不负责 JSON Schema 类型、长度、数量和 sourceRefs 会议范围校验；这些规则由 contracts Schema 或后续专门 validator 负责。

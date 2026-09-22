# TASK-007 流程图生成完整闭环

状态：待开发  
依赖：TASK-001、TASK-002、TASK-003、TASK-004  
对应验收：A04、A06、A07 的 flowchart 部分  
业务目标：完成 PM Runtime 的第一条核心价值链。宿主 Agent 读取会议后提交 Diagram DSL v0.1，Runtime 校验语义、完成自动布局并生成确定性的 draw.io XML，Desktop 能立即看到并打开生成结果。

先在 `packages/contracts` 锁定 Diagram DSL JSON Schema、错误结构和合法/非法 fixtures；再实现业务规则校验、Graph Model、LayoutAdapter、flowchart layout 和 draw.io adapter。布局技术闸门必须先用固定样例验证 ELK.js、Dagre 或最终选型，ADR 锁定后再完成正式 renderer。DSL 不允许 Agent 提交坐标或 draw.io XML。

实现 diagrams/revisions 最小数据库结构、`POST /projects/:id/diagrams`、diagram list/detail API，以及 MCP `pm.diagram.render`、`pm.diagram.get`。Schema/业务规则失败不创建 diagram；进入渲染阶段失败可以记录 render_failed，但不能创建 ready revision。成功时创建 immutable revision 1，保存 DSL/drawio、hash、rendererVersion，并更新 diagram currentRevisionNo。

Desktop 完成 Diagrams 列表与最小 Detail，可以从生成结果直接定位到 diagram/revision，并下载或打开原始 drawio 源。此任务只要求 flowchart；泳道与来源追溯由 TASK-008 扩展。

验收至少使用 3 个脱敏/合成会议样例：顺序流程、decision 两分支、包含回退边的流程。正常 DSL 生成可由目标 draw.io 打开的 XML；默认布局无节点重叠；相同 DSL、相同 layout 配置和 renderer 版本产生相同规范 XML hash。缺字段、孤立 task、无 start/end、decision 单分支/重复标签、自环等非法 DSL 返回带 JSON Pointer/规则定位的错误，且列表中无 ready diagram。完成后项目经理应能从宿主调用 render，并立即在 Desktop 看到结果。

## 当前已有成果（2026-09-22 基线对齐，COM-048）

以下内容已在 `dev` 存在，复用不重做：

- `packages/contracts`：Diagram DSL JSON Schema、类型、fixtures、运行时校验（BE-002/003）。
- `packages/diagram-core`：schemaValidator、businessValidator（含 decision 分支/重复边 warning 等规则，BE-016/017，ADR `BE-017-diagram-rules.md`）、graphModel、sourceRefsValidator（BE-018）、layoutGate（BE-020 ADR：elkjs 主选/dagre 回退，30 节点无重叠自动化已过）。
- `diagrams`、`diagram_revisions`、`diagram_source_refs` 表及索引（0001_initial.sql）。
- 前端 `DiagramsPageEnhanced`、`DiagramDetailPageEnhanced` 页面骨架（FE-018/019）。

仍需完成（本任务验收缺口）：

- 生产布局实现（layoutGate 仅闸门对比，ADR 明确 BE-021/022 才是生产布局）与 draw.io XML 确定性 adapter。
- `POST /projects/:id/diagrams`、diagram list/detail API、revision 1 落盘（DSL/drawio/hash）、状态机 `rendering -> ready | render_failed`。
- MCP `pm.diagram.render`、`pm.diagram.get`。
- 泳道视觉评审（BE-020/COM-023 未完成项）由 TASK-008 承接，本任务只保证 flowchart 金样。

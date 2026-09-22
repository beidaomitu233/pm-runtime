# TASK-007 流程图生成完整闭环

状态：待开发  
依赖：TASK-001、TASK-002、TASK-003、TASK-004  
对应验收：A04、A06、A07 的 flowchart 部分  
业务目标：完成 PM Runtime 的第一条核心价值链。宿主 Agent 读取会议后提交 Diagram DSL v0.1，Runtime 校验语义、完成自动布局并生成确定性的 draw.io XML，Desktop 能立即看到并打开生成结果。

先在 `packages/contracts` 锁定 Diagram DSL JSON Schema、错误结构和合法/非法 fixtures；再实现业务规则校验、Graph Model、LayoutAdapter、flowchart layout 和 draw.io adapter。布局技术闸门必须先用固定样例验证 ELK.js、Dagre 或最终选型，ADR 锁定后再完成正式 renderer。DSL 不允许 Agent 提交坐标或 draw.io XML。

实现 diagrams/revisions 最小数据库结构、`POST /projects/:id/diagrams`、diagram list/detail API，以及 MCP `pm.diagram.render`、`pm.diagram.get`。Schema/业务规则失败不创建 diagram；进入渲染阶段失败可以记录 render_failed，但不能创建 ready revision。成功时创建 immutable revision 1，保存 DSL/drawio、hash、rendererVersion，并更新 diagram currentRevisionNo。

Desktop 完成 Diagrams 列表与最小 Detail，可以从生成结果直接定位到 diagram/revision，并下载或打开原始 drawio 源。此任务只要求 flowchart；泳道与来源追溯由 TASK-008 扩展。

验收至少使用 3 个脱敏/合成会议样例：顺序流程、decision 两分支、包含回退边的流程。正常 DSL 生成可由目标 draw.io 打开的 XML；默认布局无节点重叠；相同 DSL、相同 layout 配置和 renderer 版本产生相同规范 XML hash。缺字段、孤立 task、无 start/end、decision 单分支/重复标签、自环等非法 DSL 返回带 JSON Pointer/规则定位的错误，且列表中无 ready diagram。完成后项目经理应能从宿主调用 render，并立即在 Desktop 看到结果。

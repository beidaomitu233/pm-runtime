# PM Runtime v0.1 全栈任务板

版本：2026-09-22 架构收口稿  
派发依据：`PROJECT_DOCUMENT.md`、`ARCHITECTURE.md`、`DATABASE_PLAN.md`、`API_CONTRACT.md`

本表从 2026-09-22 起作为开发项目经理的任务调度入口。历史 `FRONTEND_PLAN.md`、`BACKEND_PLAN.md`、`TASK_STATUS.md` 仅保留追溯价值，不再直接派发 FE/BE/DB 独立任务。

任务状态统一使用：`待开发`、`开发中`、`待验收`、`需修改`、`已完成`、`阻塞`。一个 TASK 原则上由一个全栈 Agent 完成完整业务闭环，公共区由项目经理指定唯一负责人。

| TASK | 功能切片 | 依赖 | 主要修改范围 | 公共冲突区 | 状态 | 可视化验收 |
|---|---|---|---|---|---|---|
| TASK-001 | 工程基线与共享合同收口 | 无 | workspace、contracts、前端合同迁移 | contracts、根配置 | 待开发 | 前端与后端 workspace 可统一安装、typecheck、test、build |
| TASK-002 | Runtime 启动、Tauri 与存储底座 | 001 | src-tauri、runtime lifecycle、HTTP、storage 基线 | Tauri 配置、middleware、migration runner | 待开发 | Desktop 启动后 RuntimeGate 真实显示 ready/错误状态 |
| TASK-003 | 项目管理完整闭环 | 002 | projects UI/API/service/repository/migration | projects contract | 待开发 | 新建、重命名、切换项目，重启后仍存在 |
| TASK-004 | 会议粘贴导入与分块查看 | 003 | meeting UI/API/service/storage | meetings contract、文件事务 | 待开发 | 粘贴 5 万字并逐块查看，刷新/重启数据仍存在 |
| TASK-005 | TXT/MD/DOCX 文件导入 | 004 | meeting import、Tauri picker、解析安全 | parser 限制、meeting import contract | 待开发 | 三种文件真实导入，损坏/超限文件有明确错误 |
| TASK-006 | 第一宿主 MCP 读取会议 | 004 | MCP stdio、project/meeting tools、第一宿主 adapter | MCP schema、runtime state | 待开发 | 第一宿主读取同一 project/meeting 与完整分块正文 |
| TASK-007 | 流程图生成完整闭环 | 001-004 | DSL、diagram-core、render API/MCP、Diagrams UI | Diagram DSL、layout adapter | 待开发 | 宿主提交 DSL 后 Desktop 出现可打开 draw.io 流程图 |
| TASK-008 | 泳道图与来源追溯 | 007 | swimlane layout、sourceRefs、详情 UI | DSL/sourceRefs | 待开发 | 3+ 泳道、10+ 节点正确渲染并可核对来源片段 |
| TASK-009 | 离线编辑与 Revision 历史 | 007 | local diagrams.net、revision API/DB/UI | editor bridge、revision contract | 待开发 | 编辑后保存 revision 2，revision 1 保持不变并可查看 |
| TASK-010 | drawio/SVG/PNG 导出 | 009 | export adapter、revision_artifacts、UI | artifact contract、离线编辑器 | 待开发 | 三格式均可打开、中文正常、失败不破坏源 revision |
| TASK-011 | 第二宿主与连接管理 | 006、007 | agent-adapters、Connections UI | 宿主配置 patch、MCP schema | 待开发 | 两个宿主读取同一 meeting 并调用相同渲染工具 |
| TASK-012 | 恢复、诊断、Windows 打包与发布验收 | 003-011 | recovery、diagnostics、package、fixtures、E2E | 全局构建/发布配置 | 待开发 | Windows 无 Node 环境完成 A01-A10 全量回归 |

当前已有代码应吸收到新任务中，不重复实现：提交 `7eb06e2` 的 FE-001～006 前端基础主要归入 TASK-001/TASK-002；提交 `0157da3`、`b70e2b6` 的 BE-001 workspace 骨架归入 TASK-001。它们只能作为已有实现证据，不能直接视为新的纵向 TASK 已完成。

并发建议：TASK-005 与 TASK-006 可在 TASK-004 验收后并行；TASK-011 在 TASK-006 完成后可与 TASK-008～010 的后续工作并行。其他并行任务由开发项目经理结合实际修改文件再次判断，涉及同一公共合同、migration runner、Tauri 配置或 Diagram DSL 时优先串行。

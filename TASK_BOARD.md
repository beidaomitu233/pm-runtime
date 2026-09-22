# PM Runtime v0.1 全栈任务板

版本：2026-09-22 架构收口稿（2026-09-22 基线对齐 `dev` 实际代码）  
派发依据：`PROJECT_DOCUMENT.md`、`ARCHITECTURE.md`、`DATABASE_PLAN.md`、`API_CONTRACT.md`

本表从 2026-09-22 起作为开发项目经理的任务调度入口。历史 `FRONTEND_PLAN.md`、`BACKEND_PLAN.md`、`TASK_STATUS.md` 仅保留追溯价值，不再直接派发 FE/BE/DB 独立任务。

任务状态统一使用：`待开发`、`开发中`、`待验收`、`需修改`、`已完成`、`阻塞`。一个 TASK 原则上由一个全栈 Agent 完成完整业务闭环，公共区由项目经理指定唯一负责人。

| TASK | 功能切片 | 依赖 | 主要修改范围 | 公共冲突区 | 状态 | 可视化验收 |
|---|---|---|---|---|---|---|
| TASK-001 | 工程基线与共享合同收口 | 无 | workspace、contracts、前端合同迁移 | contracts、根配置 | 已完成 | 前端与后端 workspace 可统一安装、typecheck、test、build |
| TASK-002 | Runtime 启动、Tauri 与存储底座 | 001 | src-tauri、runtime lifecycle、HTTP、storage 基线 | Tauri 配置、middleware、migration runner | 开发中 | Desktop 启动后 RuntimeGate 真实显示 ready/错误状态 |
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

## 当前基线吸收范围（2026-09-22 对齐 `dev` 实际代码，COM-048）

以下成果已在 `dev` 中存在，属于对应 TASK 的已有实现证据，Agent 必须复用而非重复实现；但均不等于该纵向 TASK 已完成，缺口见"仍需完成"。

| TASK | 已在 dev 中存在 | 仍需完成（本任务核心缺口） |
|---|---|---|
| TASK-001 | `@pm/contracts` 全套（schemas/types/validation/diagram*/fixtures+测试，COM-019/042）；pnpm workspace、`pnpm-lock.yaml`、`check` 脚本（COM-026） | 已收口（本任务）：`src/types/contracts.ts`、`meetingContracts.ts`、`diagramContracts.ts` 删除，前端 `src/api` 与页面全部改为消费 `@pm/contracts`，字段/Schema 按 `API_CONTRACT.md` 补全（COM-046/050）；`pnpm check`/`pnpm build` 全绿，lockfile 冻结安装可复现 |
| TASK-002 | daemon/lifecycle/HTTP 基线+session token+统一 envelope（BE-004/005、COM-029/030/036）；migration runner、runtime DB、file store、backup、SQLite 闸门（BE-006/007/008、DB-002/005/006，ADR 见 `docs/decisions/`）；健康检查与浏览器开发期注入已通（B-6 已解） | 完全没有 `src-tauri/`（B-4）；Tauri capability、sidecar 生命周期接入、Tauri 注入替换开发期注入；Windows 自包含 sidecar 打包闸门未过（BE-006 ADR 标部分验证/阻塞） |
| TASK-003 | `projects` 表+两个索引（0001_initial.sql）、repository base+ULID（DB-005）、ProjectsPageEnhanced 前端页 | `GET/POST/PATCH /api/v1/projects` 业务路由与 project service 全缺（B-3）；Idempotency-Key、cursor 分页接入、重启持久化真实验证 |
| TASK-004 | `meetings` 表+索引（0001_initial.sql）、Meetings/MeetingDetail Enhanced 前端页、file store 基础 | meeting service、粘贴导入 API、临时文件→hash→事务→原子落盘链路、`GET /meetings/:id/content` 分块读取全缺（B-3） |
| TASK-007 | Diagram DSL Schema+业务校验器+Graph Model+sourceRefs 校验器+layout 闸门（BE-016~020、ELK 主选 ADR）；`diagrams`/`diagram_revisions`/`diagram_source_refs` 表；Diagrams Enhanced 前端页 | `POST /projects/:id/diagrams` render API、draw.io XML 生产 adapter、revision 1 落盘、MCP `pm.diagram.render/get`、失败状态闭环全缺 |
| TASK-005/006/008-012 | 008 的 sourceRefs 校验器已部分存在（随 007 吸收） | 基本全部待开发，按各自 TASK 文档执行 |

并发建议：TASK-005 与 TASK-006 可在 TASK-004 验收后并行；TASK-011 在 TASK-006 完成后可与 TASK-008～010 的后续工作并行。其他并行任务由开发项目经理结合实际修改文件再次判断，涉及同一公共合同、migration runner、Tauri 配置或 Diagram DSL 时优先串行。

**派发顺序（PM 决定）**：TASK-001（contracts 公共区唯一负责人，先收口前端重复合同）→ 验收后 TASK-002（补 src-tauri）→ TASK-003 → TASK-004。003/004 将解除集成报告 B-3（当前唯一实质性功能缺口）。TASK-001 与 TASK-002 涉及根配置/health contracts 交叠，本轮串行。

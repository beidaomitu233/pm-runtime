# PM Runtime MVP v0.1 项目总文档

版本：v0.1 开发规划稿
日期：2026-09-21
读者：产品负责人、架构与审查模型、前端模型、后端模型、数据库模型、测试人员

## 1 项目结论

PM Runtime v0.1 只交付一个可验收闭环：用户在本地桌面端创建项目并导入会议记录，宿主 Agent 通过 MCP 读取会议内容、按 Diagram DSL v0.1 生成流程语义，Runtime 校验并生成可编辑的 draw.io 流程图或泳道图，用户随后编辑、保存版本并导出 `.drawio`、SVG、PNG。

本版不实现独立 AI Agent、模型路由、录音转写、PRD、排期、待办、需求变更、团队协作和云同步。目录中现有《需求讨论记录.md》《应用功能清单.md》及 `prototype/` 描述的是此前的项目协作平台方向，不作为 PM Runtime v0.1 的功能基线，也不在本次计划中改造。

## 2 需求来源与决策标记

### 2.1 来源优先级

1. 用户当前请求与本文件后续经确认的 Communication 结论。
2. `PM_Runtime_产品与MVP技术方案_v0.1.docx` 中的产品目标、P0 范围和验收标准。
3. 本规划为消除实现歧义补充的架构建议与合理假设。
4. 外部官方技术文档只用于验证实现可行性，不自动扩大产品范围。

### 2.2 标记规则

- **已确认需求**：附件明确列为 v0.1 P0 或用户当前请求明确要求。
- **规划假设**：为形成可执行计划而暂定，可在开发前调整。
- **待确认项**：会影响范围、兼容性、安全或验收口径，记录在本文第 22 节和 `COMMUNICATION.md`。

## 3 项目背景与目标

### 3.1 背景

产品经理的会议信息常停留在长文本和 Agent 会话中，缺少稳定的结构、可编辑产物和长期本地记录。PM Runtime 将宿主 Agent 的语义理解能力与本地确定性工具结合：Agent 负责理解，Runtime 负责数据、校验、布局、文件和版本。

### 3.2 v0.1 目标

- 支持创建、重命名、切换项目，重启后数据可恢复。
- 支持粘贴文本及导入 TXT、MD、DOCX，单份会议至少支持 5 万中文字符。
- 支持 Agent 按项目、会议 ID、日期或最近一次会议读取元数据和分块正文。
- 定义并校验 Diagram DSL v0.1，覆盖流程图和泳道图。
- 生成方向统一、节点语义正确、分支清楚、无孤立任务的 draw.io 文件。
- 支持编辑图形、保存不可变 revision、恢复历史版本和导出三种格式。
- 支持 Codex 与至少一个第二宿主 Agent 的同一套 MCP 工具联调。
- 使用至少 10 份脱敏会议样例进行人工对照评审。

### 3.3 非目标

- 不调用或托管任何 LLM，不保存模型 API Key。
- 不做聊天界面；自然语言交互继续发生在宿主 Agent。
- 不做录音、转写、说话人识别和 OCR。
- 不做 PDF 导入。
- 不做 BPMN 全规范、复杂手工画布或通用制图平台。
- 不做账号、组织、在线协同、云备份和远程 MCP 发布。
- 不做 PRD、任务、排期、风险、变更和邮件管理。

## 4 成功标准与质量门槛

| 编号 | 维度 | v0.1 通过标准 |
|---|---|---|
| A01 | 项目持久化 | 创建、重命名、切换项目；应用重启后仍存在 |
| A02 | 会议导入 | 5 万中文字符可保存、查看和按块读取；不静默截断 |
| A03 | Agent 接入 | Codex 和第二宿主可读取同一 `meeting_id` 并调用同一渲染工具 |
| A04 | 流程图 | 脱敏真实样例可生成可编辑流程图，主要流程连通 |
| A05 | 泳道图 | 至少 3 个泳道、10 个以上节点正确渲染；活动责任归属可核对 |
| A06 | 判断分支 | 每个 decision 至少两条出边，分支标签不为空且不重复 |
| A07 | 校验修复 | 非法 DSL 返回结构化字段路径和错误码，不落正式 revision |
| A08 | 编辑版本 | 移动节点、改文字、增删连接后可保存新 revision，旧 revision 不变 |
| A09 | 导出 | `.drawio`、SVG、PNG 均可打开，中文无乱码，文件归属正确 |
| A10 | 恢复 | Runtime 异常退出后，不丢已提交事务和已写完的产物文件 |
| Q01 | 图形可读性 | 100% 缩放时文字可读，默认布局无节点重叠，跨泳道线不过度穿越 |
| Q02 | 可追溯性 | 生成 revision 保存来源会议，节点可保存 sourceRefs |

## 5 用户角色与权限

v0.1 为单机单用户产品，不引入账号与 RBAC。权限仍按调用主体和动作分层，避免任何本地进程都能修改项目数据。

| 主体 | 使用位置 | 允许动作 | 禁止或受限动作 |
|---|---|---|---|
| 本机用户 | Desktop UI | 管理项目和会议、查看图、编辑、保存、导出、安装连接配置 | 不能通过 UI 绕过 Runtime 直接改 SQLite 或产物目录 |
| 宿主 Agent | Codex、Claude Code 或其他兼容宿主 | 读取项目/会议；提交 DSL 渲染；读取图形；在明确调用时保存新 revision | 不能任意读本机文件；不能传入绝对输出路径；删除默认不暴露给 MCP |
| Tauri 桌面壳 | 本机进程 | 启停 sidecar、打开文件选择器、代理受控文件操作、展示状态 | 仅启用列入 capability 的命令和 sidecar 参数 |
| Runtime sidecar | 127.0.0.1 与 stdio | 唯一数据库写入者；解析、校验、渲染、版本和文件管理 | 不监听公网地址；不主动上传数据 |
| 审查/测试人员 | 开发环境 | 运行测试、检查测试语料和验收证据 | 真实会议材料必须脱敏后进入仓库 |

只读 MCP 工具与写入工具必须分别标注。`project.list/get`、`meeting.list/get`、`diagram.get` 为只读；`diagram.render`、`diagram.save_revision` 为写入。宿主侧的审批策略由宿主配置控制，Runtime 不宣称能够替代宿主审批。

## 6 核心业务流程

### 6.1 首次安装与连接

1. 用户安装并启动 PM Runtime Desktop。
2. Tauri 启动 `pm-runtime-sidecar daemon`，sidecar 绑定随机回环端口并生成当前会话令牌。
3. Desktop 读取健康检查并展示 Runtime、数据库、数据目录状态。
4. 用户选择宿主 Agent；安装向导展示将要写入的命令和配置位置。
5. 用户确认后，安装器备份原配置并登记 `pm-runtime-sidecar mcp-stdio`。
6. 用户在宿主中查看 MCP 工具；失败时在设置页复制诊断信息。

### 6.2 导入会议

1. 用户选择项目，在 Meetings 页面粘贴文本或选择 TXT、MD、DOCX。
2. 前端完成必填与大小预检；Runtime 再执行可信校验。
3. Runtime 创建临时目录，保存原文件，解析为 UTF-8 规范文本并计算 SHA-256。
4. 解析成功后在同一事务写入 meeting 元数据，再原子移动文件到正式目录。
5. 返回 `meeting_id`、字符数和读取分块信息；解析失败保留可诊断错误，不创建 ready 会议。

### 6.3 Agent 生成图形

1. 用户在宿主 Agent 中说明项目、会议和图类型。
2. Agent 调用 `pm.project.list/get` 与 `pm.meeting.list/get` 获取上下文。
3. meeting-to-diagram Skill 固定执行范围识别、角色识别、动作/判断/分支提取、DSL 自检。
4. Agent 调用 `pm.diagram.render` 提交 Diagram DSL。
5. Runtime 依次执行 JSON Schema 校验、业务规则校验、Graph Model 转换、布局和 draw.io XML 生成。
6. 校验失败时返回结构化错误，Agent 修复后重试；失败请求不创建 ready revision。
7. 成功后返回 `diagram_id`、`revision_no`、摘要和 Desktop 可定位信息。

### 6.4 编辑、保存与导出

1. 用户从 Diagrams 页面打开指定 revision。
2. 本地嵌入编辑器载入该 revision 的 draw.io XML。
3. 用户修改后点击保存；前端提交 XML、基础 revision 和可选更新后的 DSL。
4. Runtime 使用乐观锁检查基础 revision，生成下一个不可变 revision。
5. 导出时由受控的离线编辑器/导出适配器生成 SVG 或 PNG，Runtime 写入该 revision 的目录。
6. 导出失败只更新错误结果，不删除 DSL 和 draw.io 源文件。

## 7 系统架构

### 7.1 组件关系

```text
Host Agent
  └─ stdio ─ pm-runtime-sidecar mcp-stdio
                 └─ loopback + session token ─ Runtime daemon
                                                     ├─ SQLite
                                                     ├─ Project files
                                                     ├─ Diagram validator and renderer
                                                     └─ Structured logs

Tauri Desktop
  ├─ React UI
  ├─ Tauri capabilities and file dialogs
  ├─ local draw.io web assets
  └─ loopback + session token ─ Runtime daemon
```

### 7.2 技术栈决策

| 层 | 决策 | 理由与边界 |
|---|---|---|
| Monorepo | pnpm workspace | 前端、sidecar、contracts、diagram-core 共用 TypeScript 契约 |
| Desktop | Tauri 2 + React + TypeScript + Vite | Windows 优先，壳层只负责生命周期、权限和系统能力 |
| Sidecar | Node.js Active LTS + TypeScript，打包为自包含二进制 | 复用 MCP 与图形生态；最终用户无需预装 Node.js |
| Internal API | Fastify，本机回环 HTTP，随机端口 | Desktop 与多个 stdio 适配进程共用一个数据写入者 |
| MCP | 官方 TypeScript SDK稳定版，stdio | 本地宿主可用，工具 Schema 与内部服务隔离 |
| Contracts | JSON Schema 2020-12 + Ajv；TypeScript 类型由 Schema 生成或同源维护 | DSL 与 API 的运行时校验不可只依赖 TS 类型 |
| Database | SQLite，`foreign_keys=ON`，WAL，单 daemon 写入 | Local First；不使用网络共享目录 |
| Diagram | 自定义 Graph Model + ELK.js 技术评估；确定性 draw.io XML adapter | Agent 不生成坐标与 XML；Dagre 作为回退评估项 |
| Editor | 固定版本的本地 diagrams.net 静态资源 + `postMessage` 适配器 | 会议与图形数据不发送到在线编辑器；先完成技术闸门 |
| Test | Vitest、React Testing Library、Playwright、MCP in-memory/stdio 集成测试 | 每层均可独立验证，关键闭环有桌面端 E2E |

技术依据：Tauri 支持将自包含 Node 应用作为 external binary sidecar；Codex 支持本地 stdio MCP 配置；MCP 官方 TypeScript SDK支持本地 transport；draw.io 的嵌入交互基于 `postMessage`。版本号在实现分支建立时锁定，后续只做经测试的升级。

### 7.3 建议目录

```text
apps/
  desktop/                 # Tauri + React
  runtime-sidecar/         # daemon 与 mcp-stdio 两种启动模式
packages/
  contracts/               # API、MCP、Diagram DSL Schema 与错误码
  storage/                 # SQLite repository、迁移、文件目录事务
  meeting-import/          # TXT/MD/DOCX 解析与规范化
  diagram-core/            # validator、Graph Model、layout、draw.io adapter
  agent-adapters/          # Codex/第二宿主安装与诊断
  test-fixtures/           # 脱敏会议语料、DSL 与参考结果
docs/
  decisions/               # ADR，技术闸门结论
```

## 8 系统模块划分

| 模块 | 输入 | 输出 | 责任边界 |
|---|---|---|---|
| Desktop Control Center | 用户操作、API 数据 | 项目/会议/图形/连接界面 | 不包含模型推理，不直写数据库 |
| Runtime Lifecycle | Desktop 启停、端口、令牌 | daemon 状态、诊断信息 | 单实例、优雅停止、崩溃恢复 |
| Project Service | 项目名称和 ID | 项目摘要与详情 | 项目创建、重命名、切换所需数据 |
| Meeting Import | 文本或支持文件 | 原文件、规范文本、元数据 | 大小、编码、解析、原子落盘、分块读取 |
| MCP Adapter | 工具调用 | 结构化结果和可读摘要 | stdout 只传 MCP 协议，日志写 stderr/文件 |
| Diagram Contract | DSL JSON | 校验结果、Graph Model | Schema 与业务规则唯一来源 |
| Diagram Renderer | Graph Model | draw.io XML、布局元数据 | 不做语义推理；同输入同配置应稳定输出 |
| Diagram Revision | 保存请求 | 不可变 revision | 乐观锁、文件哈希、当前版本推进 |
| Export Adapter | revision XML | SVG、PNG、drawio | 导出失败不破坏源文件 |
| Agent Adapter | 宿主类型和路径 | 配置备份、安装/诊断结果 | 未经确认不覆盖宿主配置 |
| Local Store | 事务和相对路径 | SQLite 行和项目文件 | 校验路径、控制写入顺序、支持恢复 |

## 9 前端页面结构

MVP 主导航只保留 4 个一级入口。

| 页面 | 路由 | 核心内容 | 主要操作 |
|---|---|---|---|
| Projects | `/projects` | 项目列表、最近项目、空状态 | 新建、重命名、进入项目 |
| Meetings | `/projects/:projectId/meetings` | 会议列表、来源、字符数、导入结果 | 粘贴、文件导入、查看原文、复制 ID |
| Diagrams | `/projects/:projectId/diagrams` | 类型、来源会议、当前 revision、更新时间 | 打开、查看版本、导出、删除/归档待确认 |
| Diagram Editor | `/projects/:projectId/diagrams/:diagramId/edit` | 本地 draw.io 编辑器、保存状态、revision | 编辑、保存新版本、导出、返回 |
| Connections Settings | `/settings/connections` | Runtime、数据目录、宿主连接、日志 | 安装/修复配置、复制诊断、打开目录 |

详细组件、状态和页面任务见 `FRONTEND_PLAN.md`。

## 10 后端服务结构

### 10.1 Runtime daemon

- `LifecycleService`：单实例锁、端口、令牌、健康检查和关闭。
- `ProjectService`：项目 CRUD 的 v0.1 子集。
- `MeetingService`：导入、解析、列表、详情和字符分块。
- `DiagramService`：创建图、校验、渲染、读取和 revision。
- `ExportService`：导出任务与文件登记。
- `AdapterService`：宿主检测、配置备份、安装和诊断。
- `StorageService`：迁移、事务、Repository、相对路径和原子文件写入。
- `LogService`：本地结构化日志、request ID 和隐私过滤。

### 10.2 MCP stdio bridge

MCP 进程只负责协议、工具描述、输入校验和调用 daemon。它不打开 SQLite，不解析会议，不生成 XML。若 daemon 未运行，返回 `RUNTIME_UNAVAILABLE` 和启动指引。stdio 的 stdout 只允许协议数据，诊断信息写 stderr。

### 10.3 内部 API 路由概要

| 方法 | 路由 | 用途 |
|---|---|---|
| GET | `/api/v1/health` | Runtime、DB schema、数据目录和版本状态 |
| GET/POST | `/api/v1/projects` | 项目列表和创建 |
| GET/PATCH | `/api/v1/projects/:projectId` | 项目详情和重命名 |
| GET/POST | `/api/v1/projects/:projectId/meetings` | 会议列表和粘贴文本导入 |
| POST | `/api/v1/projects/:projectId/meetings/import` | TXT/MD/DOCX 文件导入 |
| GET | `/api/v1/meetings/:meetingId` | 会议元数据 |
| GET | `/api/v1/meetings/:meetingId/content` | `offset`、`limit` 分块正文 |
| GET/POST | `/api/v1/projects/:projectId/diagrams` | 图形列表和 DSL 渲染 |
| GET | `/api/v1/diagrams/:diagramId` | 图形及当前 revision |
| GET | `/api/v1/diagrams/:diagramId/revisions` | revision 列表 |
| GET | `/api/v1/diagrams/:diagramId/revisions/:revisionNo` | 指定版本内容 |
| POST | `/api/v1/diagrams/:diagramId/revisions` | 保存编辑后的新 revision |
| POST | `/api/v1/diagrams/:diagramId/exports` | 记录/生成目标格式导出 |
| GET | `/api/v1/connections` | 宿主适配状态 |
| POST | `/api/v1/connections/:host/install` | 经确认后备份并安装配置 |
| GET/PATCH | `/api/v1/settings` | 非敏感设置读取和修改 |

完整请求、响应、错误码和任务见 `BACKEND_PLAN.md`。

## 11 数据库核心实体

| 实体 | 用途 | 关键关系 |
|---|---|---|
| `schema_migrations` | 记录迁移版本和校验和 | 独立 |
| `projects` | 项目基本信息 | 1 对多 meetings、diagrams |
| `meetings` | 会议元数据和文件相对路径 | 属于 project；被 diagrams/source refs 引用 |
| `diagrams` | 图形主记录与当前 revision | 属于 project，可关联一个来源 meeting |
| `diagram_revisions` | 不可变 DSL/drawio/导出路径和哈希 | 属于 diagram，`revision_no` 唯一递增 |
| `diagram_source_refs` | revision 节点到会议片段的来源映射 | 属于 revision 与 meeting |
| `agent_adapters` | 宿主类型、配置路径、安装与检查状态 | 独立，可按宿主唯一 |
| `settings` | 非敏感 JSON 设置 | key 唯一 |

正文和大文件保存在项目目录，数据库只保存相对路径、哈希和状态。字段、索引、约束、删除和迁移策略见 `DATABASE_PLAN.md`。

## 12 接口协作原则

1. `packages/contracts` 是 API、MCP、DSL 和错误码的唯一契约来源；各端不得复制手写不同版本。
2. 所有契约带 `schemaVersion` 或 API 大版本。破坏性变更先改文档和 Schema，再由调用方升级。
3. 成功响应为 `{ data, requestId }`；失败响应为 `{ error: { code, message, details, retryable }, requestId }`。
4. 时间统一为 UTC ISO 8601；前端按本地时区显示。ID 使用 ULID 字符串，不把文件名当主键。
5. 所有文件路径经 API 传递时只返回项目数据根目录内的相对路径或 artifact ID，不返回可由 Agent 控制的任意绝对路径。
6. 列表接口必须分页；MVP 默认 50，最大 200。会议正文使用字符 offset，不使用页码猜测。
7. 写请求支持 `Idempotency-Key`；保存 revision 还需 `baseRevisionNo`，冲突返回 409。
8. MCP 工具返回机器可读结构和简短文本摘要；不得把 5 万字符正文附在错误消息或日志中。
9. 先提交契约和示例，再分别实现数据库、后端和前端。契约冲突写入 `COMMUNICATION.md`。

## 13 Diagram DSL v0.1 契约

### 13.1 顶层字段

| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `schemaVersion` | string | 是 | 固定 `0.1` |
| `diagramType` | enum | 是 | `flowchart` 或 `swimlane` |
| `title` | string | 是 | 1-120 字符 |
| `orientation` | enum | 是 | `horizontal` 或 `vertical` |
| `lanes` | array | 条件 | swimlane 至少 1 个；flowchart 必须为空数组 |
| `nodes` | array | 是 | 2-100；ID 在图内唯一 |
| `edges` | array | 是 | 1-200；from/to 引用现有节点 |
| `sourceRefs` | array | 否 | v0.1 建议提供；每项引用 meeting 和 node |

### 13.2 节点与边

- 节点类型：`start`、`end`、`task`、`decision`、`subprocess`、`data`、`document`。
- `task`、`decision` 在泳道图中必须有 `laneId`。
- label 为 1-80 字符，推荐 6-18 个汉字；长说明放 `description`，最大 1000 字符。
- 每张图至少一个 start 和一个 end；不允许孤立 task；所有主要节点从 start 可达。
- decision 至少两条出边，每条有非空 `label`，同一 decision 的分支 label 不重复。
- edge 包含稳定 `id`、`from`、`to`、可选 `label`；禁止 from 与 to 相同。
- sourceRef v0.1 使用 `meetingId`、`nodeId`、`locatorType=char_range`、`startOffset`、`endOffset`、可选 `quote`。时间戳定位留给录音版本。

业务校验可返回 warning 和 error。存在 error 时拒绝渲染；warning 随成功结果返回并在 UI 中展示。

## 14 状态流转

### 14.1 Meeting

`importing -> ready`；解析失败进入 `failed`。failed 记录只保存错误元数据和可清理临时文件，不允许 MCP 读取正文。重新导入生成新的 meeting，不覆盖旧记录。

### 14.2 Diagram

`validating -> rendering -> ready`。校验失败为 `validation_failed`，渲染失败为 `render_failed`。成功后创建 revision 1 并将 diagram 置为 ready。后续编辑以 ready revision 为基础创建新 revision；冲突不自动覆盖。

### 14.3 Export

`pending -> exporting -> succeeded` 或 `failed`。失败可重试；同 revision、格式和内容哈希的重复请求复用已有成功文件。

### 14.4 Connection

`not_installed -> installed -> connected`。检测失败为 `error`，修复成功回到 installed/connected。状态代表配置和探测结果，不代表宿主当前一定打开。

## 15 异常场景说明

| 错误码 | 场景 | 用户可见处理 | 数据处理 |
|---|---|---|---|
| `VALIDATION_SCHEMA_ERROR` | DSL 缺字段、类型错误 | 显示字段路径，Agent 可修复重试 | 不创建 diagram/revision |
| `VALIDATION_RULE_ERROR` | 孤立节点、无分支、lane 不存在 | 返回规则列表 | 不生成 draw.io |
| `PROJECT_NOT_FOUND` | 项目已删除或 ID 错误 | 返回项目列表入口 | 无写入 |
| `MEETING_TOO_LARGE` | 超过配置上限 | 显示上限和拆分建议 | 临时文件清理 |
| `IMPORT_UNSUPPORTED_TYPE` | 非 TXT/MD/DOCX | 显示支持格式 | 无正式记录 |
| `IMPORT_PARSE_FAILED` | DOCX 损坏或编码失败 | 保留错误码，可重新选择文件 | 不生成 ready meeting |
| `CONFLICT_REVISION` | 基础 revision 已落后 | 提示重新载入或另存 | 不覆盖当前版本 |
| `RENDERER_ERROR` | 布局或 XML 生成失败 | 保留 DSL 和 requestId | 失败产物不进入正式目录 |
| `EXPORT_ERROR` | SVG/PNG 导出失败 | 可重试，仍可下载 drawio | 源 revision 保留 |
| `RUNTIME_UNAVAILABLE` | daemon 未运行 | 设置页提供启动/诊断 | MCP 不自行改库 |
| `UNAUTHORIZED_LOCAL_CLIENT` | 令牌缺失/错误 | 拒绝并记录最小日志 | 无写入 |
| `PATH_OUT_OF_SCOPE` | 路径穿越或软链接逃逸 | 拒绝操作 | 无写入 |
| `INTERNAL_ERROR` | 未分类错误 | 通用提示和 requestId | 事务回滚，日志去敏 |

## 16 安全与隐私要求

- daemon 仅绑定 `127.0.0.1`，使用随机端口和高熵会话令牌；禁止 `0.0.0.0`。
- 数据根目录由 Runtime 创建；所有项目路径由 ID 派生，拒绝 `..`、绝对路径和越界软链接。
- 导入前检查扩展名、MIME/文件签名、文件大小；DOCX 只解析文本和结构，不执行宏、外链或嵌入对象。
- 本地 draw.io 资源使用固定版本和严格 CSP；不加载远程脚本、模板、字体或插件。
- Tauri capability 使用最小权限，仅允许启动已登记 sidecar 和选择/打开受控文件。
- 宿主配置修改前展示 diff、备份原文件并支持恢复；不记录宿主令牌和环境变量值。
- 日志不记录完整会议正文、DSL quote 或本机用户名路径；仅记录 ID、大小、耗时、错误码和 requestId。
- 测试仓库只放脱敏样例；真实客户文件不进入 Git、构建产物或问题截图。
- v0.1 不承诺数据库加密。若设备共享或合规要求存在，需在发布前确认是否增加 OS 凭据和加密存储。

## 17 性能与可扩展要求

以下为规划假设，需在首个可运行垂直切片后用目标 Windows 设备校准。

| 项目 | 目标 |
|---|---|
| 冷启动 | Desktop 可交互且健康状态可见，P95 小于 5 秒 |
| 列表查询 | 1000 个会议或图形元数据下，P95 小于 300 ms |
| 文本导入 | 5 万中文字符 TXT/MD，P95 小于 2 秒；DOCX P95 小于 5 秒 |
| MCP 分块读取 | 单块默认 8000 字符，最大 20000；P95 小于 500 ms |
| DSL 校验 | 100 节点、200 边，P95 小于 500 ms |
| 图形渲染 | 30 节点、6 泳道，P95 小于 5 秒，无重叠为验收前提 |
| revision 保存 | 文件与数据库原子提交，P95 小于 2 秒 |
| 资源 | 空闲时 sidecar 不进行轮询密集任务；日志和临时文件有上限 |

扩展边界：Diagram DSL 与 Graph Model 不依赖 draw.io；MCP adapter 不依赖 Desktop；数据路径全部相对化；V0.2 Capture 只能通过新模块写入 meetings，不改现有 meeting 读取契约。

## 18 开发阶段与依赖

| 工作包 | 任务数建议 | 前置依赖 | 可验收输出 |
|---|---:|---|---|
| WP0 契约与技术闸门 | 6-8 | 无 | DSL Schema、API/MCP 契约、sidecar/离线 draw.io/导出验证结论 |
| WP1 工程骨架与存储 | 6-8 | WP0 核心结论 | Tauri 启动 daemon、迁移、项目和健康检查 |
| WP2 会议导入与读取 | 6-8 | WP1 | 三种文件导入、5 万字、分块读取、MCP 读取 |
| WP3 Diagram Core | 8-10 | WP0、WP1 | 校验、Graph Model、flowchart、swimlane、drawio XML |
| WP4 编辑与版本导出 | 6-8 | WP0 编辑器闸门、WP3 | 编辑、revision、三格式导出 |
| WP5 Agent 适配 | 5-7 | WP2、WP3 | Codex 与第二宿主安装、诊断、同工具联调 |
| WP6 稳定性与打包 | 6-8 | WP1-WP5 | 10 份语料、异常恢复、安全检查、Windows 安装包 |

附件给出的 32-42 人天仅作为量级参考。排期从技术闸门通过后开始承诺；若离线编辑器或 sidecar 打包失败，需先在 `COMMUNICATION.md` 记录替代决策。

## 19 Git 协作规范

### 19.1 分支

- 主分支：`main`，只接收已验收合并。
- 集成分支：`dev`，承接通过任务包自测的变更。
- 前端：`feature/frontend-模块名`。
- 后端：`feature/backend-模块名`。
- 数据库：`feature/database-模块名`。
- 文档：`docs/architecture-plan`。

### 19.2 提交与合并

- 每完成一个 5-10 项任务包至少提交一次；一个提交只包含一个明确目的。
- 提交信息示例：`docs: update architecture plan`、`feat(frontend): complete meetings import`、`feat(backend): complete diagram render api`、`feat(database): add diagram revision schema`、`test: add diagram contract tests`、`fix: resolve review issue`。
- 执行模型完成任务后必须依次：运行测试；按验收标准自检；勾选对应 Plan；更新 Communication；提交 Git。
- 先合并数据库迁移和 contracts，再合并后端，再合并依赖接口的前端；允许 mock UI 先行，但 mock 字段必须来自 contracts。
- 禁止在功能分支静默修改已发布 Schema、错误码和迁移历史。冲突先记录 Communication，再由负责人与审查模型确认。
- 合并到 `dev` 需附测试命令与结果；合并到 `main` 需完成对应工作包验收和回归。

## 20 完成定义

每个任务只有同时满足以下条件才能勾选完成：

- 实现未超出任务范围，输入、输出和异常与合同一致。
- 自动测试通过，相关人工路径有实际记录。
- 数据迁移可从空库执行，也能从前一版本升级；失败可恢复。
- 日志无会议正文、密钥和非必要本机路径。
- Plan 验收项逐条自检完成，关联任务已勾选。
- 接口或范围差异已写入 `COMMUNICATION.md` 并得到结论。
- 已提交到正确分支，提交信息符合规范。

## 21 主要风险与缓解

| 风险 | 影响 | 缓解和技术闸门 |
|---|---|---|
| 本地 diagrams.net 嵌入协议或许可不满足 | 编辑与导出阻塞 | WP0 固定版本验证离线启动、载入、保存、导出和许可证；保留外部 draw.io 打开作为临时降级，不视为最终验收 |
| Node sidecar 打包含原生 SQLite 依赖失败 | 安装包不可用 | 优先评估无额外运行时的打包路径；在选择 SQLite 驱动前完成 Windows 自包含构建测试 |
| 布局在泳道和回退分支中不稳定 | 图可读性不达标 | 建立固定 DSL 金样、确定性排序、lane-aware 布局规则和快照测试 |
| 多个宿主同时写 revision | 覆盖或错序 | daemon 单写入者、事务和 `baseRevisionNo` 乐观锁 |
| Agent 输出大量非法 DSL | 闭环不稳定 | Schema、结构化错误、Skill 自检、错误修复回归样例 |
| 宿主配置格式变化 | 安装失败 | Adapter 分离、读取后 patch、备份、版本检测、官方文档核验 |
| 敏感会议泄漏 | 严重隐私风险 | Local First、离线编辑器、最小日志、禁止远程资源、脱敏测试数据 |

## 22 待确认问题

| 编号 | 问题 | 当前规划假设 | 影响 |
|---|---|---|---|
| Q-001 | 第二个必须联调的宿主是哪一个 | 默认 Codex + Claude Code；DSH 只保留 Adapter 接口 | Agent 适配任务与验收环境 |
| Q-002 | v0.1 是否必须支持 macOS 安装包 | Windows 为交付平台，macOS 只保留可构建结构 | 人天、签名和 CI |
| Q-003 | 自托管 draw.io 版本、许可和插件策略 | 固定上游版本，禁用远程插件和模板 | 技术闸门与分发合规 |
| Q-004 | 项目/会议/图形是否允许硬删除 | 默认 UI 软删除或归档；正式文件延迟清理 | 数据模型和恢复策略 |
| Q-005 | DOCX 最大文件大小 | 默认 10 MiB 且解析后最多 200 万字符；P0 验收只要求 5 万字符 | 安全、性能、错误提示 |
| Q-006 | sourceRefs 是 P0 强制还是建议 | 数据结构和渲染链路支持；缺失仅 warning | 图形追溯验收 |
| Q-007 | SVG/PNG 必须由后台无界面导出吗 | 允许通过离线编辑器导出并由 Runtime 落盘 | 自动化和 MCP 返回内容 |
| Q-008 | 是否要求本地数据加密 | v0.1 默认不加密，依赖 OS 用户权限 | 合规、密钥管理和人天 |
| Q-009 | MCP 写工具是否每次要求宿主审批 | Runtime 标记读写属性，最终策略由宿主配置 | 首次体验与安全说明 |
| Q-010 | 项目数据目录能否由用户迁移 | v0.1 允许查看；迁移只做受控操作且需重启 | 路径、备份和故障恢复 |

待确认项不阻塞 WP0 文档、契约和技术验证。会改变数据格式或公开接口的结论必须在实现前更新本文及对应 Plan。

## 23 官方技术参考

- [OpenAI Codex MCP 配置](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [OpenAI 插件架构](https://developers.openai.com/plugins/concepts/plugins)
- [MCP 官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Tauri 2 外部二进制与 Node sidecar](https://v2.tauri.app/learn/sidecar-nodejs/)
- [draw.io Embed mode](https://www.drawio.com/docs/reference/embed-mode/)
- [SQLite WAL](https://www.sqlite.org/wal.html)

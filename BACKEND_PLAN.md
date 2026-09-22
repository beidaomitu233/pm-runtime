> **历史执行计划（停止派单）**：2026-09-22 起，项目改用全栈纵向 TASK。新任务以 `TASK_BOARD.md` 与 `docs/tasks/` 为准，本文件仅用于追溯旧 FE/BE 编号、技术细节和历史验收设计。不得继续从本文件领取独立前端/后端任务。

# PM Runtime MVP v0.1 后端执行计划

版本：v0.1
范围：本地 Runtime daemon、MCP stdio bridge、会议导入、Diagram Core、文件版本、Agent Adapter 与安装打包
前置文档：`PROJECT_DOCUMENT.md`、`DATABASE_PLAN.md`

## 1 后端架构结论

后端交付一个自包含 sidecar 二进制，支持两种启动模式：

- `pm-runtime-sidecar daemon`：由 Tauri Desktop 启动，独占 SQLite 写入并提供回环内部 API。
- `pm-runtime-sidecar mcp-stdio`：由宿主 Agent 启动，通过 stdio 说 MCP 协议，再带本机会话凭据调用 daemon。

MCP 进程不得直接打开 SQLite 或项目文件。daemon 是唯一写入者；所有文件保存采用“临时文件 -> fsync/close -> 原子重命名 -> 数据库事务推进状态”的顺序。若数据库提交失败，清理新临时文件；若清理失败，启动恢复任务处理孤儿文件。

## 2 技术栈与代码库

| 类别 | 选择 | 规则 |
|---|---|---|
| Runtime | Node.js Active LTS + TypeScript strict | 实现分支建立时锁定版本和 lockfile |
| Monorepo | pnpm workspace | sidecar 与 contracts、storage、diagram-core 分包 |
| HTTP | Fastify | 只绑定 127.0.0.1；Schema 验证与请求 ID 统一 |
| MCP | 官方 TypeScript SDK稳定版 | stdio；stdout 只允许 JSON-RPC，日志走 stderr/文件 |
| Schema | JSON Schema 2020-12 + Ajv | DSL、API、配置运行时校验；开启 allErrors 但限制错误数量 |
| SQLite | 先完成打包技术验证后选驱动 | 驱动必须支持事务、外键、WAL、备份和 Windows 自包含打包 |
| DOCX | 维护活跃且不执行宏/外链的 OOXML 文本解析库 | 只提取正文与表格文本；不得启动 Office |
| Layout | ELK.js 优先技术评估，Dagre 为回退 | 统一封装为 LayoutAdapter，不泄漏到 DSL |
| Logging | Pino 或同级结构化日志 | 自动去敏，滚动文件，stdout 禁用 |
| Test | Vitest + Fastify inject + MCP in-memory/stdio harness | 文件和 DB 测试使用隔离临时目录 |
| Build | Tauri externalBin + 自包含 Node sidecar | Windows x64 首发；构建必须在干净机验证 |

## 3 服务模块

| 包/模块 | 核心职责 | 禁止事项 |
|---|---|---|
| `contracts` | API、MCP、DSL、错误码、示例 | 不依赖数据库和 UI |
| `runtime-app` | daemon 启动、路由、DI、生命周期 | 不包含领域 SQL |
| `mcp-bridge` | 工具注册、stdio、daemon client | 不直写 DB/文件；stdout 不打日志 |
| `storage` | 迁移、repository、事务、文件原子写入 | 不解析 DSL 语义 |
| `project-service` | 项目创建、读取、重命名 | 不管理会议正文 |
| `meeting-import` | 粘贴/TXT/MD/DOCX 解析与规范化 | 不执行宏、脚本、外部链接 |
| `meeting-service` | 会议元数据、正文分块 | 不把全文写日志或错误 |
| `diagram-contract` | Schema 与业务规则校验 | 不生成 draw.io XML |
| `diagram-core` | Graph Model、布局、XML adapter | 不调用模型，不猜测业务语义 |
| `revision-service` | diagram/revision、乐观锁、来源映射 | 不覆盖既有 revision |
| `export-service` | drawio/SVG/PNG 导出协调 | 失败不删除源文件 |
| `agent-adapters` | 检测、预览 diff、备份、安装、恢复 | 未确认不写宿主配置 |
| `diagnostics` | 健康、版本、去敏日志摘要 | 不返回令牌、正文、完整用户路径 |

## 4 API 通用合同

### 4.1 传输与认证

- daemon 启动时绑定 `127.0.0.1:0`，把端口、PID、session token 和过期时间写入仅当前 OS 用户可读的 runtime state 文件。
- Desktop 和 `mcp-stdio` 使用 `X-PM-Session`；缺失或错误返回 401 `UNAUTHORIZED_LOCAL_CLIENT`。
- 除 health 的最小启动信息外，所有业务路由必须认证。
- 请求体默认上限 12 MiB；meeting text 和 XML 再按字段限制。

### 4.2 响应

成功：

```json
{
  "data": {},
  "requestId": "01J..."
}
```

失败：

```json
{
  "error": {
    "code": "VALIDATION_SCHEMA_ERROR",
    "message": "Diagram DSL 校验失败",
    "details": [{ "path": "/nodes/2/label", "rule": "minLength" }],
    "retryable": false
  },
  "requestId": "01J..."
}
```

`message` 面向用户且不泄漏内部路径；详细堆栈只写本地去敏日志。错误详情最多 100 项，超出时给出 `truncated=true`。

### 4.3 分页与并发

- 列表参数：`cursor?`、`limit=50`，limit 最大 200；返回 `items`、`nextCursor`。
- 时间为 UTC ISO 8601；数据库以 UTC 文本存储。
- 写请求支持 `Idempotency-Key`，相同 key 与相同 payload 返回原结果；payload 不同返回 409。
- revision 保存必须包含 `baseRevisionNo`。当前 revision 不一致返回 409 `CONFLICT_REVISION`。

## 5 API 路由清单

### 5.1 系统与项目

| 方法与路由 | 请求 | 响应 data | 权限/错误 |
|---|---|---|---|
| `GET /api/v1/health` | 无 | appVersion、sidecarVersion、schemaVersion、status、dataDirMasked | 启动信息可无 token；详细信息需 token |
| `GET /api/v1/projects` | cursor、limit、q | project summaries | token；参数错误 |
| `POST /api/v1/projects` | name、description? | project | token；400、409 idempotency |
| `GET /api/v1/projects/:id` | id | project | 404 |
| `PATCH /api/v1/projects/:id` | name?、description?、expectedUpdatedAt? | project | 404、409 |

### 5.2 Meetings

| 方法与路由 | 请求 | 响应 data | 权限/错误 |
|---|---|---|---|
| `GET /api/v1/projects/:id/meetings` | cursor、limit、q、sourceType、status | meeting summaries | 404 project |
| `POST /api/v1/projects/:id/meetings` | title、text | meeting | 400、413、import error |
| `POST /api/v1/projects/:id/meetings/import` | multipart 单文件、title? | meeting | unsupported、too large、parse failed |
| `GET /api/v1/meetings/:id` | id | meeting metadata | 404 |
| `GET /api/v1/meetings/:id/content` | offset=0、limit=8000 | text、offset、endOffset、totalChars、hasMore | 非 ready 返回 409 |

### 5.3 Diagrams

| 方法与路由 | 请求 | 响应 data | 权限/错误 |
|---|---|---|---|
| `GET /api/v1/projects/:id/diagrams` | cursor、limit、type、meetingId、status | diagram summaries | 404 project |
| `POST /api/v1/projects/:id/diagrams` | meetingId?、dsl | diagram、revision、warnings | schema/rule/renderer errors |
| `GET /api/v1/diagrams/:id` | id | diagram、currentRevision、warnings | 404、artifact missing |
| `GET /api/v1/diagrams/:id/revisions` | cursor、limit | revision summaries | 404 |
| `GET /api/v1/diagrams/:id/revisions/:no` | revision | DSL、drawio XML 或 artifact handle、sourceRefs | 404、artifact missing |
| `POST /api/v1/diagrams/:id/revisions` | baseRevisionNo、drawioXml、dsl?、changeNote? | new revision | 409、XML invalid |
| `POST /api/v1/diagrams/:id/exports` | revisionNo、format、scale? | export artifact metadata | 404、export error |

### 5.4 Connections Settings Diagnostics

| 方法与路由 | 请求 | 响应 data | 权限/错误 |
|---|---|---|---|
| `GET /api/v1/connections` | 无 | host adapter states | detection errors as per item |
| `POST /api/v1/connections/:host/preview` | 无 | masked path、diff、restartRequired | host unsupported、config invalid |
| `POST /api/v1/connections/:host/install` | previewHash、confirmed=true | backup、result | preview stale、locked、rollback failed |
| `POST /api/v1/connections/:host/restore` | backupId、confirmed=true | result | backup missing |
| `GET /api/v1/settings` | keys? | safe settings | secret keys never returned |
| `PATCH /api/v1/settings` | allowed key/value map | settings | unknown key rejected |
| `GET /api/v1/diagnostics` | 无 | redacted version/status/recent error summary | partial result allowed |

## 6 MCP 工具合同

MCP 工具名保持附件定义，避免把内部 REST 细节泄漏为大量工具。

| Tool | 输入 | structuredContent | 只读/写入 | 主要错误 |
|---|---|---|---|---|
| `pm.project.list` | q?、cursor?、limit? | projects、nextCursor | 只读 | INVALID_ARGUMENT |
| `pm.project.get` | project_id | project | 只读 | PROJECT_NOT_FOUND |
| `pm.meeting.list` | project_id、date?、cursor? | meetings、nextCursor | 只读 | PROJECT_NOT_FOUND |
| `pm.meeting.get` | meeting_id、offset?、limit? | metadata、text、range | 只读 | MEETING_NOT_FOUND/NOT_READY |
| `pm.diagram.render` | project_id、meeting_id?、dsl、idempotency_key? | diagram_id、revision_no、warnings、artifacts | 写入 | VALIDATION_*、RENDERER_ERROR |
| `pm.diagram.get` | diagram_id、revision_no? | diagram、revision、dsl、artifact metadata | 只读 | DIAGRAM_NOT_FOUND |
| `pm.diagram.save_revision` | diagram_id、base_revision_no、drawio_xml、dsl?、change_note? | revision_no、hash | 写入 | CONFLICT_REVISION、XML_INVALID |

每个工具同时返回一段简短 `content` 供模型阅读。`pm.meeting.get` 默认 8000 字符，最大 20000；若 `hasMore=true`，摘要明确告知下一 offset。任何工具都不得接受用户指定的任意绝对文件路径。

## 7 Diagram 校验与服务层逻辑

### 7.1 渲染流程

```text
validate request
-> validate JSON Schema
-> normalize stable ordering
-> validate graph business rules
-> persist pending diagram in transaction
-> convert to Graph Model
-> layout by type/orientation
-> generate deterministic draw.io XML
-> write DSL/XML to temporary revision directory
-> compute SHA-256
-> atomically move revision directory
-> commit revision and mark diagram ready
-> return warnings and metadata
```

如果 Schema 或业务规则失败，不创建 diagram。若布局/XML 失败，可创建一条 `render_failed` diagram 诊断记录，但不得创建 ready revision；具体采用与否在 BE-020 中锁定并保持 API 一致。

### 7.2 业务校验

- node、edge、lane ID 在各自集合中唯一，格式为 1-64 位 `[A-Za-z0-9_-]`。
- 节点和边数量限制；所有引用必须存在。
- swimlane 的 task/decision 必须指向有效 lane；flowchart 的 lanes 为空。
- 至少一个 start、一个 end；所有非注释节点从某个 start 可达并能到达某个 end，确有业务死路时返回 error。
- decision 至少两条出边，分支 label 非空且规范化后不重复。
- 禁止 self-loop；重复边返回 warning 或 error，由 Schema ADR 固定。
- `sourceRefs` offset 在关联 meeting 字符范围内；quote 若提供，应与规范文本片段一致，否则 warning。

### 7.3 确定性

相同 DSL、相同 layout 配置和同一 renderer 版本必须产生相同的规范 XML 哈希。输入数组先按稳定规则处理；浮点坐标固定精度；版本、时间和随机 ID 不写入需要比较的 XML 主体。

## 8 日志异常安全与性能

### 8.1 日志

- 字段：timestamp、level、requestId、module、operation、entityId、durationMs、resultCode。
- 禁止字段：会议正文、DSL quote、session token、宿主密钥、完整用户目录、完整 XML。
- 日志滚动和保留期默认 14 天或 100 MiB，取先到者；可在设置中缩短。

### 8.2 安全

- 回环绑定、会话令牌、CORS 精确允许 Tauri origin；禁用目录列表。
- multipart、JSON、XML、解压大小均有限制；DOCX 防 zip bomb，限制 entry 数、总解压量和压缩比。
- XML 解析禁用 DTD、外部实体和外部资源。
- 配置写入使用结构化 parser 和最小 patch；先写临时文件，再原子替换；保留备份和权限。
- 所有路径通过 `resolve` 后验证仍在数据根；检查符号链接和 junction。

### 8.3 性能

- 列表查询使用索引和 cursor，不使用大 offset。
- 会议正文按字符范围从 UTF-8 规范文件读取；需建立字符/字节定位策略并测试中文边界。
- Diagram render 放入受限 worker/任务队列，同一时刻默认 1 个重布局任务，避免阻塞 HTTP event loop。
- 不为 v0.1 引入向量库。FTS5 仅在 keyword 需求确认后启用。

## 9 后端任务包

### BP1 契约进程与存储骨架 8 项

| 完成 | 编号 | 模块与目标 | 输入 输出与依赖 | 异常与验收 | 测试要求 |
|---|---|---|---|---|---|
| [ ] | BE-001 | Monorepo：建立 `runtime-sidecar`、contracts、storage、diagram-core、agent-adapters 包和统一 strict 配置。使用者为全部执行模型。 | 输入规划文档；输出可构建 workspace。依赖无。 | 禁止循环依赖；空骨架在 Windows 可构建。 | lint、typecheck、空单测一次命令通过。 |
| [x] | BE-002 | Contracts：定义成功/错误 envelope、分页、ID、时间和错误码 Schema。 | 输出 `packages/contracts` 导出和示例；前端/MCP 依赖。 | 未知错误不可直接透传 stack；Schema 可运行时解析。 | 每个错误码有正反例；类型与 JSON Schema 一致性测试。 |
| [x] | BE-003 | Diagram DSL：编写 v0.1 JSON Schema、合法/非法 fixtures 和变更规则。 | 输入 PROJECT 第 13 节；输出 versioned Schema。 | 覆盖数量、长度、enum、引用结构；Schema 失败提供 JSON Pointer。 | 至少 10 合法、20 非法 fixture。 |
| [x] | BE-004 | Daemon lifecycle：实现随机回环端口、单实例锁、runtime state、session token、优雅停止。 | 输出 daemon endpoint；Tauri/MCP 依赖。 | 旧 state、端口占用、崩溃 PID、无写权限。验收为第二实例不并发写库。 | 进程集成测试覆盖启动、重复启动、异常退出和清理。 |
| [x] | BE-005 | HTTP 基线：Fastify、认证、requestId、body limit、CORS、错误处理。 | 输入 contracts；输出 `/health` 与受保护测试路由。 | 错 token 401；畸形 JSON 400；错误不泄漏路径。 | Fastify inject 覆盖所有中间件分支。 |
| [ ] | BE-006 | Storage 技术闸门：选择 SQLite 驱动并验证事务、WAL、备份、自包含 Windows 打包。 | 输入候选驱动；输出 ADR 与最小二进制。依赖 Tauri sidecar 构建。 | 原生模块缺失或打包失败即阻塞后续 DB 实现。 | 干净 Windows VM 创建、查询、备份、重启恢复。 |
| [ ] | BE-007 | Migration runner：按 `DATABASE_PLAN.md` 实现版本、checksum、事务与启动校验。 | 输入 migrations；输出目标 schema。 | checksum 改写、降级版本、迁移失败进入只读诊断。 | 空库、逐版升级、失败回滚、重复运行。 |
| [ ] | BE-008 | File store：实现受控相对路径、临时文件、原子移动、SHA-256、孤儿清理。 | 输入 entity ID 和 bytes；输出相对路径与 hash。 | 路径穿越、junction、磁盘满、rename 失败。 | 临时目录集成测试，含中断恢复和越界攻击。 |

### BP2 项目与会议 7 项

| 完成 | 编号 | 模块与目标 | 输入 输出与依赖 | 异常与验收 | 测试要求 |
|---|---|---|---|---|---|
| [ ] | BE-009 | Project repository/service：创建、列表、详情、重命名。Desktop 用户使用。 | API name/description；输出 project。依赖 `projects`。 | trim、长度、404、并发更新；重启可读。 | repository 事务、API 合同、1000 条 cursor。 |
| [ ] | BE-010 | TXT/MD parser：编码检测、换行规范化、字符计数。用户在 Meetings 导入。 | 文件或文本；输出 UTF-8 normalized text 与 metadata。 | BOM、GBK 待确认、二进制伪装、超限。 | UTF-8/BOM/CRLF/emoji/超限 fixture；GBK 按结论测试。 |
| [ ] | BE-011 | DOCX parser：只提取正文与表格文本，拒绝损坏/危险包。 | DOCX；输出规范文本。依赖 meeting-import。 | zip bomb、宏、外链、无正文、损坏 XML。 | 正常段落/表格、中文、损坏、超解压限制。 |
| [ ] | BE-012 | Meeting import service：原文件、规范文本、元数据原子落盘。 | title、source；输出 ready meeting。依赖 meetings、file store。 | 解析失败、DB 失败、磁盘满；不得出现 DB ready 但文件缺失。 | 故障注入覆盖每个提交阶段。 |
| [ ] | BE-013 | Meeting list/detail API：分页、筛选、状态。 | projectId、filters；输出 summaries/metadata。 | project 404、meeting 404、failed 状态可诊断。 | API 合同、索引查询计划、cursor 稳定性。 |
| [ ] | BE-014 | Meeting content：按字符 offset/limit 安全读取中文。Agent 与 UI 使用。 | meetingId、offset、limit；输出 text/range/hasMore。 | 非 ready、越界、UTF-8 多字节边界、文件缺失。 | 5 万字连续分块拼接后与原文完全一致。 |
| [ ] | BE-015 | Meeting 性能与隐私：5 万字基准、日志去敏、请求上限。 | 脱敏语料；输出基准结果。 | 不允许正文进入 log；超限返回 413。 | TXT/MD/DOCX 基准和日志扫描测试。 |

### BP3 Diagram 合同校验布局与版本 10 项

| 完成 | 编号 | 模块与目标 | 输入 输出与依赖 | 异常与验收 | 测试要求 |
|---|---|---|---|---|---|
| [x] | BE-016 | Schema validator：Ajv 编译、错误路径和错误上限。Agent 调用 render 前使用。 | DSL JSON；输出 typed DSL 或 errors。 | 非 JSON、过深对象、错误爆炸。 | 非法 fixtures 与错误快照。 |
| [x] | BE-017 | Business validator：引用、泳道、可达性、decision 和孤立节点规则。 | typed DSL；输出 errors/warnings。 | 大图算法退化；规则顺序需稳定。 | 每条规则正反例、100 节点性能。 |
| [x] | BE-018 | SourceRefs validator：校验 meeting、offset 和 quote。 | DSL refs、meeting text；输出规范 refs/warnings。 | 会议不属于项目、offset 越界、quote 不符。 | 中文 offset、缺失 quote、跨项目拒绝。 |
| [x] | BE-019 | Graph Model：把 DSL 转成与 draw.io 无关的节点、端口、边、lane 模型。 | valid DSL；输出 normalized graph。 | 稳定排序、无随机 ID。 | 同输入深比较一致；flow/swimlane fixtures。 |
| [ ] | BE-020 | Layout 技术闸门：比较 ELK.js 与 Dagre，确定 lane-aware 方案和回退。 | 10 个金样；输出 ADR、配置和性能数据。 | 回退边、长标签、3-6 lane、10-30 节点。 | 视觉评审加坐标快照；未通过不得承诺 renderer 完成。 |
| [ ] | BE-021 | Flowchart layout：主方向、decision 分叉、回退边和间距。 | Graph Model；输出坐标与路由。 | 环、多个 start/end、长标签。 | 金样坐标快照、无重叠断言。 |
| [ ] | BE-022 | Swimlane layout：lane 容器、lane 内布局、跨 lane 连接。 | Graph Model；输出 lane/node geometry。 | 空 lane、6 lane、跨 lane 回退。 | 3-6 lane 与 10-30 节点金样；无节点越界。 |
| [ ] | BE-023 | draw.io adapter：生成规范 XML 和标准形状样式。 | laid-out graph；输出 XML。 | XML 转义、中文、非法控制字符。 | XML 解析、固定哈希、可由目标 draw.io 打开。 |
| [ ] | BE-024 | Diagram render service/API：串联校验、布局、XML、事务。 | projectId、meetingId?、dsl；输出 diagram/revision/warnings。 | 各阶段失败有明确码；幂等请求不重复建图。 | API 集成、故障注入、幂等与 30 节点性能。 |
| [ ] | BE-025 | Revision service：保存编辑 XML、可选 DSL、sourceRefs 和乐观锁。 | baseRevisionNo、XML；输出新 revision。 | 409、XML 风险、文件缺失；旧版本不可变。 | 并发保存、历史读取、哈希与回滚测试。 |

### BP4 MCP Skill 与宿主适配 7 项

| 完成 | 编号 | 模块与目标 | 输入 输出与依赖 | 异常与验收 | 测试要求 |
|---|---|---|---|---|---|
| [ ] | BE-026 | MCP stdio 基线：注册 server、连接 daemon、stderr 日志。 | host JSON-RPC；输出 MCP results。 | daemon 未运行、token 过期、stdout 污染。 | in-memory 与真实 stdio client；stdout 字节级检查。 |
| [ ] | BE-027 | Project/Meeting tools：实现 list/get 与分块提示。 | Tool 输入；输出 structuredContent + 摘要。 | 404、hasMore、limit 上限。 | Schema、长会议连续读取、只读注解。 |
| [ ] | BE-028 | Diagram tools：render/get/save_revision。 | DSL/ID/XML；输出结构化结果。 | validation、renderer、409；写入工具属性明确。 | MCP 到 daemon 端到端和错误映射。 |
| [ ] | BE-029 | meeting-to-diagram Skill 文档：固定范围、角色、动作、分支、自检、重试顺序。 | 会议与工具；输出 DSL 调用流程。 | 不允许指示模型直接写 draw.io XML。 | 用 10 个样例人工审查；非法 DSL 能按错误修复。 |
| [ ] | BE-030 | Codex Adapter：检测配置、生成 preview diff、备份、安装和诊断。 | 本机 Codex 配置；输出 adapter state。 | 配置格式变化、项目/用户级冲突、文件锁。 | fixture 配置合并、重复安装、备份恢复；按官方文档复核。 |
| [ ] | BE-031 | 第二宿主 Adapter：按 Q-001 结论实现，默认 Claude Code。 | 宿主配置；输出同一 stdio 命令。 | 未安装、版本不支持。 | 与 Codex 对同 meeting_id 调用相同 tools。 |
| [ ] | BE-032 | Adapter 权限与回滚：未确认不写、previewHash 防过期、失败恢复。 | confirmed、previewHash；输出 backup/result。 | preview 后源文件变化、半写入、备份损坏。 | TOCTOU、原子替换、恢复和无关字段保留。 |

### BP5 导出诊断恢复打包与验收 8 项

| 完成 | 编号 | 模块与目标 | 输入 输出与依赖 | 异常与验收 | 测试要求 |
|---|---|---|---|---|---|
| [ ] | BE-033 | 导出技术闸门：确定本地 draw.io 编辑器与 Runtime 的 SVG/PNG 边界。 | revision XML；输出 ADR 与可重复方案。 | 无界面导出不可用、字体差异、透明背景。 | 断网、中文、Windows 高 DPI；三格式人工打开。 |
| [ ] | BE-034 | Export service：drawio 直接复制，SVG/PNG 调用确定的 adapter 并登记路径/hash。 | revisionNo、format、scale；输出 artifact。 | 超时、取消、磁盘满；源 revision 不变。 | 三格式、缓存命中、失败重试和并发。 |
| [ ] | BE-035 | Diagnostics：健康、版本、DB、数据目录、最近错误码的去敏结果。 | 系统状态；输出 partial diagnostics。 | DB 不可用时仍返回基础信息。 | 隐私扫描、部分失败、版本不兼容。 |
| [ ] | BE-036 | Crash recovery：启动检查临时目录、孤儿文件、pending 状态和 WAL。 | 数据目录；输出恢复报告。 | 不得误删正式文件；恢复操作幂等。 | 每个中断点故障 fixture、重复启动。 |
| [ ] | BE-037 | 日志滚动与清理：限制大小、保留期和字段。 | log events；输出滚动日志。 | 文件锁、磁盘满；降级不应拖垮业务。 | 体积、并发、隐私关键字扫描。 |
| [ ] | BE-038 | Sidecar 打包：生成 Windows x64 external binary、目标 triple 命名和版本信息。 | workspace build；输出 Tauri 可打包 binary。 | 缺资源、原生模块、杀软误报记录。 | 干净 Windows 无 Node 环境启动、导入、渲染。 |
| [ ] | BE-039 | 端到端测试语料：10 份脱敏会议、参考 DSL/图和人工评分表。 | 三类会议；输出 corpus。 | 不能把原始客户资料直接入库。 | 单角色、多角色、判断回退均覆盖；每例可追溯。 |
| [ ] | BE-040 | v0.1 发布验收：执行 A01-A10、安全、性能和安装清单。 | release candidate；输出签字式结果和遗留项。 | 未通过项不能用“基本完成”关闭。 | Windows 安装/卸载/重启、两个宿主、10 样例全量回归。 |

## 10 任务依赖图

```text
BE-001 -> BE-002/003 -> BE-004/005
BE-006 -> BE-007/008 -> BE-009..015
BE-003 -> BE-016..019 -> BE-020 -> BE-021/022 -> BE-023/024 -> BE-025
BE-004/005 + BE-024 -> BE-026..032
FE-020 + BE-023/025 -> BE-033/034
BE-007/008/025 -> BE-036
all core -> BE-038/039 -> BE-040
```

数据库迁移先于依赖它的 service 合并。MCP tools 只在内部 API 稳定后实现。编辑器和导出技术闸门未通过时，禁止用临时在线页面冒充 Local First 验收。

## 11 后端测试最低要求

- contracts：Schema 正反例、向后兼容检查、错误码快照。
- repository：真实 SQLite 临时库，不用纯 mock 替代事务和约束测试。
- API：Fastify inject 验证 status、body、auth、idempotency、requestId。
- MCP：in-memory client 覆盖 Schema；真实 stdio 覆盖进程和 stdout 纯净性。
- parser：TXT/MD/DOCX 正常、损坏、危险包、编码和大小边界。
- diagram：规则单测、布局坐标快照、XML 结构、固定哈希、性能。
- resilience：磁盘满/文件锁/进程中断/DB 失败故障注入。
- package：干净 Windows 机器，无 Node 与开发依赖环境的冒烟测试。

## 12 后端提交检查清单

- [ ] 对应 BE 任务验收与测试已完成并勾选。
- [ ] API、MCP、DSL 合同来自 `packages/contracts`，未复制漂移。
- [ ] migrations 从空库和前一版本均通过。
- [ ] 文件写入、数据库状态和 revision 在失败时保持一致。
- [ ] 日志和错误无正文、令牌、XML、完整本机路径。
- [ ] 接口差异和技术闸门结论已更新 `COMMUNICATION.md`。
- [ ] 代码在 `feature/backend-模块名` 分支提交；数据库改动使用 `feature/database-模块名`。

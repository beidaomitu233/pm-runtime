# PM Runtime v0.1 API 与 MCP 契约

版本：v0.1  
代码唯一合同来源：`packages/contracts`  
适用调用方：Desktop React、Runtime HTTP、MCP stdio bridge

本文件定义 v0.1 公开数据契约。字段名、枚举、错误码、请求限制和示例需要在 `packages/contracts` 中形成可运行时校验的 Schema；前端不得另写一套字段定义，MCP bridge 不得自行改变业务字段含义。

## 1. 通用规则

内部 HTTP Base URL 为 `/api/v1`。daemon 仅监听本机回环地址。除最小健康信息外，业务接口需要 `X-PM-Session`。每次请求携带 `X-Request-Id`；服务端可以沿用合法 requestId 或返回自己的 requestId。所有写请求携带 `Idempotency-Key`，建议 16-100 字符。

成功响应统一为：

```json
{
  "data": {},
  "requestId": "01J..."
}
```

失败响应统一为：

```json
{
  "error": {
    "code": "VALIDATION_SCHEMA_ERROR",
    "message": "请求内容不符合当前合同",
    "details": [],
    "retryable": false
  },
  "requestId": "01J..."
}
```

时间统一使用 UTC ISO 8601 字符串，UI 再转换本地时区。实体 ID 使用 26 位 ULID 字符串。列表使用 cursor 分页，默认 `limit=50`，最大 200；响应使用 `items` 与 `nextCursor`。金额当前版本无业务字段。空值语义必须显式使用 `null`，不得用空字符串代替缺失值。

请求体默认最大 12 MiB；会议文件、规范文本、XML 和 DOCX 解压量另受业务上限约束。任何 API/MCP 都不得接受由调用方指定的任意绝对文件路径。

## 2. 通用对象

Project：

```ts
interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}
```

Meeting：

```ts
type MeetingSourceType = 'paste' | 'txt' | 'md' | 'docx'
type MeetingStatus = 'importing' | 'ready' | 'failed'

interface MeetingSummary {
  id: string
  projectId: string
  title: string
  sourceType: MeetingSourceType
  originalFilename: string | null
  charCount: number
  byteCount: number
  status: MeetingStatus
  errorCode: string | null
  createdAt: string
  updatedAt: string
}
```

Diagram：

```ts
type DiagramType = 'flowchart' | 'swimlane'
type DiagramOrientation = 'horizontal' | 'vertical'
type DiagramStatus = 'rendering' | 'ready' | 'render_failed'

interface DiagramSummary {
  id: string
  projectId: string
  meetingId: string | null
  title: string
  diagramType: DiagramType
  orientation: DiagramOrientation
  status: DiagramStatus
  currentRevisionNo: number
  lastErrorCode: string | null
  createdAt: string
  updatedAt: string
}
```

Revision：

```ts
type RevisionSource = 'agent_render' | 'editor_save' | 'history_fork'
type DslStatus = 'current' | 'stale' | 'none'

interface RevisionSummary {
  id: string
  diagramId: string
  revisionNo: number
  baseRevisionNo: number | null
  source: RevisionSource
  dslStatus: DslStatus
  baseDslRevisionNo: number | null
  contentSha256: string
  rendererVersion: string
  changeNote: string | null
  createdAt: string
}
```

Artifact：

```ts
type ArtifactFormat = 'drawio' | 'svg' | 'png'

interface RevisionArtifact {
  id: string
  revisionId: string
  format: ArtifactFormat
  optionsHash: string
  byteCount: number
  contentSha256: string
  createdAt: string
}
```

API 返回给 UI/MCP 的 artifact 只提供 artifactId、格式、大小、hash 等安全元数据；真实相对路径仅在确有本地操作需要时返回，调用方不能提交任意输出路径。

## 3. Health 与诊断

`GET /api/v1/health`

用途：RuntimeGate 与宿主诊断。

```ts
interface HealthResponse {
  appVersion: string
  sidecarVersion: string
  schemaVersion: string
  status: 'ready' | 'degraded' | 'unavailable' | 'incompatible'
  dataDirMasked?: string
}
```

无 session 时只返回启动所需的最小版本与状态；详细数据目录和数据库诊断需要合法 session。

`GET /api/v1/diagnostics`

返回去敏的 Runtime、DB schema、数据目录状态、最近错误码和版本信息。数据库不可用时允许返回 partial diagnostics，不返回会议正文、token、完整用户目录和完整 XML。

## 4. Projects

`GET /api/v1/projects?cursor=&limit=&q=`

返回：

```ts
{ items: Project[]; nextCursor: string | null }
```

`POST /api/v1/projects`

请求：

```json
{
  "name": "项目名称",
  "description": "可选说明"
}
```

规则：name trim 后 1-80 字符，禁止控制字符；description 可为 null，最大 2000 字符。项目名允许重复，以 ID 区分。

`GET /api/v1/projects/:projectId`

返回单个 Project。不存在或已软删除返回 `PROJECT_NOT_FOUND`。

`PATCH /api/v1/projects/:projectId`

请求允许：

```json
{
  "name": "新名称",
  "description": null,
  "expectedUpdatedAt": "2026-09-22T00:00:00.000Z"
}
```

至少提供一个业务字段。若使用 `expectedUpdatedAt` 且版本已变化，返回 409 `CONFLICT_PROJECT`。

## 5. Meetings

`GET /api/v1/projects/:projectId/meetings?cursor=&limit=&q=&sourceType=&status=`

返回：

```ts
{ items: MeetingSummary[]; nextCursor: string | null }
```

`POST /api/v1/projects/:projectId/meetings`

用于粘贴文本。

请求：

```json
{
  "title": "需求评审会议",
  "text": "..."
}
```

title 1-120 字符，text 非空。P0 验收至少支持 5 万中文字符；当前规划最大规范文本 200 万字符，具体上限从 settings 读取。成功后必须返回 ready Meeting；解析/落盘失败不允许出现“DB ready 但正文文件缺失”。

`POST /api/v1/projects/:projectId/meetings/import`

multipart 单文件，支持 TXT、MD、DOCX，title 可选。正式承诺 UTF-8 与 UTF-8 BOM；其他文本编码返回明确错误。默认单文件上限 10 MiB，DOCX 同时限制 entry 数、解压总量和压缩比。

`GET /api/v1/meetings/:meetingId`

返回 MeetingSummary 或详情扩展字段。

`GET /api/v1/meetings/:meetingId/content?offset=0&limit=8000`

返回：

```ts
interface MeetingContent {
  text: string
  offset: number
  endOffset: number
  totalChars: number
  hasMore: boolean
}
```

offset/limit 按 Unicode 字符位置定义，默认 8000，最大 20000。meeting 非 ready 返回 `MEETING_NOT_READY`。

## 6. Diagram DSL v0.1

顶层合同：

```ts
interface DiagramDsl {
  schemaVersion: '0.1'
  diagramType: 'flowchart' | 'swimlane'
  title: string
  orientation: 'horizontal' | 'vertical'
  lanes: Lane[]
  nodes: Node[]
  edges: Edge[]
  sourceRefs?: SourceRef[]
}
```

约束：title 1-120 字符；node 2-100；edge 1-200；ID 为 1-64 位 `[A-Za-z0-9_-]`。flowchart 的 lanes 必须为空；swimlane 至少一个 lane，task/decision 必须指向有效 lane。至少一个 start 和一个 end，主要节点可达且能到达 end。decision 至少两条带非空且不重复 label 的出边。禁止 self-loop。

SourceRef：

```ts
interface SourceRef {
  meetingId: string
  nodeId: string
  locatorType: 'char_range'
  startOffset: number
  endOffset: number
  quote?: string
}
```

缺少 sourceRefs 在 v0.1 只产生 warning；提供后必须校验 meeting 同项目和字符范围。

## 7. Diagrams 与 Revision

`GET /api/v1/projects/:projectId/diagrams?cursor=&limit=&type=&meetingId=&status=`

返回 diagram summaries。

`POST /api/v1/projects/:projectId/diagrams`

请求：

```json
{
  "meetingId": "01J... or null",
  "dsl": {}
}
```

执行顺序：Schema 校验 → 业务规则校验 → Graph Model → Layout → draw.io XML → 文件原子落盘 → diagram/revision 事务提交。

Schema/业务规则失败直接返回错误，不创建 diagram。进入 renderer 后失败可以创建 `render_failed` diagram 诊断记录，但不得创建 ready revision。成功返回：

```ts
{
  diagram: DiagramSummary
  revision: RevisionSummary
  warnings: ContractWarning[]
}
```

`GET /api/v1/diagrams/:diagramId`

返回 diagram、currentRevision、warnings 与可用 artifact 元数据。

`GET /api/v1/diagrams/:diagramId/revisions?cursor=&limit=`

返回 revision summaries。

`GET /api/v1/diagrams/:diagramId/revisions/:revisionNo`

返回指定 revision 的元数据，以及允许读取的 DSL、draw.io 内容或 artifact handle。正文较大时实现可以使用 artifact endpoint/受控本地读取，不把任意绝对路径暴露给调用方。

`POST /api/v1/diagrams/:diagramId/revisions`

请求：

```json
{
  "baseRevisionNo": 1,
  "drawioXml": "<mxfile>...</mxfile>",
  "dsl": null,
  "changeNote": "调整审批节点"
}
```

若提交了与编辑结果同步的新 DSL，则 `dslStatus=current`；没有提交同步 DSL 时，revision 写为 `dslStatus=stale` 并记录 `baseDslRevisionNo`。Runtime 不从 draw.io XML 反向推理 DSL。基础 revision 已变化返回 409 `CONFLICT_REVISION`。

## 8. Export

`POST /api/v1/diagrams/:diagramId/exports`

请求：

```json
{
  "revisionNo": 2,
  "format": "svg",
  "scale": 1
}
```

format 为 drawio/svg/png，scale 默认 1，允许范围 1-4。drawio 直接来自 revision 的可编辑源；SVG/PNG 由已锁定的离线 adapter 生成并由 Runtime 校验、落盘、计算 hash 后写入 `revision_artifacts`。

相同 revision、format 和规范化 options 已存在成功 artifact 时直接复用。导出失败不修改 revision，不删除 DSL/drawio。

## 9. Connections 与 Settings

`GET /api/v1/connections` 返回支持宿主的 adapter state。

`POST /api/v1/connections/:host/preview` 返回去敏配置位置、结构化 diff、previewHash、restartRequired。不得写配置。

`POST /api/v1/connections/:host/install` 请求必须包含 `previewHash` 与 `confirmed=true`。Runtime 在写入前再次校验源配置 fingerprint，备份后执行最小 patch；源配置变化返回 `CONFIG_PREVIEW_STALE`。

`POST /api/v1/connections/:host/restore` 使用 backupId 并要求明确确认。

`GET /api/v1/settings` 与 `PATCH /api/v1/settings` 只允许 DATABASE_PLAN 中列出的非敏感 key。session token、模型/API key 和宿主认证信息禁止进入 settings。

## 10. MCP 工具

MCP stdio bridge 只映射稳定业务工具，不暴露内部 REST 路由。

| Tool | 输入 | 输出 | 属性 |
|---|---|---|---|
| `pm.project.list` | q?、cursor?、limit? | projects、nextCursor | 只读 |
| `pm.project.get` | project_id | project | 只读 |
| `pm.meeting.list` | project_id、date?、cursor?、limit? | meetings、nextCursor | 只读 |
| `pm.meeting.get` | meeting_id、offset?、limit? | metadata、text、range | 只读 |
| `pm.diagram.render` | project_id、meeting_id?、dsl、idempotency_key? | diagram_id、revision_no、warnings、artifacts | 写入 |
| `pm.diagram.get` | diagram_id、revision_no? | diagram、revision、dsl、artifact metadata | 只读 |
| `pm.diagram.save_revision` | diagram_id、base_revision_no、drawio_xml、dsl?、change_note? | revision_no、hash、dsl_status | 写入 |

每个工具同时返回简短的人类可读 content，但 structuredContent 才是程序合同。MCP stdout 只允许协议数据；日志写 stderr/文件。工具不得把完整会议正文、完整 XML 或本机绝对路径塞入错误消息。

## 11. 稳定错误码

至少维护以下稳定错误码，新增错误码先进入 `packages/contracts`：

- `INVALID_ARGUMENT`
- `UNAUTHORIZED_LOCAL_CLIENT`
- `RUNTIME_UNAVAILABLE`
- `PROJECT_NOT_FOUND`
- `CONFLICT_PROJECT`
- `MEETING_NOT_FOUND`
- `MEETING_NOT_READY`
- `MEETING_TOO_LARGE`
- `IMPORT_UNSUPPORTED_TYPE`
- `IMPORT_PARSE_FAILED`
- `VALIDATION_SCHEMA_ERROR`
- `VALIDATION_RULE_ERROR`
- `DIAGRAM_NOT_FOUND`
- `RENDERER_ERROR`
- `CONFLICT_REVISION`
- `XML_INVALID`
- `EXPORT_ERROR`
- `PATH_OUT_OF_SCOPE`
- `CONFIG_PREVIEW_STALE`
- `INTERNAL_ERROR`

400 用于参数/Schema 错误；401 用于本地 session 失败；404 用于实体不存在；409 用于版本、状态和幂等冲突；413 用于正文/文件超限；500/503 用于内部或 Runtime 可用性问题。所有错误均返回 requestId，retryable 只在确实安全可重试时为 true。

> **历史执行计划（停止派单）**：2026-09-22 起，项目改用全栈纵向 TASK。新任务以 `TASK_BOARD.md` 与 `docs/tasks/` 为准，本文件仅用于追溯旧 FE/BE 编号、技术细节和历史验收设计。不得继续从本文件领取独立前端/后端任务。

# PM Runtime MVP v0.1 前端执行计划

版本：v0.1
范围：Tauri Desktop 中的 React Control Center 及本地 diagrams.net 编辑器集成
前置文档：`PROJECT_DOCUMENT.md`、`BACKEND_PLAN.md`、`DATABASE_PLAN.md`

## 1 前端边界

前端只负责项目、会议、图形和连接状态的展示与用户操作。语义理解由宿主 Agent 完成；SQLite、项目目录、DOCX 解析、DSL 校验和 draw.io XML 生成均由 Runtime 负责。前端不得直接访问数据库，也不得用浏览器文件 API 绕过 Tauri 和 Runtime 写入项目目录。

## 2 技术栈与推荐代码库

| 类别 | 选择 | 使用规则 |
|---|---|---|
| Desktop | Tauri 2 | capability 最小化；启动和管理已登记 sidecar |
| UI | React + TypeScript + Vite | 开启 TypeScript strict；组件不使用 `any` 绕过合同 |
| 路由 | React Router | 项目 ID 和 diagram ID 必须来自路由参数并经 Schema 校验 |
| Server State | TanStack Query | API 数据、缓存、重试和失效；写操作统一 mutation |
| Local UI State | Zustand | 当前项目、临时筛选、编辑器会话；不复制服务端实体 |
| 表单 | React Hook Form + Zod | Zod Schema 从 contracts 派生或与其同源；后端仍需二次校验 |
| 组件 | Radix UI primitives + 项目内样式层 | 无障碍行为优先；避免引入大型后台模板 |
| CSS | CSS Modules 或 Tailwind CSS 二选一并锁定 | WP0 决定后全项目统一，禁止并存两套方案 |
| API | 生成或手写的 typed client | 只通过 `src/api` 调用，统一错误映射和 requestId |
| 测试 | Vitest + React Testing Library + Playwright | 组件行为、路由状态和关键桌面闭环分层测试 |

依赖只锁定到经过技术闸门验证的具体版本。draw.io 静态资源必须随应用离线打包，禁止运行时加载 `embed.diagrams.net`、远程字体、远程模板或插件。

## 3 路由结构

```text
/
  -> /projects 或最近项目的 meetings
/projects
/projects/:projectId/meetings
/projects/:projectId/meetings/:meetingId
/projects/:projectId/diagrams
/projects/:projectId/diagrams/:diagramId
/projects/:projectId/diagrams/:diagramId/edit
/settings/connections
/settings/data
/diagnostics
```

- `/projects/:projectId/*` 加载前先校验项目存在；404 显示返回项目列表。
- 项目切换保留目标一级页面，例如从 A 的 meetings 切到 B 后仍进入 B 的 meetings。
- 编辑页有未保存修改时，路由离开和窗口关闭均需二次确认。
- `/diagnostics` 只展示去敏信息，不显示会议正文、令牌和完整用户目录。

## 4 页面清单与输入输出

| 页面 | 使用者 | 输入 | 输出/动作 | 依赖 API | 依赖表 |
|---|---|---|---|---|---|
| Projects | 本机用户 | 搜索词、项目名 | 新建、重命名、进入项目 | `GET/POST /projects`、`PATCH /projects/:id` | `projects` |
| Meetings | 本机用户 | 项目、筛选、文本/文件 | 导入、查看、复制 meeting ID | project meetings API | `projects`、`meetings` |
| Meeting Detail | 本机用户 | meeting ID、offset/limit | 原文分块、来源和错误信息 | meeting metadata/content API | `meetings` |
| Diagrams | 本机用户 | 项目、类型、来源会议 | 打开图、查看版本、导出 | diagram list/detail API | `diagrams`、`diagram_revisions` |
| Diagram Detail | 本机用户 | diagram ID | 版本、warning、来源追溯 | diagram/revision API | diagrams、revisions、source refs |
| Diagram Editor | 本机用户 | revision XML | 新 revision、SVG/PNG/drawio 导出 | revision/export API | `diagram_revisions` |
| Connections | 本机用户 | 宿主类型、确认动作 | 安装、修复、诊断 | connections API | `agent_adapters` |
| Data Settings | 本机用户 | 非敏感设置 | 保存设置、打开数据目录 | settings API + Tauri opener | `settings` |

## 5 组件拆分

```text
App
├─ RuntimeGate
├─ AppShell
│  ├─ ProjectSwitcher
│  ├─ PrimaryNav
│  ├─ RuntimeStatusBadge
│  └─ GlobalErrorToast
├─ ProjectsPage
│  ├─ ProjectList
│  ├─ ProjectEmptyState
│  ├─ CreateProjectDialog
│  └─ RenameProjectDialog
├─ MeetingsPage
│  ├─ MeetingToolbar
│  ├─ PasteMeetingDialog
│  ├─ ImportMeetingDialog
│  ├─ MeetingList
│  └─ ImportResultPanel
├─ MeetingDetailPage
│  ├─ MeetingMetadata
│  ├─ ChunkedTextViewer
│  └─ CopyMeetingIdButton
├─ DiagramsPage
│  ├─ DiagramFilters
│  ├─ DiagramList
│  ├─ DiagramWarnings
│  └─ RevisionDrawer
├─ DiagramEditorPage
│  ├─ DrawioBridge
│  ├─ EditorToolbar
│  ├─ SaveRevisionDialog
│  └─ ExportDialog
└─ ConnectionsPage
   ├─ HostConnectionCard
   ├─ ConfigDiffDialog
   ├─ BackupRestorePanel
   └─ DiagnosticsPanel
```

页面只组合领域组件。所有 API 响应先在 `src/api/schemas` 解析，再进入组件；DrawioBridge 只接受可信 origin、固定 message type 和关联 session ID。

## 6 状态管理方案

### 6.1 TanStack Query

- Query key：`['projects']`、`['project', projectId]`、`['meetings', projectId, filters]`、`['meeting', meetingId]`、`['meeting-content', meetingId, offset, limit]`、`['diagrams', projectId, filters]`、`['diagram', diagramId]`、`['revisions', diagramId]`、`['connections']`。
- 只读查询默认网络错误重试 2 次，400/401/403/404 不重试。
- mutation 成功后精确失效关联 key；不使用全局清缓存替代依赖管理。
- 项目和 revision 写入不做不可逆乐观更新；成功响应后再替换 UI。

### 6.2 Zustand

只保存：最近项目 ID、列表筛选、编辑器 session、未保存标记和用户关闭过的非关键提示。实体详情、revision 和连接状态不写入 Zustand。

### 6.3 编辑器状态

状态机：`idle -> loading -> ready -> dirty -> saving -> ready`，失败进入 `load_error` 或 `save_error`。收到 409 时进入 `conflict`，禁止自动覆盖。

## 7 表单与校验规则

| 表单 | 字段 | 前端规则 | 服务端规则 |
|---|---|---|---|
| 新建/重命名项目 | `name` | trim 后 1-80 字符；禁控制字符 | 同规则；名称是否允许重复按后端合同 |
| 粘贴会议 | `title`、`text` | 标题 1-120；正文 1-2000000 字符；显示字符数 | 上限、编码、事务和哈希复核 |
| 文件导入 | `title?`、`file` | TXT/MD/DOCX；默认最大 10 MiB；单文件 | 文件签名、解析、字符上限、路径安全 |
| 保存 revision | `baseRevisionNo`、`xml`、`changeNote?` | revision 必须等于当前载入值；XML 非空；说明最大 300 | 乐观锁、XML 安全、文件原子写入 |
| 导出 | `revisionNo`、`format`、`scale?` | format 为 drawio/svg/png；scale 1-4 | revision 存在、资源和路径校验 |
| 安装宿主配置 | `host`、`confirmed` | 必须先展示 diff 且明确确认 | 备份、格式检测、原子替换 |

校验错误使用字段级文案；API 错误保留 `requestId` 供诊断。不得只用 toast 承载需要用户修正的字段问题。

## 8 接口调用规则

- base URL、会话令牌由 Tauri 安全上下文注入；不持久化到 localStorage。
- 每次请求携带 `X-PM-Session` 和 `X-Request-Id`；写请求携带 `Idempotency-Key`。
- 统一处理 401 为 Runtime 会话失效，触发一次健康恢复；不得无限重试。
- `meeting/content` 按 offset/limit 请求，前端合并时校验返回的实际范围和 `hasMore`。
- 409 `CONFLICT_REVISION` 打开冲突对话框，提供重新载入或取消；v0.1 不做自动合并。
- 下载/导出返回 artifact ID 和文件元数据，再通过 Tauri 的受控保存对话框复制到用户选择位置。
- 不把完整 XML、会议正文或令牌写入浏览器 console、错误上报和测试快照。

## 9 Loading Empty Error 与权限状态

| 状态 | 展示要求 | 禁止行为 |
|---|---|---|
| Runtime loading | 骨架屏和“正在启动本地服务” | 不提前显示空项目 |
| Runtime unavailable | 诊断入口、重启按钮、requestId | 不把所有接口错误显示成无数据 |
| List loading | 保留页面框架，显示行骨架 | 不闪回空状态 |
| Empty | 解释下一步并提供唯一主操作 | 不使用无意义插图或技术术语 |
| Importing | 文件名、阶段、取消能力按合同显示 | 不允许重复提交同一表单 |
| Validation error | 字段/节点路径、可复制详情 | 不丢用户当前输入 |
| Permission/capability denied | 说明缺少的本地权限和修复入口 | 不建议用户关闭系统安全功能 |
| Editor load error | 返回列表、重试、下载源 drawio | 不创建空 revision 覆盖原图 |
| Export error | 允许重试或改导出格式 | 不删除可编辑源文件 |

## 10 前端任务包

### FP1 应用骨架与运行时 6 项

- [ ] 任务编号：FE-001
  模块：应用启动
  目标：建立 Tauri React 应用壳并等待 Runtime 健康检查。
  使用者与位置：所有用户，应用启动页。
  实现说明：建立 AppShell、一级导航、窗口最小尺寸和 RuntimeGate；健康检查完成后再进入业务路由。
  输入/输出：输入 Tauri 注入的 base URL 与 session；输出 ready/unavailable UI。
  依赖接口：`GET /api/v1/health`。
  依赖表：`schema_migrations` 间接。
  异常处理：超时、401、版本不兼容、数据目录不可写。
  验收标准：冷启动状态清晰；Runtime 不可用时不误显示空数据；可复制 requestId。
  测试要求：覆盖健康、超时、未授权、schema 不兼容四种场景。

- [ ] 任务编号：FE-002
  模块：路由
  目标：完成路由、项目参数校验和 404 返回路径。
  使用者与位置：所有页面。
  实现说明：配置第 3 节路由；项目路由先请求项目详情；编辑页注册离开保护。
  输入/输出：URL 参数；输出页面或 NotFound。
  依赖接口：`GET /api/v1/projects/:projectId`。
  依赖表：`projects`。
  异常处理：非法 ULID、项目不存在、项目已归档。
  验收标准：刷新深链接可恢复；错误 ID 可返回项目列表；未保存编辑会提示。
  测试要求：路由组件测试覆盖合法、非法、404 和 dirty editor。

- [ ] 任务编号：FE-003
  模块：API Client
  目标：实现统一 typed client、响应 Schema 解析和错误映射。
  使用者与位置：所有前端模块。
  实现说明：集中注入 header、超时、requestId、幂等键；把错误映射为领域错误对象。
  输入/输出：contracts 请求/响应；输出可判别联合类型。
  依赖接口：全部 `/api/v1`。
  依赖表：无直接依赖。
  异常处理：非 JSON、Schema 不匹配、网络中断、重复 401。
  验收标准：组件不直接调用 fetch；未知响应不会进入 UI；日志不含敏感正文。
  测试要求：mock server 覆盖成功、业务错误、畸形响应和超时。

- [ ] 任务编号：FE-004
  模块：全局反馈
  目标：实现 loading、toast、页面错误和 ErrorBoundary。
  使用者与位置：全局。
  实现说明：字段错误内联、可恢复错误页面内展示、瞬时成功用 toast；保留 requestId。
  输入/输出：统一错误对象；输出用户文案与诊断详情。
  依赖接口：错误合同。
  依赖表：无。
  异常处理：组件渲染异常、重复错误、后台查询失效。
  验收标准：错误不会只出现在 console；同一错误不连续刷屏。
  测试要求：ErrorBoundary、字段错误和全局错误组件测试。

- [ ] 任务编号：FE-005
  模块：项目切换器
  目标：在全局壳中切换当前项目并保留页面语境。
  使用者与位置：AppShell 顶部。
  实现说明：列出可用项目，记住最近项目 ID；删除/失效 ID 自动回项目列表。
  输入/输出：项目摘要；输出目标路由。
  依赖接口：`GET /api/v1/projects`。
  依赖表：`projects`。
  异常处理：无项目、最近项目不存在、加载失败。
  验收标准：切换后 meeting/diagram 页面类别保持；单项目不制造额外步骤。
  测试要求：空、单项目、多项目和失效缓存场景。

- [ ] 任务编号：FE-006
  模块：前端测试骨架
  目标：建立 Vitest、RTL、Playwright 和 mock API 基线。
  使用者与位置：开发与审查。
  实现说明：提供渲染 helper、QueryClient 隔离、路由 helper、稳定 test IDs 和最小桌面冒烟测试。
  输入/输出：测试夹具；输出可重复测试结果。
  依赖接口：health、projects mock。
  依赖表：无。
  异常处理：并行测试缓存污染、时区差异。
  验收标准：本地一次命令完成 unit/component；E2E 可启动测试 Runtime。
  测试要求：该任务以示例测试实际通过为验收。

### FP2 项目管理 5 项

- [ ] 任务编号：FE-007
  模块：项目列表
  目标：展示项目、更新时间和进入入口。
  使用者与位置：本机用户，`/projects`。
  实现说明：分页列表、名称搜索、最近项目排序；不显示虚构进度。
  输入/输出：搜索和分页；输出项目卡片/表格。
  依赖接口：`GET /api/v1/projects`。
  依赖表：`projects`。
  异常处理：空列表、加载失败、下一页失败。
  验收标准：空状态可直接新建；1000 条下滚动和分页可用。
  测试要求：空、分页、搜索和错误态组件测试。

- [ ] 任务编号：FE-008
  模块：创建项目
  目标：用最少字段创建项目并进入 Meetings。
  使用者与位置：Projects 页面。
  实现说明：名称必填，描述按需展开；提交期间禁用重复操作。
  输入/输出：name、description；输出 project。
  依赖接口：`POST /api/v1/projects`。
  依赖表：`projects`。
  异常处理：名称非法、幂等重放、服务失败。
  验收标准：成功后刷新列表并进入新项目；失败保留输入。
  测试要求：空值、边界长度、成功、失败和双击提交。

- [ ] 任务编号：FE-009
  模块：重命名项目
  目标：修改名称并同步导航与列表。
  使用者与位置：项目菜单与设置。
  实现说明：预填当前值；成功后精确失效项目 query。
  输入/输出：projectId、name；输出更新项目。
  依赖接口：`PATCH /api/v1/projects/:projectId`。
  依赖表：`projects`。
  异常处理：404、非法名称、并发更新。
  验收标准：导航、列表和页面标题一致；失败不显示新名称。
  测试要求：成功、失败、404 和缓存一致性。

- [ ] 任务编号：FE-010
  模块：项目首页重定向
  目标：项目入口直接进入会议主线。
  使用者与位置：`/projects/:projectId`。
  实现说明：v0.1 不建设概览仪表盘，稳定重定向到 meetings。
  输入/输出：projectId；输出 meetings 路由。
  依赖接口：项目详情。
  依赖表：`projects`。
  异常处理：项目不存在或归档。
  验收标准：不存在空白项目首页；后退行为正常。
  测试要求：重定向和浏览器历史测试。

- [ ] 任务编号：FE-011
  模块：项目可用性
  目标：完成键盘、焦点、窄窗口与中文长名称处理。
  使用者与位置：Projects 和 ProjectSwitcher。
  实现说明：对话框焦点圈定、Esc 关闭、文本省略及完整 title。
  输入/输出：用户交互；输出无障碍 UI。
  依赖接口：无新增。
  依赖表：无。
  异常处理：80 字符项目名、125%/150% 缩放。
  验收标准：键盘可完成创建和进入项目；无水平溢出。
  测试要求：axe、键盘组件测试和 1024x720 E2E 截图检查。

### FP3 会议导入与查看 6 项

- [ ] 任务编号：FE-012
  模块：会议列表
  目标：按项目展示会议来源、状态、字符数和创建时间。
  使用者与位置：`/projects/:projectId/meetings`。
  实现说明：分页、来源类型筛选、标题搜索；失败记录清楚区分。
  输入/输出：projectId、filters；输出 meeting summaries。
  依赖接口：`GET /api/v1/projects/:projectId/meetings`。
  依赖表：`meetings`。
  异常处理：空、分页失败、状态未知。
  验收标准：ready 与 failed 不混淆；点击可进入详情。
  测试要求：状态、分页、筛选和错误态。

- [ ] 任务编号：FE-013
  模块：粘贴会议
  目标：保存长会议文本并返回可复制 meeting ID。
  使用者与位置：Meetings 页面主操作。
  实现说明：标题、正文、实时字符数；提交后显示导入结果。
  输入/输出：title、text；输出 meeting metadata。
  依赖接口：`POST /api/v1/projects/:projectId/meetings`。
  依赖表：`meetings`。
  异常处理：空文本、超过上限、网络中断、重复提交。
  验收标准：5 万字输入不冻结；失败保留草稿；成功可复制 ID。
  测试要求：空值、5 万字、超限、成功和失败。

- [ ] 任务编号：FE-014
  模块：文件导入
  目标：通过 Tauri 文件选择器导入 TXT、MD、DOCX。
  使用者与位置：Meetings 页面。
  实现说明：只允许单文件；展示名称、大小、类型和上传/解析阶段。
  输入/输出：受控 file handle；输出 meeting metadata。
  依赖接口：`POST /api/v1/projects/:projectId/meetings/import`。
  依赖表：`meetings`。
  异常处理：取消、扩展名伪装、超限、DOCX 损坏、解析失败。
  验收标准：不读取任意目录；错误信息具体；可重新选择。
  测试要求：三种格式、取消、伪装类型、损坏 DOCX 和超限。

- [ ] 任务编号：FE-015
  模块：会议详情
  目标：展示来源、状态、字符数、时间和完整正文入口。
  使用者与位置：`/meetings/:meetingId`。
  实现说明：元数据先加载；正文按块加载，提供上一块/下一块和范围提示。
  输入/输出：meetingId、offset、limit；输出 metadata 与 content chunk。
  依赖接口：`GET /meetings/:id`、`GET /meetings/:id/content`。
  依赖表：`meetings`。
  异常处理：failed meeting、404、块范围变化。
  验收标准：不会一次把超长正文塞入 DOM；内容顺序和范围准确。
  测试要求：短文、长文多块、404、failed 和最后一块。

- [ ] 任务编号：FE-016
  模块：meeting ID 与 Agent 引导
  目标：让用户易于把会议定位信息交给宿主 Agent。
  使用者与位置：列表和详情。
  实现说明：复制 meeting ID、项目名和建议提示文本；明确提示内容仅复制到剪贴板。
  输入/输出：meeting metadata；输出 clipboard text。
  依赖接口：无新增。
  依赖表：无。
  异常处理：剪贴板权限拒绝。
  验收标准：复制成功有反馈；失败可手动选择文本。
  测试要求：允许/拒绝权限和文本格式。

- [ ] 任务编号：FE-017
  模块：会议导入回归
  目标：建立真实长度和中文编码的前端回归。
  使用者与位置：测试。
  实现说明：使用脱敏 fixtures 覆盖换行、emoji、表格提取文本和 5 万字符。
  输入/输出：测试文件；输出导入与查看断言。
  依赖接口：会议全链路。
  依赖表：meetings。
  异常处理：浏览器内存、窗口缩放。
  验收标准：三种格式均可完成，中文不乱码。
  测试要求：至少 1 条 Playwright 桌面 E2E 和组件边界测试。

### FP4 图形列表编辑版本与导出 8 项

- [ ] 任务编号：FE-018
  模块：图形列表
  目标：展示流程图/泳道图、来源会议和当前 revision。
  使用者与位置：`/projects/:projectId/diagrams`。
  实现说明：按类型、会议和更新时间筛选；状态与 warning 可识别。
  输入/输出：projectId、filters；输出 diagram summaries。
  依赖接口：`GET /api/v1/projects/:projectId/diagrams`。
  依赖表：`diagrams`、`diagram_revisions`。
  异常处理：空、失败状态、来源会议被归档。
  验收标准：当前 revision 明确；不能把 render_failed 当成可编辑完成。
  测试要求：类型筛选、状态、空和分页。

- [ ] 任务编号：FE-019
  模块：图形详情
  目标：展示 DSL 摘要、校验 warning、来源和版本。
  使用者与位置：diagram detail。
  实现说明：提供打开编辑、下载 drawio、版本抽屉和来源定位。
  输入/输出：diagramId；输出详情。
  依赖接口：`GET /api/v1/diagrams/:id`。
  依赖表：diagrams、revisions、source refs。
  异常处理：404、当前 revision 文件缺失、warning 未知。
  验收标准：异常不自动新建空图；可复制 requestId。
  测试要求：ready、warning、文件缺失和 404。

- [ ] 任务编号：FE-020
  模块：编辑器技术闸门
  目标：验证固定版本本地 diagrams.net 可离线载入、保存和导出。
  使用者与位置：开发验证页。
  实现说明：验证 iframe/webview、CSP、postMessage origin/session、中文字体、SVG/PNG、无网络运行和许可证清单。
  输入/输出：固定 drawio XML；输出验证记录与 ADR。
  依赖接口：临时 fixture，无生产 API。
  依赖表：无。
  异常处理：资源加载失败、消息乱序、弹窗、远程请求。
  验收标准：断网下完成打开-编辑-保存-导出；无非预期网络请求；审查确认后才执行 FE-021。
  测试要求：手工网络检查、消息协议自动测试、许可证审查。

- [ ] 任务编号：FE-021
  模块：DrawioBridge
  目标：封装可信的编辑器加载、保存、dirty 和导出协议。
  使用者与位置：Diagram Editor。
  实现说明：建立 session ID、消息白名单、超时、ready/load/save/export 状态机。
  输入/输出：drawio XML、命令；输出 XML 或导出二进制。
  依赖接口：revision detail。
  依赖表：diagram_revisions。
  异常处理：未知 origin、重复 ready、畸形 payload、超时。
  验收标准：未知消息被忽略并记录；不会跨图保存；dirty 状态准确。
  测试要求：协议单测和离线编辑 E2E。

- [ ] 任务编号：FE-022
  模块：保存 revision
  目标：将用户编辑保存为新 revision。
  使用者与位置：Editor toolbar。
  实现说明：提交 baseRevisionNo、XML、可选说明；保存中锁定重复操作。
  输入/输出：revision payload；输出新 revision。
  依赖接口：`POST /api/v1/diagrams/:id/revisions`。
  依赖表：diagram_revisions、diagrams。
  异常处理：409、XML 无效、Runtime 中断。
  验收标准：成功后 base revision 前进且 dirty 清除；冲突不覆盖。
  测试要求：成功、双击、409、服务失败和重试。

- [ ] 任务编号：FE-023
  模块：版本历史
  目标：查看并打开历史 revision。
  使用者与位置：详情页/编辑器抽屉。
  实现说明：显示序号、来源、时间、说明和哈希摘要；历史默认只读，用户明确选择后可基于其另存新版本。
  输入/输出：diagramId、revisionNo；输出历史内容。
  依赖接口：revision list/detail。
  依赖表：diagram_revisions。
  异常处理：历史文件缺失、分页失败。
  验收标准：查看历史不改变 current revision；另存生成新序号。
  测试要求：列表、只读、基于历史另存和文件缺失。

- [ ] 任务编号：FE-024
  模块：图形导出
  目标：导出 drawio、SVG、PNG 到用户选择位置。
  使用者与位置：图形详情和编辑器。
  实现说明：选择当前/指定 revision、格式和 PNG scale；显示生成与复制阶段。
  输入/输出：revisionNo、format、scale；输出 artifact。
  依赖接口：`POST /api/v1/diagrams/:id/exports`；Tauri 保存对话框。
  依赖表：diagram_revisions。
  异常处理：取消、文件已存在、导出失败、写权限不足。
  验收标准：三格式可打开且中文正确；取消不算失败；源 revision 不变。
  测试要求：三格式、覆盖确认、取消、权限失败和重试。

- [ ] 任务编号：FE-025
  模块：图形可用性回归
  目标：验证 3-6 泳道、10-30 节点和不同方向的编辑体验。
  使用者与位置：测试。
  实现说明：使用固定 DSL 金样检查打开、缩放、滚动、编辑、保存、导出。
  输入/输出：fixture diagrams；输出回归结果。
  依赖接口：图形全链路。
  依赖表：diagrams、revisions。
  异常处理：小窗口、高 DPI、长中文标签。
  验收标准：无节点遮挡 UI；编辑器不会造成应用导航失效。
  测试要求：Playwright E2E 加人工视觉检查记录。

### FP5 连接设置诊断与整体质量 7 项

- [ ] 任务编号：FE-026
  模块：连接状态
  目标：展示 Runtime 和各宿主 Adapter 的安装/连接/错误状态。
  使用者与位置：`/settings/connections`。
  实现说明：每个宿主卡片显示检测时间、配置位置的去敏形式和下一步。
  输入/输出：connection list；输出状态卡片。
  依赖接口：`GET /api/v1/connections`。
  依赖表：agent_adapters。
  异常处理：宿主未安装、格式未知、探测超时。
  验收标准：未安装、已安装、已连接、错误不混淆。
  测试要求：所有状态与过期检测。

- [ ] 任务编号：FE-027
  模块：配置安装与修复
  目标：经用户确认后安装或修复宿主 MCP 配置。
  使用者与位置：Connections 页面。
  实现说明：先获取 diff，展示新增/修改项、备份位置和需要重启的宿主，再提交确认。
  输入/输出：host、confirmed；输出 backup 和结果。
  依赖接口：connection preview/install。
  依赖表：agent_adapters。
  异常处理：配置解析失败、文件锁定、部分写入。
  验收标准：未确认不写文件；失败可恢复备份；不覆盖无关配置。
  测试要求：新装、合并、拒绝、锁定、回滚和重复安装。

- [ ] 任务编号：FE-028
  模块：数据设置
  目标：查看数据目录、版本和存储占用。
  使用者与位置：`/settings/data`。
  实现说明：显示去敏路径、打开目录、数据库 schema 和空间；v0.1 不直接提供任意目录迁移。
  输入/输出：settings/health；输出数据状态。
  依赖接口：`GET /health`、`GET /settings`。
  依赖表：settings。
  异常处理：目录不存在、无打开权限。
  验收标准：路径不复制到日志；打开失败有修复提示。
  测试要求：正常、目录缺失和权限失败。

- [ ] 任务编号：FE-029
  模块：诊断
  目标：生成可复制的去敏诊断摘要。
  使用者与位置：Diagnostics。
  实现说明：包含应用/sidecar/schema 版本、连接状态、最近错误码和 requestId，不含正文、令牌、完整路径。
  输入/输出：health、connections、log summary；输出文本。
  依赖接口：diagnostics API。
  依赖表：无直接依赖。
  异常处理：部分服务不可用。
  验收标准：断开 Runtime 时仍能提供 Desktop 版本与本地启动错误。
  测试要求：隐私快照、部分失败、剪贴板拒绝。

- [ ] 任务编号：FE-030
  模块：CSP 与消息安全
  目标：锁定前端资源来源和 draw.io 消息边界。
  使用者与位置：整个 WebView。
  实现说明：制定 Tauri CSP、禁远程脚本、限制 connect-src 到回环、限制 iframe/worker 所需来源。
  输入/输出：构建配置；输出安全策略。
  依赖接口：Runtime loopback。
  依赖表：无。
  异常处理：开发/生产 CSP 差异、编辑器 worker 被阻止。
  验收标准：生产构建断网可用；恶意 postMessage 不触发保存。
  测试要求：CSP 检查、消息伪造测试、无网络 E2E。

- [ ] 任务编号：FE-031
  模块：无障碍与布局
  目标：完成键盘、焦点、缩放和最小窗口检查。
  使用者与位置：全部页面。
  实现说明：表单 label、对话框焦点、状态 aria-live、错误关联、可见焦点。
  输入/输出：页面；输出符合基线的交互。
  依赖接口：无新增。
  依赖表：无。
  异常处理：150% 缩放、长中文、1024x720。
  验收标准：核心路径可只用键盘完成；无关键 axe violation。
  测试要求：axe 自动检查与人工键盘清单。

- [ ] 任务编号：FE-032
  模块：端到端验收
  目标：自动化“创建项目-导入会议-Agent 产图后打开-编辑-保存-导出”。
  使用者与位置：发布验证。
  实现说明：使用测试 Runtime 和固定 MCP fixture，不调用真实模型。
  输入/输出：脱敏会议与固定 DSL；输出三格式文件和 revision。
  依赖接口：全部核心 API。
  依赖表：projects、meetings、diagrams、revisions。
  异常处理：中途 Runtime 重启、revision 冲突、导出失败。
  验收标准：正常路径和三个关键异常均有自动断言。
  测试要求：Windows CI 或受控 Windows runner 实际执行。

## 11 前端与后端数据库依赖顺序

1. BE/DB 先提交 health、错误合同和项目 Schema，FE-001 至 FE-011 可使用同源 mock 开发。
2. meeting API 与 meetings migration 合并后，FE-012 至 FE-017 才能做真实集成验收。
3. Diagram DSL Schema、revision 表和 render API 合并后，FE-018、FE-019 可联调。
4. FE-020 技术闸门通过后再执行 FE-021 至 FE-025；失败必须暂停相关任务并记录 Communication。
5. Adapter API 合并后执行 FE-026、FE-027；前端不得自行改宿主配置。

## 12 前端提交检查清单

- [ ] 对应 FE 任务已勾选且验收证据可复查。
- [ ] unit/component 测试通过；涉及关键路径时 E2E 通过。
- [ ] loading、empty、error、权限、冲突状态均有处理。
- [ ] 未直接访问 SQLite、任意文件路径或远程 draw.io 资源。
- [ ] 未在 console、snapshot、fixture 中写入会议正文或令牌。
- [ ] API/Schema 差异已写入 `COMMUNICATION.md`。
- [ ] 已按 `feature/frontend-模块名` 分支和约定 commit message 提交。

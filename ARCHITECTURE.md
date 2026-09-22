# PM Runtime v0.1 软件架构

版本：v0.1 架构收口稿  
基线：`feature/backend-monorepo-local` / `b70e2b6512a14d85c4bddf327b8dd713db451d7e`  
适用角色：开发项目经理、全栈开发 Agent、代码审查 Agent

PM Runtime v0.1 的产品闭环保持现有定义：本机用户创建项目并导入会议记录，宿主 Agent 通过 MCP 读取会议内容并提交 Diagram DSL，Runtime 负责校验、布局、生成可编辑 draw.io 文件，用户在桌面端继续编辑、保存 revision 并导出 drawio/SVG/PNG。v0.1 不托管模型，不建设聊天、录音转写、PRD、排期、团队协作和云同步。

本文件从当前仓库实际代码出发收口架构。后续开发采用“一个 TASK 对应一条完整业务链路”的全栈纵向开发方式，不再把前端、后端、数据库作为独立交付任务。历史 `FRONTEND_PLAN.md`、`BACKEND_PLAN.md` 保留为早期规划参考，新的派发、验收和状态以 `TASK_BOARD.md` 与 `docs/tasks/` 为准。

## 1. 当前仓库基线

当前仓库已经存在两部分基础代码。根目录的 React + TypeScript + Vite 应用已经实现 RuntimeGate、AppShell、项目路由、项目列表骨架、统一 API Client、基础错误反馈和对应单元测试；Meetings、Diagrams、Connections 仍以占位页面为主。后端已经建立 pnpm workspace、`runtime-sidecar`、`packages/contracts`、`packages/storage`、`packages/diagram-core`、`packages/agent-adapters` 的包骨架，但除包入口和最小测试外，daemon、HTTP、SQLite、MCP、Diagram Core 尚未实现。

当前代码与旧规划存在三个需要立即收口的问题。第一，`PROJECT_DOCUMENT.md` 曾建议迁移到 `apps/desktop`，但实际前端已经位于根目录 `src/`；v0.1 不再进行纯目录重构，继续使用根目录前端，避免无业务价值的大规模移动。第二，前端当前在 `src/types/contracts.ts` 维护运行时合同，而架构目标要求 `packages/contracts` 成为唯一合同来源；该重复将在 TASK-001 中消除。第三，历史计划仍按 FE/BE/DB 拆分并且任务状态没有跟随实际提交更新，后续改为统一纵向 TASK。

## 2. 总体架构

```text
Host Agent
   │
   │ stdio MCP
   ▼
pm-runtime-sidecar mcp-stdio
   │
   │ loopback HTTP + session token
   ▼
Runtime daemon  ──────────────────────────────┐
   │                                          │
   ├─ Project / Meeting / Diagram services    │
   ├─ MCP tool application services           │
   ├─ Export / Adapter / Diagnostics          │
   │                                          │
   ├──────────────┬──────────────┬────────────┤
   ▼              ▼              ▼            ▼
SQLite         Project Files   Diagram Core   Logs
(single writer)               validator/layout

Tauri Desktop
   ├─ React UI
   ├─ local diagrams.net assets
   └─ loopback HTTP + session token ──────────┘
```

Runtime daemon 是系统唯一数据库写入者，也是项目文件的唯一正式写入入口。Desktop 与 MCP bridge 都通过统一应用服务访问数据，不直接打开 SQLite，不绕过 Runtime 写项目目录。这样可以保证页面、MCP 和未来其他宿主使用同一套业务规则、事务和状态流。

桌面端使用 Tauri 2 承载当前根目录 React 应用。Tauri 只负责窗口、sidecar 生命周期、文件选择/保存对话框和最小系统能力，不承载领域业务。sidecar 使用 Node.js + TypeScript，内部 HTTP 使用 Fastify；MCP stdio 进程作为薄适配层，只负责协议与 daemon 调用，不复制业务逻辑。

## 3. 代码结构与依赖方向

v0.1 锁定以下结构，不在业务开发中再次进行目录级重构：

```text
/
├─ src/                         # Desktop React UI
│  ├─ app/
│  ├─ api/
│  ├─ pages/
│  ├─ state/
│  └─ ...
├─ src-tauri/                   # TASK-002 建立，Tauri 壳与 sidecar capability
├─ runtime-sidecar/
│  └─ src/
│     ├─ app/                   # daemon 生命周期、DI、启动
│     ├─ http/                  # Fastify routes/middleware
│     ├─ mcp/                   # stdio MCP bridge
│     └─ modules/
│        ├─ projects/
│        ├─ meetings/
│        ├─ diagrams/
│        ├─ connections/
│        └─ diagnostics/
├─ packages/
│  ├─ contracts/               # API/MCP/DSL/错误码唯一合同来源
│  ├─ storage/                 # SQLite、migration、repository、原子文件操作
│  ├─ diagram-core/            # DSL validator、Graph Model、layout、draw.io adapter
│  └─ agent-adapters/          # 宿主检测、配置 preview/patch/restore
├─ docs/
│  ├─ tasks/
│  └─ decisions/
├─ PROJECT_DOCUMENT.md
├─ ARCHITECTURE.md
├─ DATABASE_PLAN.md
├─ API_CONTRACT.md
├─ TASK_BOARD.md
└─ COMMUNICATION.md
```

依赖方向固定为：`contracts` 不依赖任何业务包；`storage` 和 `diagram-core` 可以依赖 contracts，但不得依赖 UI；`agent-adapters` 不依赖 Desktop；`runtime-sidecar` 组合各包并暴露 HTTP/MCP；Desktop 只通过 contracts 与 HTTP client 认识 Runtime，不引用 storage、diagram-core 或 sidecar 内部模块。禁止形成反向依赖和循环依赖。

会议 TXT/MD/DOCX 解析先放在 `runtime-sidecar/src/modules/meetings`，当前没有跨进程复用需求，不新增 `meeting-import` 包。若后续确有第二个调用方，再通过 ADR 抽包，避免为了“架构完整”提前增加共享包。

## 4. 合同、数据与状态

`packages/contracts` 是 API、MCP、Diagram DSL、错误码、分页、ID 和状态枚举的唯一代码合同来源。当前 `src/types/contracts.ts` 只能作为迁移期代码，TASK-001 完成后必须删除或改为从 `@pm/contracts` 重新导出，禁止继续维护第二套类型和校验函数。运行时仍需 JSON Schema/Ajv 或同等校验，TypeScript 类型不能代替外部输入验证。

内部 API 固定使用 `/api/v1`。成功返回 `{ data, requestId }`，失败返回 `{ error: { code, message, details?, retryable? }, requestId }`。所有写请求使用 `Idempotency-Key`；revision 保存额外使用 `baseRevisionNo` 乐观锁。时间统一为 UTC ISO 8601，ID 使用 ULID 字符串，列表统一 cursor 分页。详细合同见 `API_CONTRACT.md`。

SQLite 为本机单库并启用 foreign keys、WAL 和 migration。数据库只保存实体、状态、相对路径和哈希，会议原文、规范文本、DSL、draw.io 和导出文件保存在受控项目目录。Runtime daemon 是唯一写入者。数据库和文件系统无法共享同一事务，因此写入统一采用“临时文件/目录 → 完整写入并计算哈希 → 原子移动 → 数据库事务推进正式状态”的顺序，并由启动恢复逻辑处理孤儿文件和中断状态。

Diagram revision 保持不可变。人工在 draw.io 中编辑后不尝试反向解析 XML 生成 DSL；新 revision 使用 `dsl_status=stale` 并记录 `base_dsl_revision_no` 指向最近一份仍可解释该图语义的 DSL revision。SVG/PNG 等延迟导出结果不再回写 `diagram_revisions`，统一写入独立的 `revision_artifacts` 表，避免“revision 不可变”与“导出后更新路径”冲突。具体字段以更新后的 `DATABASE_PLAN.md` 为准。

核心状态保持：

- Meeting：`importing -> ready | failed`。
- Diagram：请求先完成 Schema/业务校验；通过后进入 `rendering -> ready | render_failed`。Schema/业务校验失败不创建 diagram 业务记录，只返回结构化错误和 requestId。
- Revision：只新增，不覆盖；并发保存通过 `baseRevisionNo` 冲突检测。
- Connection：`not_installed -> installed -> connected`，探测失败为 `error`。

## 5. 模块边界与并发开发约束

全栈 TASK 可以同时修改页面、API、service、repository 和 migration，但只应修改当前业务切片需要的范围。以下区域属于高冲突公共区，需要项目经理控制唯一负责人：`packages/contracts`、migration runner、Tauri capability/sidecar 启动配置、Runtime 全局 middleware、根级 package/workspace 配置、全局错误码和 Diagram DSL 主 Schema。

项目、会议、图形、连接设置等领域模块应尽量沿模块目录独立演进。公共区变化必须由一个 TASK 明确承接，并先更新合同/架构文档，再让依赖 TASK 继续。多个 Agent 不通过 Git 抢占公共文件，TASK_BOARD 是任务归属和冲突判断的第一依据。

页面不得直接调用 `fetch`，统一通过 `src/api`。服务端 route 只负责传输和校验，业务规则放 service，数据访问放 storage/repository。MCP bridge 只映射 Tool Schema、调用应用服务并转换结果，不允许直接访问数据库或复制 diagram/meeting 业务。

## 6. 最小可运行开发顺序

仓库后续按照“完成一个纵向切片就立即运行和验收”的方式推进：

```text
TASK-001 工程基线与合同收口
    ↓
TASK-002 Runtime 启动与健康闭环
    ↓
TASK-003 项目管理闭环
    ↓
TASK-004 会议粘贴导入与查看
    ├─────────────┐
    ↓             ↓
TASK-005      TASK-006
文件导入       MCP 会议读取
    │             │
    └──────┬──────┘
           ↓
TASK-007 流程图生成闭环
           ↓
TASK-008 泳道图与来源追溯
           ↓
TASK-009 编辑与 Revision
           ↓
TASK-010 三格式导出
           │
TASK-011 第二宿主与连接管理
           │
           └──────┬──────
                  ↓
TASK-012 恢复、诊断与发布验收
```

TASK-005 与 TASK-006 在 TASK-004 完成后可以并行；TASK-011 在第一宿主 MCP 基线稳定后可以与图形后续工作并行。其他并行关系由开发项目经理根据实际修改范围判断，不以“理论上不同功能”替代代码冲突检查。

## 7. 技术闸门

三个技术问题必须在其对应业务 TASK 内先完成最小验证，验证失败时先调整架构，不继续堆业务代码。

SQLite/sidecar 闸门：在 TASK-002/TASK-003 前确认所选 Node SQLite 驱动支持事务、WAL、备份以及 Windows 自包含 sidecar 打包；失败时不得先写大量 repository。

Diagram layout 闸门：TASK-007 先用固定 DSL 样例比较并锁定 ELK.js/Dagre 或替代方案，至少覆盖长标签、decision、回退边和 30 节点；布局实现必须通过统一 LayoutAdapter，DSL 不包含坐标。

离线 diagrams.net 闸门：TASK-009 前验证固定版本静态资源在断网环境下能够加载、接收 XML、返回编辑结果并满足 CSP/许可要求；TASK-010 再验证 SVG/PNG 导出边界。闸门未通过时允许保留诊断性替代方案，但不得把在线 embed 或手工外部操作作为最终验收。

## 8. 安全、测试与完成定义

Runtime 只绑定 `127.0.0.1` 随机端口并使用高熵 session token；业务路由默认要求 `X-PM-Session`。路径只能由受控 ID 和相对路径产生，拒绝绝对路径、`..`、越界 symlink/junction。DOCX 解析限制压缩包 entry 数、总解压量和压缩比；XML 禁止 DTD、外部实体和外部资源。日志不写会议正文、DSL quote、完整 XML、令牌和非必要本机路径。

每个 TASK 必须同时具备代码实现、自动测试和可复现的人工验收入口。测试按改动覆盖 contracts、真实 SQLite 临时库、HTTP、MCP、文件故障注入和前端组件；关键闭环最终使用 Desktop + 真实 Runtime + 测试数据库验证。Mock 只能证明局部行为，不能作为 TASK 完成依据。

一个 TASK 只有在真实业务链路闭环、主要异常和权限/状态正确、测试通过、项目仍可运行、文档同步、代码完成集成后才能标记为“已完成”。任务详细范围和验收见 `docs/tasks/`，全局状态见 `TASK_BOARD.md`。

## 9. 当前仍需产品确认的事项

以下内容来自现有 `COMMUNICATION.md`，架构可以先按默认值实现非破坏性部分，但最终发布口径仍需产品确认：第二个必须联调的宿主；是否需要 macOS 安装包；项目/会议/图形删除是否在 UI 开放；sourceRefs 是否作为最终 P0 强制项；用户是否需要迁移数据目录；10 份真实/脱敏会议样例与人工参考图。

当前架构默认 Windows x64 为 v0.1 发布平台；第二宿主优先 Claude Code；UI 不开放硬删除；sourceRefs 数据结构完整支持但缺失只 warning；本地数据库默认依赖 OS 用户权限，不宣称加密存储；TXT/MD 正式承诺 UTF-8/UTF-8 BOM。以上默认值若改变，需要先更新 PROJECT_DOCUMENT、DATABASE_PLAN/API_CONTRACT 和受影响 TASK。

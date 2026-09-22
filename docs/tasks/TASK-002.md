# TASK-002 Runtime 启动、Tauri 与存储底座

状态：待验收（含阻塞子项，见文末验收结果）  
依赖：TASK-001  
业务目标：让当前前端骨架第一次连接真实本地 Runtime，形成“启动 Desktop → 启动 sidecar → 健康检查 → RuntimeGate 显示真实状态”的最小可运行闭环，同时完成 SQLite/sidecar 的关键技术闸门。

建立 `src-tauri/`，Tauri 2 只负责窗口、最小 capability、sidecar 生命周期和安全配置。实现 `pm-runtime-sidecar daemon` 的单实例、随机 `127.0.0.1` 端口、runtime state、session token、优雅关闭与崩溃恢复基线；Fastify 提供真实 `GET /api/v1/health`、认证、requestId、body limit、统一错误 envelope 和精确 CORS。前端 RuntimeGate 使用 Tauri 注入的 baseUrl/sessionToken，不再依赖 mock 才能进入业务壳。

本任务同时选择并验证 SQLite Node 驱动，要求支持事务、foreign keys、WAL、backup 和 Windows 自包含 sidecar 打包。建立 migration runner、`schema_migrations` 与数据根目录，不提前创建所有业务表。驱动或打包技术闸门失败时必须形成 ADR/Communication 结论后再调整，不能绕过闸门先开发大量 repository。

允许修改 `src-tauri/`、`runtime-sidecar` 生命周期/HTTP 基础、`packages/storage` 基础、health contracts、RuntimeGate 连接注入和相关测试。Tauri 全局配置、Fastify 全局 middleware、migration runner 属于公共冲突区。

验收入口：启动 Desktop 后看到“Runtime 已连接”；停止/破坏 sidecar 后显示明确不可用状态和 requestId，不误显示空业务数据；schemaVersion 不兼容时阻止进入业务页面；第二个 daemon 实例不能成为第二数据库写入者。自动测试覆盖合法/错误 token、畸形请求、旧 runtime-state、重复启动、migration 重复执行与失败回滚。技术闸门至少提供一次 Windows 自包含 sidecar 冒烟证据；若当前开发环境无法完成干净 Windows 验证，任务状态只能进入“待验收/阻塞”，不得虚报最终通过。

## 当前已有成果（2026-09-22 基线对齐，COM-048）

以下内容已在 `dev` 存在，复用不重做：

- `runtime-sidecar`：`lifecycle.ts`（单实例/端口/令牌/优雅关闭）、`httpBaseline.ts`（Fastify、`GET /api/v1/health`、`X-PM-Session` 鉴权、requestId、body limit、统一错误 envelope、精确 CORS 含 `X-Request-Id`）、`daemon.ts`/`devMain.ts` 可运行入口（`pnpm runtime:dev`）（BE-004/005、COM-029/030/036）。
- `packages/storage`：migration runner（含 `schema_migrations` 唯一 DDL，COM-039）、runtime DB/参数（DB-002，WAL/外键/busy_timeout）、file store、backup（COM-043）、ULID factory（DB-005）、`0001_initial.sql` 全业务表、SQLite 驱动闸门（BE-006 ADR）。
- 前端 RuntimeGate + 开发期注入 `window.__PM_RUNTIME_CONFIG__`（vite `transformIndexHtml` 读 `.pm-runtime/runtime-state.json`），浏览器链路已通（B-6 已解）。

仍需完成（本任务验收缺口）：

- **完全没有 `src-tauri/`**（集成报告 B-4）：Tauri 2 窗口、最小 capability、sidecar 生命周期托管、生产环境 baseUrl/sessionToken 注入（替换或并存开发期注入）。
- Windows 自包含 sidecar 打包闸门：BE-006 ADR 标注"部分验证，Windows 干净机打包待验证"，未过前任务不得标已完成。
- 与 TASK-001 收口后的 health contracts 对齐复验。

## 验收结果（2026-09-22，分支 `TASK-002`）

已完成并验证：

- `src-tauri/` 已建立：Tauri 2 窗口、`capabilities/default.json`（仅 `core:default`）、
  `runtime_start`/`runtime_stop` 命令（sidecar 探活复用/拉起/轮询/退出回收）、生产 CSP。
- 生产注入唯一来源：前端 `initRuntimeConfig()` 渲染前 `invoke('runtime_start')`；
  开发期 vite 注入边界收口（`apply:'serve'` 仅浏览器 dev，`tauri dev` 以 Tauri 注入覆盖）。
  4 个新注入单测；`src-tauri/README.md` 记录来源边界与阻塞。
- COM-051 收敛完成（COM-052）：health 四态内取值，`starting` 永不返回，
  before-start `unavailable` / start 后 `ready` 均过 `parseHealthResponse`。
- COM-054：Node SEA 自包含 sidecar 冒烟**本机通过**——剥离 PATH 中 Node 启动，
  6 项断言全过（runtime.ready、health 合同校验、401/403、第二实例
  `RUNTIME_ALREADY_RUNNING`、state 合法且 token 不泄漏）；fuse 自动探测（文档写死值
  在本机 Node 22.23.2 不存在）。
- 门禁：`pnpm check` exit 0（前端 6 文件 20 用例；后端 21 文件 134 通过、1 环境跳过）、
  `pnpm build` exit 0（294 模块）。
- 自动测试覆盖验收清单既有项：合法/错误 token、畸形请求与 body limit、旧/损坏
  runtime-state、重复启动与第二实例、migration 重复执行与失败回滚（BE-007 13 用例）。

阻塞与未验证（不得虚报为通过）：

- **本机无 Rust 工具链**（rustc/cargo/rustup 均不可用）：`cargo check`、`tauri dev/build`
  未执行，Rust 代码未经编译验证；"启动 Desktop → RuntimeGate 显示 Runtime 已连接"
  的端到端人工验收无法在本机完成。装好工具链后需：`pnpm tauri icon` 生成图标 →
  打开 `bundle.active` → `pnpm tauri dev` 联调。
- **干净 Windows VM 验证缺失**：SEA 冒烟为本机开发机证据；BE-006 ADR 状态保持
  "部分验证，Windows 干净机打包待验证"；better-sqlite3 原生模块进 SEA、SEA 内
  备份/重启恢复、BE-038 发布打包均未开始。
- 按 TASK 文档要求，本任务状态只到"待验收"，不标"已完成"。

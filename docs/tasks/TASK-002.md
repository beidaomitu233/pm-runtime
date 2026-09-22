# TASK-002 Runtime 启动、Tauri 与存储底座

状态：待开发  
依赖：TASK-001  
业务目标：让当前前端骨架第一次连接真实本地 Runtime，形成“启动 Desktop → 启动 sidecar → 健康检查 → RuntimeGate 显示真实状态”的最小可运行闭环，同时完成 SQLite/sidecar 的关键技术闸门。

建立 `src-tauri/`，Tauri 2 只负责窗口、最小 capability、sidecar 生命周期和安全配置。实现 `pm-runtime-sidecar daemon` 的单实例、随机 `127.0.0.1` 端口、runtime state、session token、优雅关闭与崩溃恢复基线；Fastify 提供真实 `GET /api/v1/health`、认证、requestId、body limit、统一错误 envelope 和精确 CORS。前端 RuntimeGate 使用 Tauri 注入的 baseUrl/sessionToken，不再依赖 mock 才能进入业务壳。

本任务同时选择并验证 SQLite Node 驱动，要求支持事务、foreign keys、WAL、backup 和 Windows 自包含 sidecar 打包。建立 migration runner、`schema_migrations` 与数据根目录，不提前创建所有业务表。驱动或打包技术闸门失败时必须形成 ADR/Communication 结论后再调整，不能绕过闸门先开发大量 repository。

允许修改 `src-tauri/`、`runtime-sidecar` 生命周期/HTTP 基础、`packages/storage` 基础、health contracts、RuntimeGate 连接注入和相关测试。Tauri 全局配置、Fastify 全局 middleware、migration runner 属于公共冲突区。

验收入口：启动 Desktop 后看到“Runtime 已连接”；停止/破坏 sidecar 后显示明确不可用状态和 requestId，不误显示空业务数据；schemaVersion 不兼容时阻止进入业务页面；第二个 daemon 实例不能成为第二数据库写入者。自动测试覆盖合法/错误 token、畸形请求、旧 runtime-state、重复启动、migration 重复执行与失败回滚。技术闸门至少提供一次 Windows 自包含 sidecar 冒烟证据；若当前开发环境无法完成干净 Windows 验证，任务状态只能进入“待验收/阻塞”，不得虚报最终通过。

# TASK-004 宿主通过 MCP 读取项目和会议

对应 R03/R10；来源 §2.2、§7、§12、A03。依赖 TASK-003。

业务目标：Agent 使用用户选择的项目和会议读取完整文本，两个会话不会因为 UI 切换项目而改变目标。

操作：启动桌面 → 启动 stdio bridge → listTools → project.list/get → meeting.list（最近一次 limit=1）→ meeting.get 逐块至末尾。先用 SDK 客户端验证协议，再在一个可用真实宿主中读取；账户不可用时明确保留宿主验收待办。

修改范围：apps/mcp 读工具注册、Runtime 内部 RPC 鉴权与白名单、Settings 的基础诊断；不重复实现查询业务，不在 bridge 打开 SQLite。本任务先注册四个已实现读工具，后续逐步增加 diagram 三工具，不暴露假成功占位。

接口：严格使用 API_CONTRACT 的四个读工具与 structured error；stdout 只含协议。bridge 接到 token/实例变更重新发现，不能凭旧 endpoint 宣称连接可用。读取摘要不包含整段正文。

异常：Runtime 未启动、无效 token、资源不存在、project_mismatch、非法 cursor/chunk、两宿主同时运行。始终能返回可识别错误，不能挂起无限等服务。

验收入口：新增 `npm run test:mcp`，SDK 真实 spawn bridge、初始化、列工具并读完 5 万字，hash 与 UI 一致；同时启动两个 bridge，确保只有一个持库 Runtime。传错误项目 ID 不能读出会议；停掉 Runtime 后有 runtime_unavailable，重启后可恢复。真实宿主至少一次读取证据与 SDK 证据分别记录。

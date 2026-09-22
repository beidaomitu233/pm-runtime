# TASK-006 第一宿主 MCP 读取会议

状态：待开发  
依赖：TASK-004  
对应验收：A03 的第一宿主部分  
业务目标：让第一个宿主 Agent 通过标准 MCP stdio 访问与 Desktop 完全相同的项目和会议数据，为后续“会议 → Diagram”提供真实输入链路。

当前产品基线将 Codex 作为第一宿主，因此 v0.1 首个 adapter 可针对 Codex；MCP Tool 本身必须保持宿主无关，不能把 Codex 专有字段写进 Project/Meeting 业务合同。

实现 `pm-runtime-sidecar mcp-stdio`，stdio stdout 只允许 MCP 协议数据，诊断写 stderr/文件。实现 `pm.project.list`、`pm.project.get`、`pm.meeting.list`、`pm.meeting.get`，全部调用 daemon/应用服务，不直接打开 SQLite 或项目文件。meeting.get 默认 8000 字符、最大 20000，hasMore 时提供下一 offset。

实现第一宿主的检测、preview、备份、最小配置 patch、重复安装和诊断流程。任何配置写入前需要结构化 preview + previewHash + 用户确认；源配置变化时拒绝旧 preview；不得整文件覆盖用户已有配置。

允许修改 MCP bridge、project/meeting MCP schemas、第一宿主 adapter、必要的 Connections 基础状态。MCP schema 和 runtime state 属于公共冲突区。

验收：在真实第一宿主中调用 project.list/get 和 meeting.list/get，读取 TASK-004 创建的同一个 meeting_id；连续读取 5 万字会议后内容完整；daemon 未运行、token 失效、非法参数和正文未 ready 均返回稳定结构化错误；stdout 无日志污染。重复安装/恢复不会删除宿主原有无关配置。

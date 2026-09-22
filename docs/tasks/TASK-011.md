# TASK-011 第二宿主与连接管理

状态：待开发  
依赖：TASK-006、TASK-007  
对应验收：A03 完整  
业务目标：用同一套 MCP 工具支持至少两个宿主，并在 Desktop Connections 页面完成检测、preview、安装、恢复和诊断，证明 PM Runtime 不依赖单一 Agent 产品。

现有产品规划默认第二宿主为 Claude Code；如产品负责人确认其他宿主，只替换 adapter，不改变 MCP Tool/业务合同。第二 adapter 与第一宿主共享同一 sidecar 命令和 Tool Schema，只负责各自配置文件的安全检测/patch。

完善 Connections 页面：显示支持宿主、安装/连接/错误状态；写配置前展示结构化 diff；通过 previewHash 防止 TOCTOU；备份原配置并支持恢复；重复安装幂等；配置格式不兼容时明确阻塞。Runtime 不绕过宿主自己的审批策略，只提供读写 Tool annotation 和安装建议。

允许修改 `packages/agent-adapters`、Connections UI/API、agent_adapters 表和第二宿主 fixture。不得在业务 Tool 中加入宿主专属字段。

验收：第一宿主与第二宿主读取同一个 project_id、meeting_id，并分别调用同一 `pm.diagram.render` Schema 成功生成图；两个宿主看到的 structuredContent 字段一致。安装/恢复不会丢失宿主原有配置；未确认 preview 不写文件；源配置变化后旧 previewHash 被拒绝。最终第二宿主选择若仍未确认，本任务可以完成 adapter 框架，但状态不能标记最终已完成。

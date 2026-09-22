# 官方技术资料与验证边界

查询日期：2026-09-22。链接支持的是技术选择依据，不代表本项目已联调。第三方页面可能更新，开发需在 TASK-001 记录实际依赖版本与资源校验值。

| 技术 | 官方来源 | 本设计使用范围 | 尚需验证 |
| --- | --- | --- | --- |
| Electron | [Security](https://www.electronjs.org/docs/latest/tutorial/security) | renderer 隔离、sandbox、IPC 边界 | 本地画布 CSP、打包环境兼容 |
| Node SQLite | [SQLite API](https://nodejs.org/api/sqlite.html) | DatabaseSync；参考 API，网页是滚动版本 | 本机 22.23.2 实测可用且实验性；按固定版本测试，不能把滚动文档稳定性套用到 22 |
| MCP SDK | [v1 Server](https://ts.sdk.modelcontextprotocol.io/server) | stdio 工具注册/调用 | 固定 v1 patch、宿主工具名和错误映射 |
| Codex CLI | [官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) | command/args 配置本地 stdio；mcp add | 用户实际版本、账户、权限与运行记录 |
| Claude Code | [官方 MCP 文档](https://code.claude.com/docs/en/mcp) | stdio 进程与配置安装 | 用户实际版本、配置作用域与连接 |
| draw.io | [源码](https://github.com/jgraph/drawio)、[Embed mode](https://www.drawio.com/docs/reference/embed-mode/)、[集成例](https://github.com/jgraph/drawio-integration) | XML 编辑及 JSON 消息协议 | 在线 embed 文档声明仅支持其官方 embed 域；自托管离线适配不能据此直接视为已支持，必须做 M0 原型验证 |
| ELK.js | [官方仓库](https://github.com/kieler/elkjs) | JavaScript 布局能力 | 泳道约束、回退边、中文尺寸由项目验证 |
| Mammoth | [官方仓库](https://github.com/mwilliamson/mammoth.js) | extractRawText 读取 DOCX | 表格、换行、特殊文本与异常压缩包 |
| Ajv | [JSON Schema](https://ajv.js.org/json-schema.html) | draft-07 字段验证 | 配置严格模式及自定义业务验证 |

自托管 draw.io 不采用在线域名作为回退，以免改变本地数据边界。M0 若 JSON 消息协议在固定资源包中不能运行，先研究该版本本地配置/最小集成适配；无法完成就报告此技术门禁失败，不能用 PNG 预览代替可编辑能力。上游许可证与内含图形素材的条款应随选定 release 一起保留在供应清单，不凭源码许可推断全部素材用途。

安装前提：开发机 Windows、可执行固定 Node/npm、首次安装依赖可联网、用户目录可写。运行时资料管理/编辑/导出应离线可用；宿主 Agent 的推理由宿主网络和账户负责。M0 锁版本后，安装包运行不能再要求用户安装 Rust、Python、Docker、数据库服务或依赖编译器。

# PM Runtime MVP v0.1 协作沟通记录

用途：前端、后端、数据库、测试和审查模型记录需求缺口、合同冲突、技术闸门与处理结论。执行模型不得在未记录的情况下扩大范围、修改公开契约或改变数据语义。

## 1 使用规则

1. 新问题使用连续编号 `COM-001`，保留原描述，不复用或删除编号。
2. 状态只允许：`待确认`、`已确认`、`执行中`、`已完成`、`驳回`。
3. `待确认` 表示尚无授权结论；可以继续不依赖该问题的任务。
4. `已确认` 表示已形成明确结论但实现尚未完成；`执行中` 表示已由具体任务承接；`已完成` 必须填写提交、测试或文档证据。
5. 合同冲突先停止冲突部分，在此记录前端期望、后端实际、数据库影响和建议；不得单方改字段。
6. 结论影响范围、API、Schema、状态或验收时，同步更新 `PROJECT_DOCUMENT.md` 及对应 Plan。
7. 每个任务包提交前检查本文件，更新自己提出或承接的问题。

## 2 问题类型

- `需求`：功能范围、角色、流程、验收不清。
- `接口`：请求、响应、错误码、MCP 工具不一致。
- `数据库`：字段、状态、约束、迁移和数据一致性。
- `前端`：页面、交互、状态、编辑器集成。
- `后端`：进程、服务、解析、渲染、导出。
- `安全`：权限、隐私、路径、配置、日志。
- `测试`：样例、环境、口径、回归。
- `工程`：依赖、构建、打包、Git 和发布。

## 3 沟通记录

| 序号 | 提出方 | 问题类型 | 功能问题描述 | 优化说明 | 涉及前端文件/模块 | 涉及后端文件/模块 | 涉及数据库表 | 状态 | 处理结论 |
|---|---|---|---|---|---|---|---|---|---|
| COM-001 | 审查模型 | 需求 | 当前目录原有“项目协作平台”文档与附件中的 PM Runtime v0.1 产品方向不同，是否合并范围。 | 分离产品基线，避免把邮件、项目排期、待办等 V0.3/其他产品能力带入首版。 | 全部页面 | 全部服务 | 全部表 | 已确认 | 本次只规划附件定义的 PM Runtime v0.1；原文档和 prototype 不修改、不作为实现依赖。 |
| COM-002 | 架构 | 工程 | Desktop Shell 选 Tauri 还是 Electron。附件为建议而非硬性确认。 | v0.1 暂定 Tauri 2 + React；通过 Node sidecar 技术闸门降低跨语言和打包风险。 | AppShell、Tauri 配置 | runtime lifecycle、sidecar build | 无 | 已确认 | 本规划统一使用 Tauri 2。若 BE-006/BE-038 打包闸门失败，重新评估并形成 ADR，不能局部切换 Electron。 |
| COM-003 | 前端 | 前端 | 在线 draw.io embed 可能发送敏感图形数据且依赖网络，本地静态资源的嵌入协议和许可证需要验证。 | 设置 FE-020 技术闸门，验证断网、CSP、postMessage、保存、导出和许可证。 | DrawioBridge、DiagramEditor | export adapter、resource packaging | diagram_revisions | 待确认 | 规划假设使用固定版本的本地 diagrams.net 静态资源；闸门未通过前不宣称编辑器完成。 |
| COM-004 | 产品 | 需求 | 附件要求至少两个宿主联调，但未明确第二个宿主。 | 优先选择文档与本地 MCP 支持成熟的宿主，避免三端同时开发。 | Connections | agent-adapters、MCP bridge | agent_adapters | 待确认 | 默认 Codex + Claude Code；DeepSeek Harness 仅保留 adapter 扩展点，待用户确认。 |
| COM-005 | 安全 | 安全 | 自动写入宿主 MCP 配置可能覆盖用户自有配置。 | 所有写入前展示结构化 diff，使用 previewHash，备份后原子 patch，支持恢复。 | ConfigDiffDialog、BackupRestorePanel | Codex/第二宿主 adapter | agent_adapters | 已确认 | 未经用户明确确认不得写配置；不得整文件覆盖；失败自动恢复或提示备份位置。 |
| COM-006 | 产品 | 需求 | 项目、会议、图形的删除语义未定义。 | v0.1 先软删除/归档，避免破坏来源与 revision。 | 列表操作菜单 | project/meeting/diagram service | projects、meetings、diagrams | 待确认 | 默认不开放通用硬删除；若 UI 需要“删除”，文案和行为按软删除实现，硬清理另立任务。 |
| COM-007 | 后端 | 需求 | P0 只规定 5 万中文字符，未规定文件字节和解析后最大字符数。 | 同时限制请求体、压缩包解压量、文件字节和规范文本字符，防止资源耗尽。 | ImportMeetingDialog | meeting-import | meetings、settings | 待确认 | 默认单文件 10 MiB、解析后 200 万字符；5 万字符用于验收，最大值按目标设备基准调整。 |
| COM-008 | 数据库 | 数据库 | sourceRefs 在附件中“建议必填”，具体定位格式未锁定。 | v0.1 统一字符范围，适配粘贴/TXT/MD/DOCX；时间戳留给录音版本。 | Diagram source viewer | DSL validator、source ref service | diagram_source_refs | 已确认 | 使用 `meetingId/nodeId/locatorType=char_range/startOffset/endOffset/quote?`；缺失 sourceRefs 返回 warning，不阻止渲染。 |
| COM-009 | 前端 | 接口 | SVG/PNG 由 Runtime 无界面生成，还是由本地编辑器生成后交给 Runtime 保存。 | 设 BE-033 技术闸门，保持 ExportService 接口稳定，内部 adapter 可替换。 | ExportDialog、DrawioBridge | export-service | diagram_revisions 或 revision_artifacts | 待确认 | v0.1 允许离线编辑器执行导出，但最终文件必须由 Runtime 校验、落盘和登记。 |
| COM-010 | 数据库 | 数据库 | revision 宣称不可变，但延迟导出会更新 `svg_rel_path/png_rel_path`。 | 推荐增加 `revision_artifacts` 表，使 revision 行完全不可变。 | RevisionDrawer | export-service | diagram_revisions、待定 revision_artifacts | 待确认 | DB-013 前决定；在结论前不得同时采用“更新 revision”与“新表”两种做法。 |
| COM-011 | 产品 | 安全 | 本地数据库是否要求加密。 | 明确 v0.1 默认依赖 OS 用户权限；如有共享设备/合规场景再引入密钥管理。 | Data Settings | storage/security | 全部表 | 待确认 | 当前计划不含数据库加密，不得宣传“加密存储”；发布安全评审前确认。 |
| COM-012 | 数据库 | 数据库 | 人工在 draw.io 中修改结构后，Diagram DSL 如何与 XML 同步。 | v0.1 不做 XML 反向解析为 DSL；需要明确该 revision 的 DSL 语义。 | Editor、Revision detail | revision-service | diagram_revisions、source refs | 待确认 | 建议人工编辑 revision 保留 `baseDslRevisionNo` 并标记 `dslStatus=stale`，或允许 `dsl_rel_path=NULL`；确认后补迁移和合同。 |
| COM-013 | 后端 | 工程 | Node SQLite 驱动、MCP SDK、布局库在自包含 sidecar 中的兼容性未实测。 | 在业务扩展前完成 BE-006、BE-020、BE-038 三个闸门。 | 无 | storage build、diagram layout、sidecar build | schema_migrations | 执行中 | 规划已建立闸门；实际结果需填写依赖版本、构建环境、失败记录和 ADR 链接。 |
| COM-014 | 产品 | 需求 | Windows 优先是否意味着 v0.1 也要交付 macOS 安装包。 | 区分代码结构可移植与实际发布验收平台。 | 全部桌面模块 | build/release | 无 | 待确认 | 默认只交付 Windows x64 安装包；macOS 保留构建路径，不进入 A01-A10。 |
| COM-015 | 后端 | 接口 | Diagram 校验失败时是否创建失败 diagram 记录。 | 避免列表堆积无价值失败记录，同时保留诊断 requestId。 | Diagram list | diagram-service、logs | diagrams | 待确认 | 推荐 Schema/业务校验失败不建 diagram；进入 rendering 后失败可建 `render_failed` 记录，便于重试和诊断。 |
| COM-016 | 产品 | 需求 | TXT 是否支持 GBK/系统默认编码。 | 默认 UTF-8 可减少隐式错误；若目标客户大量使用 GBK，再明确检测与提示。 | ImportMeetingDialog | TXT parser | meetings | 待确认 | 当前只承诺 UTF-8 与 UTF-8 BOM；其他编码返回明确错误，不猜测转换。 |
| COM-017 | 安全 | 接口 | MCP 写工具的宿主审批策略是否由 Runtime 强制。 | Runtime 提供读写注解和最小工具集；审批最终由宿主配置管理。 | Connections 说明 | MCP tool metadata、Adapter | agent_adapters | 已确认 | Runtime 不绕过或伪造宿主审批；安装预览展示写工具及建议审批策略。 |
| COM-018 | 测试 | 测试 | 10 份真实/脱敏会议样例和人工参考图尚未提供。 | 先定义三类语料和评分表；真实材料由产品负责人脱敏并确认授权。 | E2E fixtures | test-fixtures、diagram tests | 测试库 | 待确认 | 无真实材料时可用合成样例开发，但 A04/A05/A10 不能据此宣告最终通过。 |

| COM-019 | 后端执行模型/backend-local | 后端 | BE-002 Contracts 已完成成功/错误 envelope、分页、ULID、UTC 时间、错误码 Schema、运行时 Ajv 校验和示例测试。 | 作为 API、MCP、DSL 和错误码的唯一契约入口；错误详情最多 100 项，不透传 stack。 | 无 | `packages/contracts` | 无 | 已完成 | 类型检查：`npx tsc -p tsconfig.backend.json --noEmit`；测试：`npx vitest run --config vitest.backend.config.mjs`，合并前 2 个文件 5 个测试通过。提交：`64a7684`、`9ec7787`、`b98a43d`；已合并到远程 `dev`，合并提交 `5e1ccf7`。 |

## 4 新增记录模板

复制下一行并替换内容：

| COM-XXX | 前端/后端/数据库/测试/审查/产品 | 需求/接口/数据库/前端/后端/安全/测试/工程 | 清楚描述当前事实、期望和冲突位置 | 给出不扩大范围的建议 | 文件或模块 | 文件或模块 | 表名或无 | 待确认 | 尚无结论 |

## 5 任务完成时的更新格式

处理结论至少包含：

- 决定的字段、状态、接口或行为。
- 影响的 FE/BE/DB 任务编号。
- 实际测试命令和结果摘要。
- Git 分支与提交 ID；尚未提交时状态不能写“已完成”。
- 如驳回，说明驳回原因和替代处理，不删除原问题。
| COM-019 | 前端执行模型/local-foundation | 工程 | 当前仓库此前未配置 Git remote、远程任务状态表或任务认领推送机制；现已补充远程仓库地址，但远程仓库当前为空。 | 基于本地前端提交继续开发，保留未跟踪资料与其他执行流改动；远程有可用分支后再同步、认领和推送。 | TASK_STATUS.md、前端工程骨架 | 无 | 无 | 执行中 | FE-001～FE-011 已有本地提交，尚未进入远程目标分支；依赖安装和自动检查仍待完成。 |
| COM-020 | 前端执行模型/meetings | 前端 | FE-014 文件导入需要 Tauri 文件选择器和受控 file handle，当前前端壳尚未提供该能力。 | 本批先完成不依赖 Tauri 的会议列表、粘贴导入、详情和 Agent 引导；文件导入暂不伪造浏览器路径，待 Tauri capability 与 Runtime multipart 合同完成后承接。 | Meetings 文件导入 | Tauri capability、meeting import API | meetings | 执行中 | FE-012、FE-013、FE-015、FE-016 本地实现；FE-014 阻塞。 |
| COM-021 | 前端执行模型/diagrams | 接口 | 当前 `@pm/contracts` 尚未提供 diagrams API/DTO/schema，前端本批依据 `BACKEND_PLAN.md` 做局部 typed client 与页面校验。 | 后端 contracts 合并后逐字段对齐并补充 schema 解析；在此之前不宣称图形页面已完成联调。 | Diagrams 页面、src/api/client.ts、diagramContracts.ts | Diagram list/detail API、contracts | diagrams、diagram_revisions | 执行中 | FE-018/019 已实现页面闭环，等待 BE-002/Diagram API 合同复核。 |
| COM-022 | 后端执行模型/backend-local | 后端 | BE-017 需要确定完全重复边的严重级别。 | 为保留并行边表达空间，完全相同 from/to/规范化 label 的重复边返回 warning；self-loop、无引用节点和不可达节点仍返回 error。规则与证据见 `docs/decisions/BE-017-diagram-rules.md`。 | 无 | `packages/diagram-core` | diagrams | 已完成 | 全量后端测试覆盖重复边 warning 和其他业务规则；后续若产品要求拒绝重复边，需单独变更规则和验收。 |
| COM-023 | 后端执行模型/backend-local | 测试 | BE-020 的 ELK/Dagre 自动布局对比已通过，但验收要求的泳道视觉评审、跨泳道连接和坐标快照尚未完成。 | 保留自动化 layout gate、首选/回退配置和本机 benchmark；提供视觉评审环境后补 3-6 泳道、长中文标签和回退边检查，未完成前不勾选 BE-020。 | 无 | `packages/diagram-core` layout | 无 | 待确认 | 结论与自动化证据见 `docs/decisions/BE-020-layout-gate.md`。 |

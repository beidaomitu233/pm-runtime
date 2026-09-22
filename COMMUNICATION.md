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
8. 编号可断档不可补位。`COM-019` 被两个执行流各用一次（后端 contracts、前端 remote），两条原描述都保留；`COM-027`、`COM-028`、`COM-035` 本轮未使用，编号保留不复用。
9. 本机 Git 环境有非直觉行为，见 COM-034；未推送的本地提交在本机不持久，已连续发生两次事故，见 COM-033 与 COM-037。

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
| COM-019 | 前端执行模型/local-foundation | 工程 | 当前仓库此前未配置 Git remote、远程任务状态表或任务认领推送机制；现已补充远程仓库地址，但远程仓库当前为空。 | 基于本地前端提交继续开发，保留未跟踪资料与其他执行流改动；远程有可用分支后再同步、认领和推送。 | TASK_STATUS.md、前端工程骨架 | 无 | 无 | 执行中 | FE-001～FE-011 已有本地提交，尚未进入远程目标分支；依赖安装和自动检查仍待完成。 |
| COM-020 | 前端执行模型/meetings | 前端 | FE-014 文件导入需要 Tauri 文件选择器和受控 file handle，当前前端壳尚未提供该能力。 | 本批先完成不依赖 Tauri 的会议列表、粘贴导入、详情和 Agent 引导；文件导入暂不伪造浏览器路径，待 Tauri capability 与 Runtime multipart 合同完成后承接。 | Meetings 文件导入 | Tauri capability、meeting import API | meetings | 执行中 | FE-012、FE-013、FE-015、FE-016 本地实现；FE-014 阻塞。 |
| COM-021 | 前端执行模型/diagrams | 接口 | 当前 `@pm/contracts` 尚未提供 diagrams API/DTO/schema，前端本批依据 `BACKEND_PLAN.md` 做局部 typed client 与页面校验。 | 后端 contracts 合并后逐字段对齐并补充 schema 解析；在此之前不宣称图形页面已完成联调。 | Diagrams 页面、src/api/client.ts、diagramContracts.ts | Diagram list/detail API、contracts | diagrams、diagram_revisions | 执行中 | FE-018/019 已实现页面闭环，等待 BE-002/Diagram API 合同复核。 |
| COM-022 | 后端执行模型/backend-local | 后端 | BE-017 需要确定完全重复边的严重级别。 | 为保留并行边表达空间，完全相同 from/to/规范化 label 的重复边返回 warning；self-loop、无引用节点和不可达节点仍返回 error。规则与证据见 `docs/decisions/BE-017-diagram-rules.md`。 | 无 | `packages/diagram-core` | diagrams | 已完成 | 全量后端测试覆盖重复边 warning 和其他业务规则；后续若产品要求拒绝重复边，需单独变更规则和验收。 |
| COM-023 | 后端执行模型/backend-local | 测试 | BE-020 的 ELK/Dagre 自动布局对比已通过，但验收要求的泳道视觉评审、跨泳道连接和坐标快照尚未完成。 | 保留自动化 layout gate、首选/回退配置和本机 benchmark；提供视觉评审环境后补 3-6 泳道、长中文标签和回退边检查，未完成前不勾选 BE-020。 | 无 | `packages/diagram-core` layout | 无 | 待确认 | 结论与自动化证据见 `docs/decisions/BE-020-layout-gate.md`。 |
| COM-024 | 集成执行模型/fullstack | 工程 | `TASK_STATUS.md` 曾以带 Git 冲突标记（`<<<<<<< HEAD` / `=======` / `>>>>>>> origin/dev`）的状态提交到 `dev`，两侧任务记录互相遮蔽，任务表在网页端和渲染时都不可读。 | 合并两侧记录并重建全表，保留两侧任务行，不删除任一侧内容。 | TASK_STATUS.md | 无 | 无 | 已完成 | 已重建任务表与阻塞汇总。原修复提交随 COM-033 事故丢失，本轮为第二次重做；证据见本轮 `docs(fullstack): COM-024` 提交。 |
| COM-025 | 集成执行模型/fullstack | 前端 | `client.ts` 使用了 `isMeetingSummary` 却未导入，创建会议无法通过前端契约校验；`MeetingsPageEnhanced`/`DiagramsPageEnhanced` 在查询 pending 时用骨架屏替换整个页面（含工具栏），而筛选条件属于查询键，改筛选就会卸载筛选控件；vitest 未开 globals，RTL 的 `cleanup` 未注册，DOM 跨用例泄漏。 | 补齐导入；只替换列表区域、保留页面框架；显式注册 `afterEach(cleanup)`。 | src/api/client.ts、src/api/client.test.ts、src/pages/MeetingsPageEnhanced.tsx、src/pages/DiagramsPageEnhanced.tsx、src/pages/ProjectsPageEnhanced.tsx、src/pages/MeetingsPageEnhanced.test.tsx、src/test/setup.ts | 无 | 无 | 已完成 | 前端 typecheck exit 0；`vitest run` 6 个文件 14 个用例通过。 |
| COM-026 | 集成执行模型/fullstack | 工程 | vitest 2.x 自带 vite 5，而工作区锁定 vite 6，出现两份 vite 并使 `vitest.config.ts` 类型报错；同时缺少一条可复述的统一校验命令。 | 把 vitest 提到 `^3.2.7` 使两者共用根 vite；新增 `typecheck:backend`、`test:backend`、`check` 脚本；`.gitignore` 忽略 `.workbuddy/` 与 `.pm-runtime/`；把 `pnpm-lock.yaml` 纳入跟踪，使该命令可复现。 | package.json、.gitignore、pnpm-lock.yaml | 无 | 无 | 已完成 | **修正**：上一版提交只加了脚本，`vitest` 版本行没有落进 `package.json`，重新生成的 lockfile 解析出 `vitest@2.1.9` + `vite@5.4.21`，问题实际仍在。本轮补齐 `"vitest": "^3.2.7"` 并重新安装；lockfile 现只解析出单一 `vite@6.4.3` 与 `vitest@3.2.7`，`pnpm check` exit 0。 |
| COM-029 | 集成执行模型/fullstack | 接口 | 前端每个请求都发送 `X-Request-Id`，而 Runtime 的 CORS 允许头只有 `X-PM-Session, Content-Type, Idempotency-Key`，浏览器 preflight 失败并静默拦截请求：没有响应、没有 Runtime 报错，页面恒停在“本地服务尚未就绪”。 | 允许头加入 `X-Request-Id`，并抽成常量避免再次漏配。 | src/api/client.ts（发送方） | runtime-sidecar/src/httpBaseline.ts | 无 | 已完成 | `httpBaseline.test.ts` 断言 preflight 的 `access-control-allow-headers`；后端 typecheck 与测试通过。 |
| COM-030 | 集成执行模型/fullstack | 接口 | 未实现的路由返回 Fastify 默认 404 体 `{statusCode,error,message}`，不符合统一错误 envelope，前端 `parseFailure` 落空后降级为“Runtime 请求失败。”，把“路由不存在”显示成“服务不可用”。 | 显式注册 `setNotFoundHandler`，返回 `{error:{code:"INVALID_ARGUMENT",message:"Route not found"},requestId}`。 | src/api/client.ts | runtime-sidecar/src/httpBaseline.ts | 无 | 已完成 | 新增用例断言未知路由 404 的 envelope 与 requestId；真实浏览器验证页面显示“Route not found”并带真实 requestId。 |
| COM-031 | 集成执行模型/fullstack | 工程 | `origin/HEAD` 指向 `feature/backend-monorepo-local`，与实际协作方式不符。 | 建议改指 `dev`。 | 无 | 无 | 无 | 待确认 | 需要远端写权限，未执行；待用户授权后再操作。 |
| COM-032 | 集成执行模型/fullstack | 工程 | 工作区存在未跟踪的既有资料（`AGENTS.md`、`prototype/`、`需求讨论记录.md`、`应用功能清单.md`、PBS 开发计划 xlsx）以及与受跟踪 `.mjs` 并存的重复配置 `vitest.backend.config.ts`。 | 保留不动，避免误删其他执行流与用户的材料；需要时再决定归属。 | 无 | 无 | 无 | 待确认 | 见 `TASK_STATUS.md` 说明第 3 条。 |
| COM-033 | 集成执行模型/fullstack | 工程 | 第一次环境事故：`.git/objects` 被清空、分支引用消失、工作区回滚到会话前状态，上一轮尚未推送的提交全部丢失。 | 从 `origin` 重新 `init`+`fetch`，手工重建全部引用（含 `packed-refs`），逐项重做修复并复验。 | 无 | 无 | 无 | 已完成 | 远程未受影响，各分支完整；损失仅限未推送的本地提交。 |
| COM-034 | 集成执行模型/fullstack | 工程 | 本机 Git 环境的两个非直觉行为：`.git/refs` 下新建多级目录会静默失败（`fix/xxx`、`feature/xxx` 创建后分支不存在，退出码仍为 0）；`packed-refs` 必须按 refname 排序，且行尾不能带 CR，否则 `git for-each-ref` 报 `ignoring ref with broken name`、`rev-parse` 报 `Needed a single revision`。 | 分支名使用顶层名称；重建 `packed-refs` 时使用 LF 行尾并按 refname 排序；索引损坏时用 `git read-tree --reset HEAD` 重建，不要手工删除 `.git/index`。 | 无 | 无 | 无 | 已完成 | 按此规则修复后 `for-each-ref` 与 `rev-parse` 均正常。 |
| COM-036 | 集成执行模型/fullstack | 后端 | 浏览器端无法到达 Runtime（B-6）：没有桌面壳，`getConfig()` 只能回落到相对路径 `/api/v1`，请求打到 Vite dev server 拿到非 JSON，RuntimeGate 恒显示“本地服务尚未就绪”。 | 提供可运行的 Runtime 启动入口（把 BE-004 生命周期与 BE-005 HTTP 基线装配成 daemon），并只在开发期把真实回环端口与令牌注入页面；不做代理、不写死端口与令牌、不写入 localStorage；Runtime 未启动时不注入。 | src/api/client.ts（读取注入）、vite.config.ts | runtime-sidecar/src/daemon.ts、runtime-sidecar/src/devMain.ts、runtime-sidecar/src/index.ts | 无 | 已完成 | `pnpm runtime:dev` 启动后写入 `.pm-runtime/runtime-state.json`；Vite 开发期注入 `window.__PM_RUNTIME_CONFIG__`；真实浏览器验证 `/api/v1/health` 返回 200、RuntimeGate 通过、外壳渲染出项目/连接设置/诊断导航。`daemon.test.ts` 用真实回环 `fetch` 覆盖同一路径。 |
| COM-037 | 集成执行模型/fullstack | 工程 | 第二次环境事故：`git checkout dev` 连带 `git merge` 中断后，`.git/objects/pack` 被清空、`refs/heads/*` 全部松散引用消失，工作区部分文件被回滚或删除。本轮全部本地提交（COM-024/025/026/029/030/036 对应的提交）再次丢失。 | 从 `origin` 取回对象库（315 个对象），按 COM-034 的规则重建 `packed-refs`，用只读方式对比工作区与 `origin/dev` 定位差异，再逐文件重做丢失内容并重新提交。 | 无 | 无 | 无 | 已完成 | 远程未受影响。结论：未推送的本地提交在本机不持久，每个任务包完成后应立即推送（需用户授权）。 |
| COM-038 | 后端执行模型/backend-local | 工程 | BE-007 把迁移事实来源放在 `packages/storage/migrations/*.sql`，运行时由 `loadMigrationsFromDirectory()` 读盘。sidecar 打成 externalBin 后这些文件是否随二进制分发、还是构建期内联为 TS 常量，尚未决定；在结论落地前，桌面壳启动不能依赖运行时读盘。 | 两种做法取其一并在 BE-038（sidecar 打包）前定稿：随包分发需保证目录与二进制同级且可读；内联需保证构建期生成的常量与磁盘文件同校验和。不得运行时读盘失败就静默跳过迁移。 | 无 | runtime-sidecar/src/daemon.ts、packages/storage/src/migrationRunner.ts | schema_migrations | 待确认 | 当前 `applyMigrations` 的迁移定义是入参，打包侧可自由选择注入方式；未做打包实测。 |
| COM-039 | 后端执行模型/backend-local | 数据库 | `DATABASE_PLAN.md` 第 3 节把 `schema_migrations` 与其他业务表并列，暗示由 0001 创建；但迁移文件要记录自己就必须先有这张表，放进 0001 会让 runner 在读历史前先撞上“表不存在”。 | 由 runner 持有 `schema_migrations` 的唯一 DDL（`CREATE TABLE IF NOT EXISTS`），0001 不创建它；其余各表仍全部由迁移文件创建。以单一 DDL 权威为准，不以表清单位置为准。 | 无 | packages/storage/src/migrationRunner.ts | schema_migrations | 已完成 | 决策与理由记入 `docs/decisions/BE-007-migration-runner.md`；26 个用例覆盖空库、升级、回滚与历史校验。 |
| COM-040 | 后端执行模型/backend-local | 测试 | BE-007/BE-008 的验收项里“磁盘满”与“同路径并发写”没有可控的故障注入手段，当前只有代码路径保证（失败转 `MIGRATION_APPLY_FAILED` / `WRITE_FAILED` 并清理临时文件），没有实测证据。 | 在 BE-036（崩溃恢复）建立故障注入夹具时一并补齐，或在 DB-016/DB-018 用可插拔的 fs 边界实现；在此之前不得把“磁盘满可恢复”写进验收结论。 | 无 | packages/storage/src/migrationRunner.ts、packages/storage/src/fileStore.ts | 无 | 待确认 | Windows 上目录 fsync 不可用，`fsyncBestEffort` 吞掉不支持的异常；崩溃时最坏情况是“已提交事务 + 文件未落盘”，由 BE-036 依据哈希与状态处理。 |

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

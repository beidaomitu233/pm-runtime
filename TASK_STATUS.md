# PM Runtime MVP v0.1 任务状态

本表记录当前工作目录中的本地协作状态，远程归属以 `origin/dev` 为准。

- 远程仓库：`origin` = `https://github.com/beidaomitu233/pm-runtime.git`
- 协作分支：`dev`（集成分支）、`main`（验收合并）
- 状态取值：未领取、进行中、阻塞、待合并、完成

> 修复记录（一）2026-09-21：本文件曾以带 Git 冲突标记（`<<<<<<< HEAD` / `=======` / `>>>>>>> origin/dev`）的状态提交到 `dev`，两侧任务记录互相遮蔽，任务表在网页端和渲染时都不可读。本次合并两侧记录并重建全表，登记为 COM-024。
>
> 修复记录（二）2026-09-21：工作区发生环境事故——`.git/objects` 被清空、分支引用消失、工作区文件回滚到会话前状态，上一轮尚未推送的提交（含修复记录一中描述的全部内容）丢失。已从 `origin` 重建对象库与引用并重做修复，登记为 COM-033。事故不涉及远程，`origin` 上各分支完整。
>
> 修复记录（三）2026-09-21：本文件所在的 `dev` 再次发生同类事故——`git checkout dev` 连带 `git merge` 中断后，`.git/objects/pack` 被清空、`refs/heads/*` 松散引用全部消失，工作区部分文件被回滚或删除，本轮全部本地提交再次丢失。已从 `origin` 取回 315 个对象、按 COM-034 的规则重建 `packed-refs`、用只读方式对比工作区与 `origin/dev` 后逐文件重做并重新提交，登记为 COM-037。事故不涉及远程。

## 1 任务表

| 任务编号 | 负责人 | 修改范围 | 状态 | 更新时间 | 阻塞原因 |
| --- | --- | --- | --- | --- | --- |
| BE-001 | 后端执行模型/backend-local | 后端 workspace、packages 空骨架、统一 strict 配置及构建测试；不修改现有前端页面和业务代码 | 完成 | 2026-09-21 | 无。远程 `dev` 已含 workspace 骨架；后端 typecheck 与测试实际通过 |
| BE-002 | 后端执行模型/backend-local | `packages/contracts`：成功/错误 envelope、分页、ID、时间、错误码 Schema、类型、示例和运行时校验 | 完成 | 2026-09-21 | 无。已合并到 `dev` |
| BE-003 | 后端执行模型/backend-local | `packages/contracts`：Diagram DSL v0.1 JSON Schema、类型、运行时校验、合法/非法 fixtures 和变更规则 | 完成 | 2026-09-21 | 无。已合并到 `dev` |
| BE-004 | 后端执行模型/backend-local | `runtime-sidecar/src`：daemon 生命周期、随机回环端口、单实例锁、runtime state、session token 和优雅停止 | 完成 | 2026-09-21 | 无。已合并到 `dev` |
| BE-005 | 后端执行模型/backend-local | `runtime-sidecar/src`：Fastify HTTP 基线、X-PM-Session 认证、requestId、body limit、CORS 和统一错误处理 | 完成 | 2026-09-21 | 无。已合并到 `dev` |
| BE-006 | 后端执行模型/backend-local | `packages/storage`：SQLite 驱动选型技术闸门（事务、WAL、备份、Windows 自包含打包） | 阻塞 | 2026-09-21 | **合并阻塞已解除**：成果 `89e4605` 已合入 `dev`（`docs/decisions/BE-006-sqlite-driver.md`、`src/sqliteGate.ts`、`src/sqliteGate.test.ts`）。剩余阻塞属验收项本身：当前环境没有干净 Windows VM，sidecar externalBin 自包含打包与无 Node 启动尚未验证，故不勾选完成 |
| BE-007 | 未领取 | `packages/storage`：Migration runner（版本、checksum、事务、启动校验） | 未领取 | 2026-09-21 | 前置 BE-006 已进入 `dev`，可开工 |
| BE-008 | 未领取 | `packages/storage`：受控相对路径、临时文件、原子移动、SHA-256、孤儿清理 | 未领取 | 2026-09-21 | 前置 BE-006 已进入 `dev`，可开工 |
| BE-009～BE-015 | 未领取 | 项目与会议：Project service、TXT/MD/DOCX 解析、导入落盘、列表/详情/分块正文与性能隐私 | 未领取 | 2026-09-21 | 依赖 BE-007/BE-008；该链路直接决定 FE-012～FE-017 能否真实联调 |
| BE-016 | 后端执行模型/backend-local | `packages/diagram-core`：Ajv Diagram DSL Schema validator、错误路径和错误数量上限 | 完成 | 2026-09-21 | 无。已合并到 `dev` |
| BE-017 | 后端执行模型/backend-local | `packages/diagram-core`：Diagram DSL 业务规则校验、引用/泳道/可达性/decision/self-loop/重复边 | 完成 | 2026-09-21 | 无。已合并到 `dev` |
| BE-018 | 后端执行模型/backend-local | `packages/diagram-core`：SourceRefs meeting/node/offset/quote 校验与规范化输出 | 完成 | 2026-09-21 | 无。已合并到 `dev` |
| BE-019 | 后端执行模型/backend-local | `packages/diagram-core`：DSL 到与 draw.io 无关的稳定 Graph Model 转换 | 完成 | 2026-09-21 | 无。已合并到 `dev` |
| BE-020 | 后端执行模型/backend-local | `packages/diagram-core`：ELK.js/Dagre layout 技术闸门、lane-aware 方案、回退和性能证据 | 阻塞 | 2026-09-21 | **合并阻塞已解除**：成果 `7b48ab8` 已合入 `dev`（`docs/decisions/BE-020-layout-gate.md`、`src/layoutGate.ts`、`src/layoutGate.test.ts`）。剩余阻塞属验收项本身：3-6 泳道视觉评审与坐标快照尚未完成，见 COM-023 |
| BE-021～BE-040 | 未领取 | 布局实现、draw.io adapter、render/revision/export、MCP 与宿主适配、打包与发布验收 | 未领取 | 2026-09-21 | 依赖 BE-020 技术闸门结论 |
| FE-001～FE-011 | 前端执行模型/local-foundation | package.json、Vite/TypeScript 配置、src/app、src/api、src/pages、src/state、基础测试 | 进行中 | 2026-09-21 | 原阻塞「依赖安装和自动检查尚未完成」已解除：前端 typecheck、6 个测试文件 14 个用例、`vite build` 均实际通过。逐项验收证据（健康检查四场景、404 路由、axe、1024x720 布局）尚未逐项核对，故不勾选完成 |
| FE-012/013/015/016 | 前端执行模型/meetings | Meetings 列表、粘贴导入、详情分块查看、meeting ID 与 Agent 引导 | 进行中 | 2026-09-21 | 会议 API（BE-009～BE-015）未实现，页面只能对着局部 typed client 验证；取得真实接口前不得标记联调通过 |
| FE-014 | 前端执行模型/meetings | 通过 Tauri 文件选择器导入 TXT、MD、DOCX | 阻塞 | 2026-09-21 | 仓库尚无 `src-tauri` 与 Tauri capability，受控 file handle 不可用；不伪造浏览器路径 |
| FE-018/019 | 前端执行模型/diagrams | 图形列表、类型/状态筛选、详情、warning、来源与 revision 历史 | 进行中 | 2026-09-21 | Diagram API 与 `@pm/contracts` 的 diagrams DTO/Schema 尚未实现；见 COM-021 |
| FE-020～FE-032 | 未领取 | 编辑器技术闸门、DrawioBridge、revision 保存、版本历史、导出、连接设置、诊断、CSP、无障碍与 E2E | 未领取 | 2026-09-21 | FE-020 编辑器闸门未通过前不得启动 FE-021～FE-025 |
| DB-001～DB-018 | 未领取 | 迁移框架、运行参数、初始 Schema、文件路径契约、Repository、备份恢复、查询计划与发布验收 | 未领取 | 2026-09-21 | 前置 BE-006 已进入 `dev`，可开工 |

## 2 阻塞汇总

| 编号 | 阻塞内容 | 影响范围 | 解除条件 | 状态 |
| --- | --- | --- | --- | --- |
| B-1 | BE-006 storage gate 与 BE-020 layout gate 未合并进 `dev` | BE-007/008 → BE-009～015 → FE-012～017；DB-001～018 | 将两个 feature 分支合入 `origin/dev` | **已解除**（2026-09-21） |
| B-2 | BE-020 泳道视觉评审与坐标快照未完成 | BE-021/022 → BE-023～025 → FE-018/019 真实联调 | 提供视觉评审环境并完成 3-6 泳道、长中文标签、回退边检查 | 未解除 |
| B-3 | 会议与图形 API 未实现（后端仅有 health 与鉴权基线） | FE-012～FE-019 的页面无法对接真实后端 | 推进 BE-009～BE-025 | 未解除 |
| B-4 | Tauri 桌面壳与 capability 缺失 | FE-014 文件导入、FE-032 桌面 E2E | 建立 `src-tauri` 工程并登记最小 capability | 未解除 |
| B-5 | `REVIEW_REPORT.md` 不存在 | 审查环节无输入基线 | 审查模型补充；当前记录为文档缺口 | 未解除 |
| B-6 | 浏览器端无法到达 Runtime | 所有页面的真实接口联调 | 提供 dev 通道：运行时启动入口 + API 代理 + 配置注入，且不写死随机端口与令牌 | 处理中 |
| B-7 | 会议/图形页面的真实接口不可用，只能对着局部 typed client 验证 | FE-012～FE-019 不得标记联调通过 | 同 B-1、B-3 | 部分解除（B-1 已解除，B-3 仍在） |

## 3 说明

1. 正式远程领取需在协作分支和认领机制就绪后进行；本表本地行不代表远程占用。
2. `origin/HEAD` 当前指向 `feature/backend-monorepo-local`，与实际协作方式不符，建议指向 `dev`。已登记 COM-031。
3. 工作区存在未跟踪的既有资料（`AGENTS.md`、`prototype/`、`需求讨论记录.md`、`应用功能清单.md`、`2026.08.13.PBS+插件开发计划(1).xlsx`）和未跟踪的 `vitest.backend.config.ts` 重复配置，保留不动，见 COM-032。`.workbuddy/` 已加入 `.gitignore`。
4. B-6 属于链路级阻塞，不是单个页面缺陷，已于本地解除：先执行 `pnpm runtime:dev` 启动 Runtime，Vite 开发期插件再把真实回环端口与令牌注入 `window.__PM_RUNTIME_CONFIG__`。选择注入而不是代理，是因为代理需要把令牌写进 dev server 配置或转发规则，会引入第二份令牌来源；注入复用 Runtime 自己写出的 state 文件，端口与令牌都不写死。桌面壳就绪后应移除该插件，避免两套注入来源。B-6 解除不等于页面已联调通过：业务路由仍未实现，见 B-3。
5. 本机 `.git/refs` 下新建多级目录会静默失败（`fix/xxx`、`feature/xxx`），分支名请使用顶层名称；`packed-refs` 必须写成 `<sha> <refname>`、按 refname 排序且行尾不得带 CR，否则 `for-each-ref` 报 `ignoring ref with broken name`。索引损坏时用 `git read-tree --reset HEAD` 重建，不要手工删除 `.git/index`。见 COM-034。
6. 未推送的本地提交在本机不持久：同类事故已发生两次（COM-033、COM-037），本表、修复提交和闸门成果都曾整批丢失。任务包完成后应尽快推送；推送属对外操作，需用户授权。

## 4 本次验证记录（2026-09-21）

执行环境：Windows，Node v22.22.2，pnpm 9.15.0，vite 6.4.3，vitest 3.2.7，TypeScript 5.9.3。
`pnpm-lock.yaml` 只解析出单一 `vite@6.4.3` 与 `vitest@3.2.7`，不再出现 vitest 2.x 带来的第二份 vite。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 前端类型检查 | `tsc --noEmit` | 通过（exit 0） |
| 后端类型检查 | `tsc -p tsconfig.backend.json --noEmit` | 通过（exit 0） |
| 前端测试 | `vitest run` | 6 个文件 / 14 个用例全部通过（exit 0） |
| 后端测试 | `vitest run --config vitest.backend.config.mjs` | 12 个文件 / 37 个用例全部通过（exit 0） |
| 生产构建 | `vite build` | 通过，96 个模块（exit 0） |
| 一键复验 | `pnpm check` | 上述 typecheck 与两组测试串行执行，exit 0 |
| 真实浏览器联调 | Playwright 驱动 chromium 访问 Vite dev server | `/api/v1/health` 返回 200；RuntimeGate 通过；外壳渲染出项目/连接设置/诊断导航；未实现路由显示“Route not found”并带真实 requestId。详见 `INTEGRATION_REPORT.md` |

未执行：Playwright E2E 套件（无 `src-tauri`，`test:e2e` 尚无用例）、数据库迁移与落盘（BE-007 起）。

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
| BE-007 | 后端执行模型/backend-local | `packages/storage`：Migration runner（版本、checksum、事务、启动校验） | 完成 | 2026-09-22 | 无。`migrationRunner.ts` + 13 个用例通过；checksum 改写、版本倒退、失败回滚、重复运行、CRLF 归一均有实测。剩余边界见 `docs/decisions/BE-007-migration-runner.md`：磁盘满未做注入、迁移文件的打包分发待定（COM-038） |
| BE-008 | 后端执行模型/backend-local | `packages/storage`：受控相对路径、临时文件、原子移动、SHA-256、孤儿清理 | 完成 | 2026-09-22 | 无。`fileStore.ts` + 14 个用例通过；路径穿越、junction 逃逸、rename 失败无残留、孤儿清理只扫 `.tmp` 均有实测。剩余边界见 `docs/decisions/BE-008-file-store.md`：磁盘满与并发写未做注入、目录 fsync 在 Windows 不可用 |
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
| DB-001～DB-006 | 后端执行模型/backend-local | 迁移框架、运行参数、初始 Schema、文件路径契约、Repository 基类、备份恢复 | 完成 | 2026-09-22 | 无。DP1 六项全部完成并各有实测用例；未覆盖的边界（断电、映射网络盘、磁盘满、并发翻页）逐项记在对应 ADR，不以"基本完成"收尾 |
| DB-007～DB-018 | 后端执行模型/backend-local | 各领域表 repository、导出元数据决策、查询计划、完整性审计、崩溃恢复、迁移回归与发布验收 | 未领取 | 2026-09-22 | 前置 DP1 已完成，可开工；DB-013 需先定 Q-DB-003（延迟导出是否新增 `revision_artifacts`） |

## 2 阻塞汇总

| 编号 | 阻塞内容 | 影响范围 | 解除条件 | 状态 |
| --- | --- | --- | --- | --- |
| B-1 | BE-006 storage gate 与 BE-020 layout gate 未合并进 `dev` | BE-007/008 → BE-009～015 → FE-012～017；DB-001～018 | 将两个 feature 分支合入 `origin/dev` | **已解除**（2026-09-21） |
| B-2 | BE-020 泳道视觉评审与坐标快照未完成 | BE-021/022 → BE-023～025 → FE-018/019 真实联调 | 提供视觉评审环境并完成 3-6 泳道、长中文标签、回退边检查 | 未解除 |
| B-3 | 会议与图形 API 未实现（后端仅有 health 与鉴权基线） | FE-012～FE-019 的页面无法对接真实后端 | 推进 BE-009～BE-025 | 未解除 |
| B-4 | Tauri 桌面壳与 capability 缺失 | FE-014 文件导入、FE-032 桌面 E2E | 建立 `src-tauri` 工程并登记最小 capability | 未解除 |
| B-5 | `REVIEW_REPORT.md` 不存在 | 审查环节无输入基线 | 审查模型补充；当前记录为文档缺口 | 未解除 |
| B-6 | 浏览器端无法到达 Runtime | 所有页面的真实接口联调 | 提供 dev 通道：运行时启动入口 + 配置注入，且不写死随机端口与令牌 | **已解除**（2026-09-21） |
| B-7 | 会议/图形页面的真实接口不可用，只能对着局部 typed client 验证 | FE-012～FE-019 不得标记联调通过 | 同 B-1、B-3 | 部分解除（B-1 已解除，B-3 仍在） |

## 3 说明

1. 正式远程领取需在协作分支和认领机制就绪后进行；本表本地行不代表远程占用。
2. `origin/HEAD` 当前指向 `feature/backend-monorepo-local`，与实际协作方式不符，建议指向 `dev`。已登记 COM-031。
3. 工作区存在未跟踪的既有资料（`AGENTS.md`、`prototype/`、`需求讨论记录.md`、`应用功能清单.md`、`2026.08.13.PBS+插件开发计划(1).xlsx`）和未跟踪的 `vitest.backend.config.ts` 重复配置，保留不动，见 COM-032。`.workbuddy/` 与 `.pm-runtime/` 已加入 `.gitignore`。
4. B-6 属于链路级阻塞，不是单个页面缺陷，已于本地解除：先执行 `pnpm runtime:dev` 启动 Runtime，Vite 开发期插件再把真实回环端口与令牌注入 `window.__PM_RUNTIME_CONFIG__`。选择注入而不是代理，是因为代理需要把令牌写进 dev server 配置或转发规则，会引入第二份令牌来源；注入复用 Runtime 自己写出的 state 文件，端口与令牌都不写死。桌面壳就绪后应移除该插件，避免两套注入来源。B-6 解除不等于页面已联调通过：业务路由仍未实现，见 B-3。
5. 本机 `.git/refs` 下新建多级目录会静默失败（`fix/xxx`、`feature/xxx`），分支名请使用顶层名称；`packed-refs` 必须写成 `<sha> <refname>`、按 refname 排序且行尾不得带 CR，否则 `for-each-ref` 报 `ignoring ref with broken name`。索引损坏时用 `git read-tree --reset HEAD` 重建，不要手工删除 `.git/index`。见 COM-034。
6. 未推送的本地提交在本机不持久：同类事故已发生两次（COM-033、COM-037），本表、修复提交和闸门成果都曾整批丢失。任务包完成后应尽快推送；推送属对外操作，需用户授权。
7. 迁移文件目前以 `packages/storage/migrations/*.sql` 的形式存在，运行时由 `loadMigrationsFromDirectory()` 读盘。sidecar 打成 externalBin 后是否随二进制分发尚未决定（COM-038）；在结论落地前，桌面壳启动不能依赖运行时读盘，BE-036 之前的启动流程也不应假设迁移目录一定存在。
8. DP1 全部完成后，数据库仍未被 daemon 打开：`pnpm runtime:dev` 不会迁移数据库，页面也没有新增可联调接口。`openRuntimeDatabase` 是 BE-009 起各 service 的唯一入口；把句柄接进 HTTP 路由属于第一个需要它的 API 任务（BE-013）。因此 B-3 不因本批完成而变化。
9. `@pm/contracts` 此前没有任何源码 import（两个包声明了依赖但未使用），缺少 `main`/`types`/`exports` 的缺口直到 storage 成为第一个真实使用者才暴露，见 COM-042。该缺口已修，后续需要共用契约的包（BE-025、BE-026）不再被同一问题阻断。
10. `DB-002` 的 `synchronous=NORMAL` 只承诺进程崩溃级别，断电不在承诺范围，需验收方确认“崩溃”边界，见 COM-044。

## 4 本次验证记录（2026-09-21）

执行环境：Windows，Node v22.22.2，pnpm 9.15.0，vite 6.4.3，vitest 3.2.7，TypeScript 5.9.3。
`pnpm-lock.yaml` 只解析出单一 `vite@6.4.3` 与 `vitest@3.2.7`，不再出现 vitest 2.x 带来的第二份 vite。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 前端类型检查 | `tsc --noEmit` | 通过（exit 0） |
| 后端类型检查 | `tsc -p tsconfig.backend.json --noEmit` | 通过（exit 0） |
| 前端测试 | `vitest run` | 6 个文件 / 14 个用例全部通过（exit 0） |
| 后端测试（BE-007/008 前） | `vitest run --config vitest.backend.config.mjs` | 12 个文件 / 37 个用例全部通过（exit 0） |
| 生产构建 | `vite build` | 通过，96 个模块（exit 0） |
| 一键复验 | `pnpm check` | 上述 typecheck 与两组测试串行执行，exit 0 |
| 真实浏览器联调 | Playwright 驱动 chromium 访问 Vite dev server | `/api/v1/health` 返回 200；RuntimeGate 通过；外壳渲染出项目/连接设置/诊断导航；未实现路由显示“Route not found”并带真实 requestId。详见 `INTEGRATION_REPORT.md` |

### 4.1 BE-007 / BE-008 验证记录（2026-09-22）

执行环境同上。`pnpm check` 串行执行两次 typecheck 与两组测试，exit 0。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 后端测试（增量后） | `vitest run --config vitest.backend.config.mjs` | 15 个文件 / 77 个用例全部通过（exit 0） |
| 迁移框架 | 同上，`packages/storage/src/migrationRunner.test.ts` | 13 个用例通过：空库、重复运行、逐版升级、checksum 改写、版本倒退、失败回滚、历史断档、定义非法、CRLF 归一、packaged 迁移落地 |
| 初始 Schema | 同上，`packages/storage/src/initialSchema.test.ts` | 13 个用例通过：9 张表与声明索引存在，各枚举/外键/唯一/STRICT 约束均有反例 |
| 文件存储 | 同上，`packages/storage/src/fileStore.test.ts` | 14 个用例通过：原子写、哈希、覆盖、13 种越界路径、Unicode、junction 逃逸、链接文件、rename 失败无残留、孤儿清理、路径构造 |

未执行：磁盘满故障注入（迁移与落盘均无可控注入手段）、同路径并发写、迁移文件在 externalBin 打包后的分发验证。

### 4.2 DB-002 / DB-005 / DB-006 验证记录（2026-09-22）

执行环境同上。`pnpm check` 串行执行两次 typecheck 与两组测试，exit 0；`vite build` 通过（96 个模块，exit 0）。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 契约入口 | `tsc -p tsconfig.backend.json --noEmit` | 通过（exit 0）。此前 `@pm/contracts` 缺 `main`/`types`/`exports`，storage 作为第一个真实使用者报 TS2307，见 COM-042 |
| 运行参数 DB-002 | `vitest run --config vitest.backend.config.mjs packages/storage/src/runtimeParams.test.ts` | 9 个用例通过：参数落地并读回验证、拒绝相对/UNC/指向文件的路径、WAL 持久在库头、写者持锁时读者仍读到已提交快照且第二写者等待、`TRUNCATE` 检查点把 `-wal` 清为 0 字节、真实子进程 `SIGKILL` 后已提交 25 行完整保留而未提交事务不残留 |
| Repository 基类 DB-005 | 同上，`packages/storage/src/repository.test.ts` 与 `ids.test.ts` | 25 个用例通过：UTC 毫秒统一且拒绝无毫秒形式、ULID 同毫秒单调与时钟回拨钳制、游标形状校验、1000 行共用同一时间戳按 100 条翻 10 页不重不漏、软删除默认过滤、事务回滚保留原始错误、标识符白名单与保留参数名 |
| 备份恢复 DB-006 | 同上，`packages/storage/src/backup.test.ts` 与 `runtimeDatabase.test.ts` | 17 个用例通过：备份取备份时刻的已提交快照、并发写者持有未提交事务时备份不含该行、两份损坏备份被识别为不可用、恢复后库仍可继续写入、恢复时清除目标旧 `-wal`/`-shm`、保留策略只删已发布文件、迁移前备份确为迁移前状态（不含新表）、库版本高于应用时拒绝启动、无库文件的目录诊断不会创建库 |
| 后端测试（汇总） | `vitest run --config vitest.backend.config.mjs` | 20 个文件 / 128 个用例全部通过（exit 0） |

未执行：断电与硬复位验证（需真实断电或虚拟机强杀）、映射网络驱动器的识别、磁盘满故障注入、并发翻页与并发归档竞争、行值比较是否命中索引的 `EXPLAIN QUERY PLAN`（属 DB-014）。

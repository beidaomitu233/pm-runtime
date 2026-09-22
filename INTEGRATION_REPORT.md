# PM Runtime MVP v0.1 前后端联调报告

- 日期：2026-09-21
- 执行角色：集成执行模型 / fullstack
- 基线分支：`dev`（本轮起点为 `origin/dev` = `90c46c0`）
- 范围：把已交付的前端、后端契约、图形与存储成果在 `dev` 上真正跑通，处理链路级阻塞，并留下可复现的验证证据。不实现业务路由，不改动公开契约。

> 本文件是在 Git 事故中丢失后重建的。上一版从未提交，因此不在任何分支历史里；本版所有结论都重新执行过（见 §5、§6）。

## 1 结论摘要

| 编号 | 阻塞内容 | 本轮结论 |
| --- | --- | --- |
| B-1 | BE-006 storage gate 与 BE-020 layout gate 未进入 `dev` | **已解除**。两个闸门的成果与决策文档已在 `dev` 上受跟踪 |
| B-2 | BE-020 泳道视觉评审与坐标快照未完成 | 未解除（属验收项本身，不是合并问题） |
| B-3 | 会议与图形 API 未实现（后端只有 health 与鉴权基线） | 未解除，但前置已清空：DB-001～DB-006 于 §10、§11 全部完成，BE-009～BE-015 无遗留前置。这是当前唯一的实质性功能缺口 |
| B-4 | 缺少 `src-tauri` 桌面壳与 capability | 未解除 |
| B-5 | `REVIEW_REPORT.md` 不存在 | 未解除（文档缺口） |
| B-6 | 浏览器端无法到达 Runtime | **已解除**，并有真实浏览器证据 |
| B-7 | FE-012～FE-019 不得标记联调通过 | 部分解除（B-1 已解除，B-3 仍在） |

B-1 与 B-6 都已在本轮用可复现的命令验证；没有用硬编码端口、令牌或桩数据绕过任何问题。

## 2 环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows |
| Node | v22.22.2 |
| 包管理器 | pnpm 9.15.0 |
| vite | 6.4.3 |
| vitest | 3.2.7 |
| TypeScript | 5.9.3 |
| Runtime 监听 | `127.0.0.1` 随机端口（本轮为 10436），仅回环 |

## 3 本轮变更

按目的拆分，一个提交对应一个目的，均已在 `dev` 上：

| 提交 | 目的 |
| --- | --- |
| `d44bb82` | COM-025 修复前端契约导入缺失、列表页骨架屏替换整页、RTL cleanup 未注册 |
| `3030d3a` | COM-026 把 `vitest` 钉到 `^3.2.7` 消除双份 vite，补 `typecheck:backend` / `test:backend` / `check`，跟踪 lockfile |
| `027e5d3` | BE-006 把 SQLite 驱动闸门成果与决策文档纳入 `dev` |
| `5067b19` | BE-020 把布局闸门成果与决策文档纳入 `dev` |
| `3715023` | COM-029 / COM-030 修复 CORS preflight 漏 `X-Request-Id`、未实现路由返回非统一 envelope |
| `0e6ecd8` | COM-036 可运行的 Runtime daemon 入口（装配生命周期与 HTTP 基线） |
| `c41f8e0` | COM-036 开发期向页面注入真实回环地址与令牌（不做代理、不写死） |

BE-006 / BE-020 的内容与 `origin` 上 `feature/backend-storage-gate-backend-local`（`89e4605`）、`feature/backend-layout-gate-backend-local`（`7b48ab8`）一致；本地合并提交在事故中丢失，本轮按原内容重新落入 `dev`。

## 4 关键修复说明

### 4.1 COM-026：vitest 与 vite 的双份依赖

首次提交只加了脚本，`vitest` 的版本范围未落进 `package.json`，因此新生成的 `pnpm-lock.yaml` 解析出 `vitest@2.1.9` 并连带 `vite@5.4.21`——即“一个仓库两份 vite”。本轮把范围改为 `^3.2.7` 并重新安装，lockfile 现在只解析出单一 `vite@6.4.3` 与 `vitest@3.2.7`。**这条如果不修，干净检出的 `--frozen-lockfile` 安装会再次失败。**

### 4.2 COM-029：被静默拦截的 preflight

前端每个请求都带 `X-Request-Id`，而 CORS 允许头只有 `X-PM-Session, Content-Type, Idempotency-Key`。浏览器 preflight 因此失败并直接拦截请求：**没有响应、没有 Runtime 报错**，页面只停在“本地服务尚未就绪”。这类问题 `inject` 单测覆盖不到，只有真实浏览器能暴露。修复方式是把允许头抽成导出常量，并在测试中断言其内容。

### 4.3 COM-030：404 破坏统一 envelope

未实现的路由原先返回 Fastify 默认体 `{statusCode,error,message}`，不符合 `@pm/contracts` 的错误 envelope，前端解析落空后降级为“Runtime 请求失败。”，把“路由不存在”显示成“服务不可用”。修复后返回 `{error:{code:"INVALID_ARGUMENT",message:"Route not found"},requestId}`。

### 4.4 COM-036：开发期的 Runtime 通道

生产环境由 Tauri 安全上下文注入 base URL 与令牌。没有桌面壳时浏览器没有注入来源，`getConfig()` 只能回落到相对路径 `/api/v1`，请求打到 Vite dev server 拿到非 JSON。

处理方式：新增可运行的 daemon 入口（`pnpm runtime:dev`），并在 Vite 开发期用 `transformIndexHtml` 读取 Runtime 自己写出的 `.pm-runtime/runtime-state.json`，把真实地址与令牌注入 `window.__PM_RUNTIME_CONFIG__`。

选择注入而不是代理：代理需要把令牌写进 dev server 配置或转发规则，会引入第二份令牌来源和一处新的泄漏面；注入复用 Runtime 已写出的 state 文件，**端口与令牌都不写死，也不写入 localStorage**。Runtime 未启动时不注入，页面照常显示不可用状态，不会把“服务没起来”伪装成“已连通”。桌面壳就绪后应移除该插件，避免两套注入来源。

## 5 验证命令与结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 前端类型检查 | `pnpm exec tsc --noEmit` | exit 0 |
| 后端类型检查 | `pnpm exec tsc -p tsconfig.backend.json --noEmit` | exit 0 |
| 前端测试 | `pnpm exec vitest run` | 6 个文件 / 14 个用例通过 |
| 后端测试 | `pnpm exec vitest run --config vitest.backend.config.mjs` | 12 个文件 / 37 个用例通过 |
| 一键复验 | `pnpm check` | exit 0（上述 typecheck 与两组测试串行） |
| 生产构建 | `pnpm exec vite build` | 通过，96 个模块 |
| lockfile 依赖 | `pnpm-lock.yaml` 检索 `vite@` / `vitest@` | 仅 `vite@6.4.3`、`vitest@3.2.7` |

`daemon.test.ts` 与 `httpBaseline.test.ts` 都覆盖本轮修复：前者用真实回环 `fetch` 验证健康检查、状态落盘和 Origin 拒绝；后者断言 preflight 的允许头包含 `X-Request-Id`，以及未知路由返回统一 envelope 并带 26 位 requestId。

## 6 真实浏览器证据

命令：两个终端分别执行 `pnpm runtime:dev` 与 `pnpm dev`，第三个终端执行 `node scripts/verify-runtime-page.mjs`。

结果（`PASS`，exit 0）：

- `200 http://127.0.0.1:10436/api/v1/health` —— 页面确实连上了 Runtime
- `window.__PM_RUNTIME_CONFIG__.baseUrl = http://127.0.0.1:10436/api/v1` —— 注入的是真实回环端口，不是写死值
- `showsRuntimeUnavailable: false` —— RuntimeGate 通过
- 外壳渲染出「项目 / 连接设置 / 诊断」三个导航入口
- 页面文本含「Runtime 已连接」，以及「项目 暂时无法加载 / Route not found / requestId：01M32A469PZC38PSE96R8Z56K9 / 重试」——即 COM-030 修复后，未实现路由如实报“路由不存在”，并给出可追踪的 requestId

截图：`docs/evidence/runtime-connected.png`。

`apiCalls` 中出现的 404 是预期结果：业务路由尚未实现（B-3）。这正是 B-6 与 B-3 必须分开判断的原因——链路已通，接口未实现。

## 7 Git 事故与恢复步骤

本目录的未推送提交在一天内丢失两次，登记为 COM-033 与 COM-037。两次都由 `.git/objects` 内容被清空引起，远程 `origin` 未受影响。

本机环境的两个非直觉行为（登记为 COM-034），恢复时必须遵守：

1. `.git/refs` 下新建多级目录会静默失败（`fix/xxx`、`feature/xxx` 退出码为 0 但分支不存在）——分支名请用顶层名称。
2. `packed-refs` 必须按 refname 排序，且**行尾不得带 CR**。用 PowerShell 重建时若保留 CRLF，`git for-each-ref` 会报 `ignoring ref with broken name refs/heads/dev?`，`git rev-parse HEAD` 会报 `Needed a single revision`——看起来像“分支不存在”，实际是引用名里混进了回车。

可复现的恢复步骤：

1. 先备份：把工作区（排除 `node_modules`、`.workbuddy`）整体复制到工作区之外。
2. 诊断：`git count-objects -v` 看 `in-pack`；`git fsck` 看缺失对象；`Test-Path .git/objects/pack` 看 pack 是否还在。
3. 取回对象：`git fetch origin`（或重新 `git init` + `git remote add` + `git fetch`）。
4. 重建引用：以 LF 行尾按 refname 排序重写 `packed-refs`；不要手工删除 `.git/index`。
5. 重建索引：`git read-tree --reset HEAD`（`git reset` 会因索引里引用了已缺失的 blob 而失败）。
6. 定位差异：`git status --short` 对比工作区与 `origin/dev`，确定哪些文件被回滚、哪些被删除。
7. 逐文件重做丢失内容，重新提交；恢复后立即推送（需用户授权）。

## 8 剩余缺口与下一步

1. **B-3（最高优先级）**：后端仍只有 `health` 与鉴权基线。DB-001～DB-006 已全部完成（见 §10、§11），`BE-009～BE-015`（项目与会议 API）没有遗留前置，可以直接开工，它决定 FE-012～FE-017 能否真实联调。数据层入口是 `openRuntimeDatabase`；把句柄接进 HTTP 路由属于第一个需要它的 API 任务（BE-013）。
2. **B-2**：BE-020 需要视觉评审环境才能补 3–6 泳道与坐标快照。
3. **B-4**：`src-tauri` 与最小 capability 就绪后，FE-014 文件导入才可开工；届时应移除 §4.4 的开发期注入插件。
4. **推送**：`dev` 上有 24 个提交尚未推送（`origin/dev` 之后的全部本地提交）。未推送提交在本机已丢失两次，建议尽快推送；推送属对外操作，等用户确认。
5. **待用户确认**：`origin/HEAD` 指向 `feature/backend-monorepo-local`，建议改指 `dev`（COM-031）；DB-002 的 `synchronous=NORMAL` 只承诺进程崩溃级别，断电是否纳入验收口径需确认（COM-044）。

## 9 已知遗留物

- 工作区根目录残留本次排查产生的临时文件（`.diag*.txt`、`.state*.txt`、`.check*.log`、`.runtime*.log`、`.vite*.log`、`.pageresult*.txt`、`.page-verify.png`、`.verify-page.mjs` 等）。均为未跟踪文件，**未提交**；建议由用户确认后删除，其中 `.verify-page.mjs` 已被 `scripts/verify-runtime-page.mjs` 取代。
- 工作区存在未跟踪的既有资料（`AGENTS.md`、`prototype/`、`需求讨论记录.md`、`应用功能清单.md`、PBS 开发计划 xlsx）与重复配置 `vitest.backend.config.ts`，按 COM-032 保持不动。

## 10 BE-007 / BE-008 存储包（2026-09-22）

目标：解除 BE-009～BE-015 的前置，让项目与会议的持久化有可依赖的迁移框架和落盘通道。

| 交付 | 文件 | 覆盖 |
| --- | --- | --- |
| 迁移框架（DB-001） | `packages/storage/src/migrationRunner.ts` | 版本顺序、checksum、逐版事务、启动校验、只读诊断 |
| 初始 Schema（DB-003） | `packages/storage/migrations/0001_initial.sql` | 9 张表、STRICT、CHECK 枚举、外键、索引 |
| 文件路径契约（DB-004） | `packages/storage/src/fileStore.ts` | 受控相对路径、防穿越与防 junction、原子落盘、SHA-256、临时孤儿清理 |

三个不显然的判断：

1. **`schema_migrations` 由 runner 创建，不在 0001 里**（COM-039）。迁移文件要记录自己就必须先有这张表；放进 0001 会让 runner 在读历史之前先撞上“表不存在”。
2. **checksum 先做 CRLF→LF 归一**（COM-039 同组）。同一份 `.sql` 在 Windows 是 CRLF、在 CI 是 LF，直接哈希原始字节会让 Windows 上每次启动都判定“迁移被改写”。
3. **孤儿清理只扫 `.tmp`**。不遍历正式项目树，因此这里出 bug 也删不到已提交的会议正文或 revision 文件。

验证（`pnpm check`，exit 0）：后端 15 个文件 / 77 个用例全部通过，其中迁移框架 13 个、初始 Schema 约束反例 13 个、文件存储 14 个。越界路径用例实测覆盖 13 种写法，junction 逃逸用例确认外部目录没有生成文件，rename 失败用例确认 `.tmp` 无残留。

未覆盖：磁盘满与同路径并发写（COM-040，无可控注入手段）；迁移文件在 externalBin 打包后的分发方式（COM-038）。

注意：这仍是库层实现，尚未接入 daemon 启动流程。数据库不会在 `pnpm runtime:dev` 时自动迁移，页面也不会因此多出任何可联调的接口——B-3 依旧未解除。

## 11 DB-002 / DB-005 / DB-006 与前置清空（2026-09-22）

目标：把 BE-009～BE-015 之前剩下的三个数据层前置做完，并顺手清掉已发现但尚未爆发的阻断点。

| 交付 | 文件 | 覆盖 |
| --- | --- | --- |
| 运行参数（DB-002） | `packages/storage/src/runtimeParams.ts` | `foreign_keys`/WAL/`busy_timeout`/`synchronous`/`autocheckpoint`/`cache_size` 锁定，本机可写目录校验，检查点与完整性检查 |
| Repository 基类（DB-005） | `packages/storage/src/repository.ts`、`ids.ts` | 事务、UTC 毫秒时间、单调 ULID、软删除默认过滤、行值游标分页 |
| 备份恢复（DB-006） | `packages/storage/src/backup.ts` | 在线备份、发布前校验、损坏识别、恢复演练、保留策略 |
| 启动入口 | `packages/storage/src/runtimeDatabase.ts` | 目录校验 → 打开 → 迁移计划 → 迁移前备份 → 迁移；另有只读诊断入口 |

提交：`56c2405`（补交漏跟踪的 schema 约束用例）、`b7c0fb4` 与 `326e910`（BE-006/BE-020 分支血缘合并）、`7e8d92f`、`3636e12`、`3f01f06`、`3834c40`。

四个不显然的判断：

1. **在线备份产物必须转出 WAL**（COM-043）。备份 API 会连源库头部一起复制，目标因此也是 WAL 模式，它刚写入的页可能落在 `-wal` 伴生文件里；只 rename 主文件等于把备份的一部分丢掉。这是测试实测发现的，不是推理出来的。
2. **`synchronous=NORMAL` 只承诺进程崩溃级别**（COM-044）。SQLite 文档明确 NORMAL 在 WAL 下"应用崩溃后事务仍持久"，只在断电或硬复位时可能回退；验收口径若指断电，必须改 `FULL` 并重测。
3. **写事务默认 `BEGIN IMMEDIATE`**。WAL 下"先读后写"的 deferred 事务可能撞上 `SQLITE_BUSY_SNAPSHOT`，提前取写锁把它变成可被 `busy_timeout` 吸收的等待。
4. **游标携带 `(排序值, id)` 并用 SQLite 行值比较**。只用时间戳作游标时，同一毫秒内的行会重复或漏掉；1000 行共用同一时间戳按 100 条翻 10 页的用例覆盖了这一点。

顺带清掉两个会阻断后续包的问题：

- **分支血缘缺失**（COM-041）：BE-006/BE-020 的内容在事故后以普通提交重做，两个 feature 分支在 `dev` 上没有合并血缘。已用 `--no-ff -X ours` 合并，并按下述判据确认零内容变更：合并前后 `HEAD^{tree}` 均为 `d55e975a23a06543c8f28b20ed90e7d20ee9e2a8`，`git branch --no-merged dev` 输出为空。
- **`@pm/contracts` 缺少入口字段**（COM-042）：该包此前没有任何源码 import（两个包声明了依赖却没用），因此 `main`/`types`/`exports` 缺失一直没暴露；storage 成为第一个真实使用者时报 `TS2307`。补上后 `tsc -p tsconfig.backend.json --noEmit` 由 exit 2 转为 exit 0，BE-025、BE-026 等需要共用契约的包不再撞同一堵墙。

验证（`pnpm check`，exit 0）：后端 20 个文件 / 128 个用例全部通过，其中运行参数 9 个、Repository 与 ULID 25 个、备份与启动入口 17 个。`vite build` 通过（96 个模块）。真实子进程 `SIGKILL` 验证了两侧：已提交的 25 行完整保留，未提交事务不残留。

未覆盖：断电与硬复位、映射网络驱动器识别、磁盘满故障注入、并发翻页与并发归档竞争、行值比较的 `EXPLAIN QUERY PLAN`（属 DB-014）。

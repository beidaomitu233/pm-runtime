# TASK-001 工程基线与共享合同收口

状态：已完成（2026-09-22 项目经理验收通过）  
验收结果：`pnpm check` exit 0（前端 6 文件 16 用例 + 后端 21 文件 132 通过/1 环境跳过）；`pnpm build` exit 0（291 模块）；`pnpm install --frozen-lockfile` exit 0；`src/types/*` 三份重复合同删除且全库无残留引用；前端经 `@pm/contracts` 消费；`resources.test.ts` 覆盖畸形 Health/Project/legacy 字段拒绝。证据提交：`2bcd8b2`、`cc29fe4`、`bbd190f`（分支 `TASK-001`）。遗留 COM-051（sidecar `starting` 分支）转 TASK-002 处理。  
依赖：无  
业务目标：把当前已经存在的 React 基础代码与 backend workspace 收口成一个可以持续开发的工程基线，并消除前后端合同重复，为后续所有纵向 TASK 提供唯一接口类型与运行时 Schema 来源。

当前已有提交 `7eb06e2` 建立了 React/Vite/Router/Query 基础，`0157da3` 建立了 `runtime-sidecar`、`contracts`、`storage`、`diagram-core`、`agent-adapters` 空骨架。本任务应复用这些成果，不重新搭框架，也不开始项目、会议或图形业务开发。

完整结果是：根 workspace 可以一次安装；前端与所有后端 package 可以稳定 typecheck/test；`packages/contracts` 成为 API/MCP/DSL/错误码的唯一合同代码来源；`src/types/contracts.ts` 删除或仅作为从 `@pm/contracts` 的兼容再导出，不再维护第二套字段和校验函数。前端 `src/api` 直接消费共享合同；JSON Schema/Ajv 等运行时校验结构按照 `API_CONTRACT.md` 建立基础组织方式。

允许修改根 `package.json`、workspace/tsconfig/test 配置、`packages/contracts`、`src/types`、`src/api` 以及为统一构建需要的少量基础文件。不得借机重写现有 UI、迁移整个 `src/` 目录或开始后续业务模块。contracts 属于公共冲突区，本任务执行期间只允许本任务负责人修改。

验收要求：从干净 checkout 执行依赖安装后，根前端与 workspace package 的 typecheck、unit test、build 均可按文档命令执行；共享合同至少覆盖 Health、通用成功/错误 envelope、Project 基础对象、分页、稳定错误码和 schemaVersion；前端不存在独立复制的同名合同定义；畸形 Health/Project 响应仍会被运行时校验拒绝。仓库产生锁定的依赖清单/lockfile，后续 Agent 不需要猜测安装版本。

交付时报告实际测试命令与结果、删除/迁移的重复合同、受影响公共文件和 commit。项目经理验收通过后才允许 TASK-002/TASK-003 依赖此合同继续扩展。

## 当前已有成果（2026-09-22 基线对齐，COM-048）

以下内容已在 `dev` 存在，复用不重做：

- `packages/contracts` 已完整：`schemas.ts`/`types.ts`/`validation.ts`/`examples.ts` + `diagram*` 全套 + 测试（COM-019、COM-042 已补 `main`/`types`/`exports`）。
- workspace、`pnpm-lock.yaml`（vite 6.4.3 / vitest 3.2.7 单版本）、`pnpm check`（前后端 typecheck+双测试串行）已可用（COM-026）。
- 后端包已通过 `@pm/contracts` 消费合同（storage 等）。

仍需完成（本任务验收缺口）：

- 前端仍存在第二套合同：`src/types/contracts.ts`、`src/types/meetingContracts.ts`、`src/types/diagramContracts.ts`（COM-046），需迁移为 `@pm/contracts` 消费或兼容再导出，消除字段漂移风险。
- 干净 checkout 全量验证并交付报告；确认 lockfile 冻结安装可复现。

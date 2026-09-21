# PM Runtime MVP v0.1 任务状态

本表记录当前工作目录中的本地协作状态。正式远程领取需在配置远程仓库和协作分支后重新确认。

| 任务编号 | 负责人 | 修改范围 | 状态 | 更新时间 | 阻塞原因 |
| --- | --- | --- | --- | --- | --- |
| BE-001 | 后端执行模型/backend-local | 后端 workspace、packages 空骨架、统一 strict 配置及构建测试；不修改现有前端页面和业务代码 | 进行中 | 2026-09-21 | 未配置远程 Git，无法 fetch/推送领取记录；当前目录没有远程归属确认 |
| FE-001～FE-011 | 前端执行模型/local-foundation | package.json、Vite/TypeScript 配置、src/app、src/api、src/pages、src/state、基础测试 | 进行中 | 2026-09-21 | 远程仓库已配置但当前为空；依赖安装和自动检查尚未完成，无法远程领取或交付确认 |
| FE-012/013/015/016 | 前端执行模型/meetings | Meetings 列表、粘贴导入、详情分块查看、meeting ID 与 Agent 引导 | 进行中 | 2026-09-21 | 会议 API/依赖未完成，自动检查受依赖安装阻断 |
<<<<<<< HEAD
| BE-002 | 后端执行模型/backend-local | `packages/contracts`：成功/错误 envelope、分页、ID、时间、错误码 Schema、类型、示例和运行时校验 | 完成 | 2026-09-21 | 无 |
| BE-003 | 后端执行模型/backend-local | `packages/contracts`：Diagram DSL v0.1 JSON Schema、类型、运行时校验、合法/非法 fixtures 和变更规则 | 完成 | 2026-09-21 | 无 |
=======
| FE-018/019 | 前端执行模型/diagrams | 图形列表、类型/状态筛选、详情、warning、来源与 revision 历史 | 进行中 | 2026-09-21 | Diagram API/合同尚未进入 dev；自动检查受依赖安装阻断 |
>>>>>>> origin/dev
| BE-004 | 后端执行模型/backend-local | `runtime-sidecar/src`：daemon 生命周期、随机回环端口、单实例锁、runtime state、session token 和优雅停止 | 完成 | 2026-09-21 | 无 |
| BE-005 | 后端执行模型/backend-local | `runtime-sidecar/src`：Fastify HTTP 基线、X-PM-Session 认证、requestId、body limit、CORS 和统一错误处理 | 完成 | 2026-09-21 | 无 |
| BE-016 | 后端执行模型/backend-local | `packages/diagram-core`：Ajv Diagram DSL Schema validator、错误路径和错误数量上限 | 完成 | 2026-09-21 | 无 |
| BE-017 | 后端执行模型/backend-local | `packages/diagram-core`：Diagram DSL 业务规则校验、引用/泳道/可达性/decision/self-loop/重复边 | 完成 | 2026-09-21 | 无 |
| BE-018 | 后端执行模型/backend-local | `packages/diagram-core`：SourceRefs meeting/node/offset/quote 校验与规范化输出 | 完成 | 2026-09-21 | 无 |
| BE-019 | 后端执行模型/backend-local | `packages/diagram-core`：DSL 到与 draw.io 无关的稳定 Graph Model 转换 | 进行中 | 2026-09-21 | 无 |

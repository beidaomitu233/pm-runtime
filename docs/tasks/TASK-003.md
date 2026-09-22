# TASK-003 项目管理完整闭环

状态：待开发  
依赖：TASK-002  
对应验收：A01 项目持久化  
业务目标：用户可以在 Desktop 创建、查看、重命名和切换项目，所有操作通过真实 Runtime 与 SQLite 完成，应用重启后数据仍存在。

完整业务链路：Projects 页面/ProjectSwitcher → shared contract → `/api/v1/projects` → project service → projects repository → SQLite → response → Query cache 更新 → 页面/路由展示。

按 `DATABASE_PLAN.md` 实现 projects migration、索引和软删除字段；实现 Project repository/service 与 GET/POST/PATCH API；补齐前端 typed client、Projects 新建/重命名交互、项目列表和全局切换器。项目名允许重复，trim 后 1-80 字符；description 可空。项目路由继续验证 ULID 与 404。写操作使用 Idempotency-Key，并按合同处理并发更新。

允许修改 projects 领域对应 UI、API/service/repository、projects migration 和 Project contracts。不得开始 Meetings/Diagrams 业务。若需要修改通用 contracts/migration runner，先由项目经理确认公共区归属。

验收 Case 1：空库启动，新建“测试项目”，进入项目，返回列表后可看到该项目；重启 Desktop/Runtime 后仍存在。Case 2：重命名后列表、导航、ProjectSwitcher 同步更新，刷新后保持。Case 3：空名称、超长名称、非法 projectId、已不存在项目、重复点击提交均得到稳定结果，不产生重复记录或错误乐观状态。Case 4：至少 1000 条测试项目时 cursor 分页结果稳定，常用查询使用计划索引。

完成时必须使用真实 SQLite 临时库/API 集成测试，并通过真实页面执行一次创建→重命名→切换→重启验证。

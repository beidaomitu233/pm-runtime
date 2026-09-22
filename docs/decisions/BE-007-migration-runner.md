# ADR: BE-007 迁移框架

日期：2026-09-22
状态：已实现并测试通过；打包期迁移文件的分发方式待确认

## 决策

`packages/storage/src/migrationRunner.ts` 实现 DB-001 的迁移框架，配合 `packages/storage/migrations/0001_initial.sql`（DB-003 初始 Schema）。

1. **`schema_migrations` 由 runner 自己创建，不由迁移文件创建。** 迁移文件要记录自己就必须先有这张表，把它的 DDL 放进 0001 会让 runner 在读取历史之前先撞上"表不存在"。runner 用 `CREATE TABLE IF NOT EXISTS` 持有唯一 DDL，其余各表仍全部由迁移文件创建——这与 `DATABASE_PLAN.md` 第 3 节把该表列在表清单里的写法不同，此处以单一 DDL 权威为准。
2. **checksum 覆盖 `version + name + SQL`，并在计算前把 CRLF 归一成 LF。** 同一份 `.sql` 在 Windows 检出是 CRLF、在 CI 上是 LF；若直接哈希原始字节，Windows 机器上的每一次启动都会判定"迁移被改写"。归一后同名同内容的文件在任何机器上得到同一个校验和。覆盖 name 意味着重命名也会被检出。
3. **每个迁移在各自的事务里执行。** SQLite 的 DDL 是事务性的，所以单个迁移失败时它内部的建表一起回滚，既不会留下半个版本，也不会插入历史行。已应用的版本保持可读。
4. **启动校验不抛字符串，返回 `MigrationPlan`。** `planMigrations` 区分 `ok` 与 `blocked`；被阻塞时带上 `MIGRATION_VERSION_REGRESSION`、`MIGRATION_CHECKSUM_MISMATCH`、`MIGRATION_HISTORY_CORRUPT` 其中之一，调用方据此进入只读诊断并拒绝写入，而不是丢掉原因。`inspectSchema` 是不抛异常的只读版本，供 `/health` 与诊断使用。
5. **迁移定义作为入参传入，目录加载只在开发/CLI 侧。** `applyMigrations(db, migrations, options)` 不读文件系统，便于测试直接构造迁移；`loadMigrationsFromDirectory()` 按 `NNNN_name.sql` 读取磁盘文件作为事实来源。

## 实测证据

执行 `pnpm exec vitest run --config vitest.backend.config.mjs packages/storage/src/migrationRunner.test.ts packages/storage/src/initialSchema.test.ts`，26 个用例全部通过，其中：

- 空库建库：应用 1、2 两个迁移，历史记录带 64 位校验和、毫秒级 UTC 时间与 app 版本。
- 重复运行：第二次 applied 为空，历史逐行不变。
- 逐版升级：先后以 1 个、3 个迁移的定义启动，第二次只应用 2、3，且历史保留各自执行时的 app 版本。
- checksum 改写：手工改坏历史行的校验和后，plan 为 blocked、code 为 `MIGRATION_CHECKSUM_MISMATCH`，再次 apply 抛错且历史行数不变。
- 版本倒退：库在版本 2、应用只定义到 1 时，`inspectSchema` 返回 `read-only` 与 `MIGRATION_VERSION_REGRESSION`。
- 失败回滚：第 2 个迁移里先建 `partial` 表再写非法 SQL，失败后 `partial` 不存在、版本仍停在 1。
- 历史断档：删掉 version 1 的行后判定为 `MIGRATION_HISTORY_CORRUPT`。
- 定义非法：版本重复、版本为 0 均在应用前被拒。
- CRLF/LF 同内容得到相同校验和。
- 0001 落地：加载目录里的真实迁移并应用，9 张表与声明的索引全部存在。

初始 Schema 的约束反例（`initialSchema.test.ts`，13 个用例）覆盖：项目名空白/前后空格/超长/含制表符换行、ID 长度、描述长度；会议来源类型与导入状态枚举、ready 缺文本路径或长度为 0、failed 缺错误码、项目外键；图形类型/方向/状态枚举、ready 但 revision 为 0、失败态缺错误码；revision 号重复与非正、来源枚举、哈希非十六进制或长度不足；source ref 区间倒置与唯一约束；adapter 同 host+scope 重复、未知状态；settings 非法 JSON；幂等键过短；STRICT 表拒绝错误存储类型。

## 未验证项与边界

- **磁盘满未做故障注入测试。** 计划把"磁盘满"列为迁移与落盘的异常项，当前没有可控的注入手段；代码路径上失败会转成 `MIGRATION_APPLY_FAILED` 并回滚，但没有实测证据。
- **迁移文件的打包分发未定。** sidecar 打成 externalBin 后，`packages/storage/migrations/*.sql` 是否随二进制分发、还是在构建期内联成 TS 常量，尚未决定（COM-038）。在此之前桌面壳启动不能依赖运行时读盘。
- **涉及文件系统的迁移不在本包范围内。** `DATABASE_PLAN.md` 第 9 节要求这类迁移用分阶段状态和恢复脚本，属 BE-036；本 runner 只保证 SQLite 事务内的原子性。
- **未实现降级迁移。** 按计划 v0.1 不提供，回滚应用前必须恢复备份。
- 迁移 SQL 不得包含 `BEGIN` / `COMMIT`，否则会与 runner 的事务嵌套冲突；这一约束目前靠约定，未做静态检查。

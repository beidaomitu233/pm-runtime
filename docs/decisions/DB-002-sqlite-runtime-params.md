# ADR: DB-002 SQLite 运行参数

日期：2026-09-22
状态：已实现并测试通过；断电与网络驱动器未验证

`packages/storage/src/runtimeParams.ts` 锁定连接级运行参数，并提供本机可用目录校验。

## 决策

1. **`foreign_keys = ON`。** SQLite 默认关闭外键，schema 里 8 条 `REFERENCES` 在没有它时形同注释。`applyRuntimePragmas` 会读回确认它真的生效，不接受"设置了但没生效"。
2. **`journal_mode = WAL`。** 列表查询不能因为一次导入或渲染写入而阻塞；WAL 允许读与单写并发。该值写在数据库头部，后续连接即使不设置也继承——测试用一条完全不设 pragma 的连接验证过。
3. **`busy_timeout = 5000`。** 写竞争时等待而不是立刻 `SQLITE_BUSY`。
4. **`synchronous = NORMAL`，且只承诺进程崩溃级别。** SQLite 文档的表述是：WAL 下 `synchronous=NORMAL` 的事务"在应用崩溃后仍然持久"，只在**断电或硬复位**时可能回滚最近若干已提交事务。DB-002 的验收标准写的是"崩溃恢复无已提交数据丢失"，按进程异常终止理解，本取值成立并有真实 SIGKILL 实测；若该验收被理解为断电，必须改为 `FULL` 并重新测量写入成本。两种崩溃不混为一谈，也不把未验证的那一种写成已确认。
5. **`wal_autocheckpoint = 1000` 页，关闭时执行 `wal_checkpoint(TRUNCATE)`。** 前者限制 WAL 无限增长，后者让下次启动不必重放大量帧。检查点失败不阻止关闭：WAL 会在下次打开时正常恢复。
6. **`cache_size = -16384`（16 MiB）。** 本机桌面应用的缓存成本可忽略，收益是减少重复读页。
7. **只接受本机绝对可写目录。** 相对路径、UNC 路径、指向文件的路径一律拒绝；目录不存在时创建，创建或写权限失败即报 `DATA_DIR_NOT_WRITABLE`。

## 实测证据

`pnpm exec vitest run --config vitest.backend.config.mjs packages/storage/src/runtimeParams.test.ts`，9 个用例通过：

- 拒绝相对目录、`\\server\share\...`、指向文件的路径与空串。
- 目录树创建与路径推导：`<root>/data/pm.db`、`backups`、`projects`、`.tmp` 与计划第 2 节一致。
- 参数落地：`foreign_keys=1`、`journal_mode=wal`、`busy_timeout=5000`、`synchronous=1`、`wal_autocheckpoint=1000`、`cache_size=-16384`。
- 每连接覆盖 `busyTimeoutMs` 生效。
- 未设置 pragma 的连接读回仍是 `wal`（证明 WAL 持久在库头）。
- **并发**：写者 `BEGIN IMMEDIATE` 持锁时，读者仍读到已提交快照（计数为 1，不含未提交行）；第二个写者在 250ms 超时后拿到 `SQLITE_BUSY` 而不是插进去；写者提交后第二个写者成功。
- **检查点**：400 行写入后 `-wal` 非空，`wal_checkpoint(TRUNCATE)` 后 `-wal` 大小为 0，`integrity_check` 为 `ok`。
- **异常终止（真实子进程 `SIGKILL`）**：已提交的 25 行在重新打开后完整存在且 `integrity_check` 通过；未提交事务（`BEGIN IMMEDIATE` 后写入、未提交即被杀）在重开后不残留任何行。

## 未验证项与边界

- **断电/硬复位未验证。** 需要真实断电或虚拟机强杀，当前只能按进程崩溃给结论。若发布要求覆盖断电，`synchronous` 需要重新决策。
- **映射网络驱动器无法从路径识别。** 只有 UNC 形式能被拒绝，`Z:\...` 这类映射盘会通过校验。SQLite 在 SMB 上的锁不可靠，属于已知风险，未做运行时探测。
- **磁盘满未做故障注入。** 打开、迁移、备份三条路径的磁盘满行为都没有实测。
- 参数值来源于本机 Windows 与 Node 22 环境，未在其他文件系统（如带压缩或加密的卷）上验证。

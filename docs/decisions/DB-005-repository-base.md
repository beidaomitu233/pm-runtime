# ADR: DB-005 Repository 基类

日期：2026-09-22
状态：已实现并测试通过

`packages/storage/src/repository.ts` 与 `packages/storage/src/ids.ts` 提供全部表 repository 的公共基础：事务、时间、ULID、软删除过滤与游标分页。

## 决策

1. **写事务默认 `BEGIN IMMEDIATE`。** WAL 下"先读后写"的 deferred 事务在读完再升级写锁时可能拿到 `SQLITE_BUSY_SNAPSHOT`，而提前取写锁只会变成等待，由 `busy_timeout` 吸收。因此事务默认取写锁；纯读路径不开事务（需要时显式传 `mode: "deferred"`）。
2. **时间统一为 UTC ISO 8601 且固定毫秒精度。** 存储写入一律带 `.SSS`，比 `contracts` 的 `utcIsoDateTimeSchema`（毫秒可选）更严。理由是按文本排序的列如果混入两种精度会排错位置；`isUtcIso` 因此显式拒绝 `...T01:00:00Z`。非法时间抛 `INVALID_TIMESTAMP`，不把 `Invalid Date` 写进库。
3. **ULID 由应用生成且在同一毫秒内单调。** `UlidFactory` 持有时钟与随机数注入点；同一毫秒内创建多个 ID 时对 80 位随机数加一，溢出则借下一个毫秒。时钟回拨时钳制到上一个毫秒而不是发出更小的值——游标按 id 排序，一旦发出更小的 ID 就会导致翻页重复或漏项。测试用固定随机字节（全 0）强制走单调分支，1000 个连续 ID 严格递增且互不相同。
4. **软删除默认排除。** `listKeyset` 在调用方未显式 `includeDeleted` 时追加 `deleted_at IS NULL`。忘记过滤会让归档数据泄漏到普通列表，属于静默错误，所以默认值取"安全的一侧"。归档本身会改写 `updated_at`，因此归档行在不过滤的列表里会排到最前——这是可见性开关的语义，不是冻结行内容。
5. **游标携带排序值与 ID 两项，用 SQLite 行值比较。** `(sort, id) < (:cursorSort, :cursorId)`。只用时间戳作游标时，同一毫秒内的多行会被重复返回或整批跳过；行值比较让相同时间戳回退到 ID 决出顺序。实测 1000 行共用同一时间戳、每页 100 条时，10 页恰好覆盖全部 1000 行，无重复无遗漏。
6. **表名、列名走白名单正则，分页参数名保留。** 这些值无法参数化，只能拼进 SQL，因此限定为 `[A-Za-z_][A-Za-z0-9_]*`（列允许 `a.b` 与 `a.b AS c`）；调用方 params 里出现 `limit`/`cursorSort`/`cursorId` 直接报错，避免悄悄覆盖分页参数。
7. **游标不签名但校验形状。** 它是本地调试可见的 base64url JSON（`{v,s,i}`），解码后逐字段校验，非法即 `INVALID_CURSOR`。它不参与 SQL 拼接，两个值都作为绑定参数传入。

## 实测证据

`pnpm exec vitest run --config vitest.backend.config.mjs packages/storage/src/repository.test.ts packages/storage/src/ids.test.ts`，25 个用例通过。测试直接跑真实 `0001_initial.sql` 迁移后的 `projects` 表，不用外形相似的替身表。

- 时间：`toUtcIso(0)` → `1970-01-01T00:00:00.000Z`；`2026-09-22T09:00:00+08:00` → `2026-09-22T01:00:00.000Z`（与运行时时区无关）；`NaN` 与非日期抛 `INVALID_TIMESTAMP`。
- ULID：26 位、不含 `I/L/O/U`；编码的毫秒可读回；时钟前进、同一毫秒内 1000 个、随机空间溢出借毫秒、时钟回拨四种情况都保持字典序递增。
- 游标：往返一致；空串、非 base64 JSON、版本非 1、排序值为 null、缺 id 全部报 `INVALID_CURSOR`。
- 分页：3 页取完 5 行不重不漏；7 行同一时间戳按 id 降序翻页 4 次取完；1000 行同一时间戳按 100 条翻 10 页覆盖全部；`ASC` 方向可用。
- 软删除：默认列表排除归档行且只返回未删除行；`includeDeleted: true` 返回全部；重复归档返回 0 行受影响；`updatedAtColumn: null` 时不动 `updated_at`。
- 事务：抛错回滚且保留原始错误；成功提交后可读；`deferred` 模式可用。
- 拒绝：`projects; DROP TABLE projects`、`name) --`、`updated_at DESC`、以及 params 里塞 `limit` 全部报 `INVALID_IDENTIFIER`。

## 未验证项与边界

- **并发翻页未测试。** 翻页途中有新行插入时游标语义是"从上次位置继续"，可能看到新行；这是 keyset 分页的正常行为，但没有用例固定，也没有与前端约定。
- **`markDeleted` 的并发竞争未测试。** 两个并发归档同一行的结果（一行受影响、一行 0）在单线程测试里未覆盖。
- **索引使用未验证。** 行值比较能否命中 `idx_projects_updated_active` 属于 DB-014 的 `EXPLAIN QUERY PLAN` 范围，本包只用 1000 行验证了正确性，未验证计划。
- 游标不做过期与失效处理：数据库被恢复成旧备份后，旧游标可能指向不存在的行，行为是"从该位置继续"而不是报错。

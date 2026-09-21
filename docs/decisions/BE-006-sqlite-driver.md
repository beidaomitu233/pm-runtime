# ADR: BE-006 SQLite 驱动技术闸门

日期：2026-09-21  
状态：部分验证，Windows 干净机打包待验证

## 决策

v0.1 选择 `better-sqlite3@11.10.0` 作为候选 SQLite 驱动，目标运行时基线为 Node.js Active LTS。当前开发机使用 Node `20.19.6`，驱动加载的 SQLite 版本为 `3.49.2`。

`packages/storage/src/sqliteGate.ts` 只提供技术闸门和最小能力封装，不实现迁移、业务 repository 或领域 SQL。后续 storage 代码统一复用该驱动版本，并在迁移完成前保持 `foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout=5000` 和 `synchronous=NORMAL` 的启动配置。

## 实测证据

执行：

```text
npm install --no-save --no-package-lock better-sqlite3@11.10.0
npm rebuild better-sqlite3 --build-from-source
npx vitest run --config vitest.backend.config.mjs
```

`packages/storage/src/sqliteGate.test.ts` 已验证：

- 原生模块在当前 Windows Node 20 环境可加载并执行查询。
- WAL 模式实际为 `wal`。
- 外键约束实际生效。
- 事务抛错后写入回滚，已提交行保持不变。
- `backup()` 生成的数据库可重新打开并保留已提交数据。

## 未验证项与边界

- 当前环境没有干净 Windows VM，尚未完成无 Node/开发依赖环境下的 sidecar externalBin 启动、备份和重启恢复验证。
- 当前驱动首次安装未取得预构建绑定，使用 `node-gyp rebuild --release` 成功生成本机绑定；发布打包必须继续确认目标 Windows x64 的预构建或构建链方案。
- 因此 BE-006 不勾选完成，任务状态保留为阻塞；BE-007 及依赖 SQLite 打包闸门的发布任务不能把本记录当作完整 Windows 安装验收证据。

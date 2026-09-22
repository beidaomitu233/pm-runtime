# ADR: BE-008 文件存储

日期：2026-09-22
状态：已实现并测试通过；磁盘满与并发写未做故障注入

## 决策

`packages/storage/src/fileStore.ts` 实现 DB-004 的文件路径契约与受控落盘。

1. **数据库只保存相对路径和哈希，绝对路径是派生值，从不落库。** `FileStore` 持有唯一数据根，任何入口都必须先给出 `/` 分隔的相对路径再被解析。
2. **路径校验采用拒绝式清单而不是净化式改写。** `assertSafeRelativePath` 拒绝反斜杠、控制字符、Windows 非法字符（`< > : " | ? *`）、绝对路径与盘符、空段、`.`、`..`、以点或空格结尾的段、保留设备名（`CON`、`NUL`、`COM1`…）、超长段。Unicode 段放行——中文项目名和中文文件名是预期输入。净化改写会把 `../x` 悄悄变成 `x`，等于把一次攻击变成一次静默的错误写入，这里选择直接报错。
3. **解析后再验证包含关系，并逐级 `lstat` 检查链接。** 路径校验通过不代表安全：数据根里的一个 junction 就能让合法相对路径指向根外。因此 `resolve()` 先确认解析结果仍在数据根内，再对每个已存在的路径分量做 `lstat`（不跟随链接），命中符号链接或 junction 即报 `SYMLINK_ESCAPE`。
4. **写入走临时文件 + 原子 rename。** 先写 `<root>/.tmp/<uuid>.part`，fsync 后 rename 到目标。读者永远看不到半截文件；rename 失败时删除临时文件，目标位置不留残片。临时目录放在数据根内，保证 rename 在同一卷上是原子的。
5. **孤儿清理只扫 `.tmp`。** `cleanupTempFiles(maxAgeMs)` 只处理超过安全等待期的临时文件，不遍历正式项目树，因此即使这里出 bug 也删不到已提交的会议正文或 revision 文件——对应 `DATABASE_PLAN.md` 第 8 节第 5 条。目录和链接一律跳过。
6. **实体路径由构造函数生成，不接受调用方拼串。** `projectRelativePath` / `meetingRelativePath` / `revisionRelativePath` 校验实体 ID 是 26 位 ULID、扩展名在白名单内、revision 号为正整数，输出与 `DATABASE_PLAN.md` 第 2 节一致的布局（`revisions/000001/diagram.drawio`）。

## 实测证据

执行 `pnpm exec vitest run --config vitest.backend.config.mjs packages/storage/src/fileStore.test.ts`，14 个用例全部通过，其中：

- 原子写入：返回相对路径、64 位 SHA-256 与字节数，回读一致，成功后 `.tmp` 为空。
- 哈希正确性：`abc` 得到 `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`。
- 覆盖写入：第二次写入后内容与哈希均为新值。
- 越界拒绝：`../outside.txt`、`projects/../../outside.txt`、`projects/./secret.txt`、`/etc/passwd`、`C:/Windows/win.ini`、`C:\Windows\win.ini`、`projects\p\x.txt`、`projects//p/x.txt`、`projects/p/`、空串、`projects/p/CON`、`projects/p/name.`、`projects/p/<script>` 全部抛 `FileStoreError`。
- Unicode 文件名可写可读。
- **junction 逃逸**：在数据根内创建指向外部的 junction，`lstat` 确认其为链接，写入 `escape/stolen.txt` 被拒，且外部目录中没有生成文件。
- **文件链接**：指向外部文件的符号链接在读取时被拒。
- rename 失败：目标路径已被占为目录时写入失败，`.tmp` 无残留，目标下没有生成文件。
- 读缺失文件报 `READ_FAILED`，不返回空内容。
- `.tmp` 被列为保留路径，不允许通过公开接口写入。
- 孤儿清理：48 小时前的临时文件被删，刚写的不动，已提交的正文仍然存在。
- 路径构造：项目、会议三类文件与 revision 六位目录的输出与计划逐字一致；非法 ID、白名单外扩展名（`.exe`）、revision 0 均被拒。

## 未验证项与边界

- **磁盘满未做故障注入。** 计划把"磁盘满"列为落盘异常项，当前没有可控注入手段；代码上会转成 `WRITE_FAILED` 并清理临时文件，但没有实测证据。
- **同一路径的并发写未测试。** rename 在 Windows 上对已存在的目标会失败，第二个写入者会拿到 `WRITE_FAILED` 而不是静默覆盖；这一行为未用并发用例固定。
- **目录 fsync 在 Windows 上不可用。** `fsyncBestEffort` 吞掉不支持的异常，rename 本身仍是原子的，所以崩溃时最坏情况是"已提交事务 + 文件未落盘"，由 BE-036 的恢复程序依据哈希与状态处理，本包不假装已经持久化。
- **控制字符 NUL 无法可靠进入 TEXT 与文件名**，未在文件层单独测试。
- `.tmp` 的清理时机目前靠调用方触发，尚未接入 daemon 启动流程（BE-036）。

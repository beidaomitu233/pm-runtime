# PM Runtime v0.1 数据与文件设计

依据：源文档 §8、§12、A01/A02/A08/A10。本设计采用 SQLite 管理索引和版本，文件系统保存会议正文、源文件与图形。SQL 参考见 [initial.sql](docs/contracts/initial.sql)，是开发迁移的初始基线，不代表已创建产品数据库。

## 1 公共规则

ID 为服务端生成的 `<实体前缀>_<UUIDv4>`，如 project_、meeting_、diagram_、revision_，不以时间戳充当唯一性保证；DSL 局部节点 ID 另按 schema。所有外键禁止跨项目绑定。时间为 UTC ISO 8601 毫秒字符串，界面本地化；日期查询由调用方给出带时区的起止点，转换成 UTC 半开区间。不使用金额字段。

SQL 字段默认为 NOT NULL；可空字段显式标出。标题/name trim 后 1–200 字符；description 默认空串。ID、时间、路径、hash 不为空；缺省可选输入用省略，数据库无值用 NULL。同名项目和会议允许，ID 区分；重复导入默认形成独立会议，request_id 重试则不重复创建。

文件路径均相对数据根目录，服务端生成，不接受客户端路径；读取前校验归一化路径与真实路径仍在根目录内，拒绝符号链接/重解析点逃逸。数据文件默认 UTF-8；正文只转换 CRLF/CR 为 LF、移除 BOM，不做 Unicode 归一化、不删首尾空白。source hash 为原文件字节 SHA-256，text hash 为规范化正文 UTF-8 字节 SHA-256。

会议创建后正文不可变；新内容创建新 meeting_id，避免来源区间漂移。每图本期绑定一个会议；sourceRefs 只能引用它。多会议聚合不是隐藏的默认能力。

## 2 实体字典

下表“必填”指存储是否允许 NULL；服务端字段由 Runtime 生成。完整约束以 SQL 为准，业务层补充跨表校验。

| 表 | 字段 | 类型 / 必填 / 默认 | 说明 |
| --- | --- | --- | --- |
| projects | id | TEXT / 是 | PK |
| projects | name、description | TEXT / 是 / description='' | 名称、说明 |
| projects | created_at、updated_at | TEXT / 是 | 创建、重命名时间 |
| meetings | id、project_id | TEXT / 是 | PK、FK projects |
| meetings | title、source_type | TEXT / 是 | paste/txt/md/docx |
| meetings | source_path、source_sha256 | TEXT / 否 / NULL | paste 无原始附件 |
| meetings | text_path、text_sha256 | TEXT / 是 | 规范化文本、校验值 |
| meetings | char_count、chunk_count | INTEGER / 是 | Unicode 码点计数，chunk_size 固定 8000 |
| meetings | parser_version | TEXT / 是 | 规范化/解析算法版本 |
| meetings | created_at | TEXT / 是 | 作为“最近导入”排序依据 |
| diagrams | id、project_id、meeting_id | TEXT / 是 | PK，会议归属复合 FK |
| diagrams | type、title | TEXT / 是 | flowchart/swimlane；title 为生成图标题 |
| diagrams | current_revision_id | TEXT / 否 / NULL | 仅创建事务内部可空，正式可见记录必须非空 |
| diagrams | created_at、updated_at | TEXT / 是 | 更新为当前版提交时间 |
| diagram_revisions | id、diagram_id、revision_no | TEXT/TEXT/INTEGER / 是 | PK、FK；(diagram_id,revision_no) UNIQUE，1 起递增 |
| diagram_revisions | representation | TEXT / 是 | dsl 或 xml |
| diagram_revisions | dsl_path | TEXT / 否 / NULL | 只有生成版必须存在 |
| diagram_revisions | drawio_path、manifest_path | TEXT / 是 | XML 及文件哈希清单 |
| diagram_revisions | basis_dsl_revision_id | TEXT / 否 / NULL | 人工版必须指向本图生成版 |
| diagram_revisions | source_mapping_status | TEXT / 是 | aligned 或 requires_review |
| diagram_revisions | created_by | TEXT / 是 | agent、ui；非用户账号 |
| diagram_revisions | created_at | TEXT / 是 | 不修改历史 |
| settings | key、value_json | TEXT / 是 | PK key；仅 active_project_id 等白名单 |
| mutation_receipts | request_id、operation、payload_hash | TEXT / 是 | request_id PK；幂等记录，属于技术表 |
| mutation_receipts | result_json、created_at | TEXT / 是 | 已成功提交的响应；与业务变化同事务 |
| schema_migrations | version、applied_at | INTEGER/TEXT / 是 | 迁移历史；version PK |

索引：meetings(project_id,created_at DESC,id DESC)、diagrams(project_id,updated_at DESC,id DESC)、diagram_revisions(diagram_id,revision_no DESC)。project/meeting 不设名称唯一约束；外键 ON DELETE RESTRICT，因本期未定义删除。

sourceRefs 不拆新表，保存于每个生成版 DSL。没有跨会议检索的需求，不引入泛化知识关系表。settings 不存 token；endpoint 文件由用户私有目录权限保护。导出文件为外部副本，不入库；不形成版本。

## 3 文件布局与权威性

```text
<dataRoot>/
  data/pm.db                  # 运行时还会有 WAL/SHM
  runtime/endpoint.json       # 临时服务发现；非备份资料
  projects/<project_id>/
    meetings/<meeting_id>/
      source.docx|txt|md      # 粘贴时没有
      transcript.txt
      metadata.json          # ID、解析版本、hash、字符数
    diagrams/<diagram_id>/
      revisions/<revision_id>/
        diagram.json         # 仅 representation=dsl
        diagram.drawio
        manifest.json        # 文件名、SHA256、版本和来源关系
  staging/<request_id>/       # 尚未提交，不对外列出
  failures/<request_id>/      # 合法 DSL 渲染失败的恢复材料
  logs/
```

数据库是元数据与“当前版本”的权威，revision 目录是图形内容的权威。不在图形根目录维护可变的 diagram.json/diagram.drawio 副本，以免两套文件不同步。原方案目录是示意，本设计用不可变目录替代顶层最新文件；接口解析 current_revision_id 返回实际路径。project.json 如以后导出备份时需要可从 DB 生成，本期不双写为第二权威。

## 4 写入协议与中断恢复

同一 Runtime 串行提交写操作，渲染计算可在事务外进行。步骤如下。

1. 校验 token、参数、项目归属和 request_id。相同 request_id 已成功且 payload_hash 一致则返回原结果；不一致报 idempotency_conflict。request_id 为 UUID，payload hash 为规范化 JSON（递归排序键、保留数组顺序）SHA-256，不含 request_id。
2. 解析/布局完成后在同盘 staging 写全部文件，关闭句柄、flush/fsync，计算 manifest；失败不创建业务记录。
3. 把完整 staging 目录原子 rename 到预生成的目标 ID 目录，不覆盖已有目录。
4. BEGIN IMMEDIATE；再次检查 mutation_receipts（另一请求可能在布局期间已完成），命中同 payload 时返回原结果；否则重查 base_revision 与项目归属，插入/更新业务行及 mutation_receipts；COMMIT。成功才通知 UI。busy_timeout 建议 5 秒；提交短事务不包含解析/布局或等待画布。重复请求多生成的未引用目录按孤儿处理。
5. DB 失败时，新目录成为不可见孤儿；记录诊断，不让列表返回它。启动恢复检查 staging、失败目录与无 DB 引用目录，隔离到 recovery 供诊断，不自动把孤儿当正式版本。清理保留期未定，首期不自动删除用户资料。

文件已经完成但 DB 未提交的崩溃只产生孤儿；DB 已提交且回复丢失时相同 request_id 返回原结果。多请求基于同一旧版并发保存时，最多一个提交，其他 version_conflict；失败生成的目录仍不可见。磁盘满、拒绝访问、rename 被占用应保留输入并明确报 persistence_error，禁止先返回成功后异步落盘。

启动执行 SQLite quick_check、外键检查并验证当前版本文件存在/哈希。损坏时不得建空库覆盖旧库；提供错误和数据目录，进入不可写诊断状态。原子 rename 仅用于同磁盘同文件系统；不宣称可以抵抗所有硬件断电，需在目标 Windows 文件系统做强制结束进程测试。

## 5 状态规则

没有审批或工作流状态机。会议只有已成功创建记录；导入中/失败是 UI 瞬时状态。图形也只有已完成的正式版本；渲染失败不成为可编辑的“成功图”。

版本转换：无图 → dsl v1；dsl vn → dsl vn+1（Agent 新 DSL）；dsl/xml vn → xml vn+1（UI 保存）；xml vn → dsl vn+1 禁止，返回 manual_edit_conflict。用户可另行 render 创建新图。所有修改带 base_revision，历史版不可原地修改。导出是读操作，不改变这些状态。

## 6 Migration 与验证

正式实现将 [initial.sql](docs/contracts/initial.sql) 作为第一份迁移，按整数升序、单事务执行并写 schema_migrations；已执行文件不能修改。每次打开连接启用 foreign_keys、WAL、synchronous=FULL；迁移前关闭所有写入并创建可恢复备份。升级失败回滚事务并拒绝以未知 schema 运行，不自动降级数据。

必须验证：约束拒绝非法 representation 和跨项目会议；两次相同请求不增记录；并发保存只产生一个当前版；5 万字读取 hash 相同；强杀进程后已确认保存仍可读；文件/数据库任一步故障都没有“成功但缺文件”的记录。具体入口与证据见 TASK-002、007、010。

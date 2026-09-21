# PM Runtime MVP v0.1 数据库计划

版本：v0.1
数据库：SQLite，本机单库
文件存储：SQLite 保存元数据、状态、相对路径和哈希；会议原文、规范文本、DSL、draw.io、SVG、PNG 保存到项目数据目录

## 1 数据原则

1. Runtime daemon 是唯一数据库写入者；Desktop 和 MCP bridge 不直接连接数据库。
2. 启动时执行 `PRAGMA foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout` 和明确的 `synchronous` 配置；具体值在 DB-002 基准后锁定。
3. 所有表使用 `STRICT`（驱动和目标 SQLite 版本验证通过后启用）并通过 `CHECK` 固定枚举。
4. 主键使用应用生成的 ULID `TEXT`；时间使用 UTC ISO 8601 `TEXT`，格式统一到毫秒。
5. 文件路径只保存相对数据根目录的 `/` 分隔路径；禁止保存用户可控绝对路径。
6. revision 不可变。任何编辑均新增 `diagram_revisions`，不得覆盖旧 revision 文件或行。
7. v0.1 的项目、会议和图形采用软删除字段 `deleted_at`；revision 和 source ref 不单独软删除，随父级不可见。
8. 迁移只能向前执行；已发布迁移禁止修改，修复用新迁移。

## 2 数据目录

```text
PMRuntime/
  data/
    pm.db
    runtime-state.json        # 不入库，当前用户权限
  projects/
    <project_id>/
      project.json
      meetings/
        <meeting_id>/
          source.<ext>
          transcript.md
          metadata.json
      diagrams/
        <diagram_id>/
          revisions/
            000001/
              diagram.json
              diagram.drawio
              diagram.svg     # 按需生成
              diagram.png     # 按需生成
  logs/
```

目录和数据库提交采用临时目录与原子重命名。任何路径变更必须同步更新数据库事务；恢复程序依据哈希和状态处理孤儿文件。

## 3 表清单与使用关系

| 表 | 用途 | 使用 API/MCP | 使用页面 |
|---|---|---|---|
| `schema_migrations` | 迁移版本、名称、校验和 | health | 启动页、诊断 |
| `projects` | 项目基础信息 | project list/get/create/update | Projects、全局项目切换 |
| `meetings` | 会议元数据、解析状态、文件路径 | meeting list/get/import/content | Meetings、Meeting Detail |
| `diagrams` | 图形主记录、状态和当前 revision | diagram list/render/get | Diagrams、Diagram Detail |
| `diagram_revisions` | 不可变 DSL/XML/导出文件版本 | diagram get/save/export | Detail、Editor、Revision Drawer |
| `diagram_source_refs` | 节点到会议文本范围的来源映射 | diagram get/render | Diagram Detail 来源追溯 |
| `agent_adapters` | 宿主配置与最近检测状态 | connections preview/install/restore | Connections Settings |
| `settings` | 非敏感应用设置 | settings get/update | Data Settings |
| `idempotency_records` | 写请求幂等结果 | project/meeting/render/save/export | 无直接页面 |

FTS5 不列入 v0.1 必须表。后续确认 keyword 检索时以新迁移增加虚表，不改变 `meetings` 主表语义。

## 4 表结构

### 4.1 schema_migrations

用途：保证迁移顺序与内容未被静默改写。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `version` | INTEGER | 是 | 无 | 主键，正整数，单调递增 |
| `name` | TEXT | 是 | 无 | 1-120 字符 |
| `checksum_sha256` | TEXT | 是 | 无 | 64 位小写十六进制 |
| `applied_at` | TEXT | 是 | 应用写入 | UTC ISO 8601 |
| `app_version` | TEXT | 是 | 无 | 执行迁移的 sidecar 版本 |

索引与唯一约束：主键 `version`；`checksum_sha256` 不要求全局唯一。
外键：无。
删除：永不删除。
使用：`GET /health`、migration runner。

### 4.2 projects

用途：保存本地项目容器；会议和图形必须归属项目。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `id` | TEXT | 是 | 应用生成 | 主键，ULID，26 字符 |
| `name` | TEXT | 是 | 无 | trim 后 1-80 字符，禁控制字符 |
| `description` | TEXT | 否 | NULL | 最多 2000 字符 |
| `created_at` | TEXT | 是 | 应用写入 | UTC ISO 8601 |
| `updated_at` | TEXT | 是 | 应用写入 | 每次变更更新 |
| `deleted_at` | TEXT | 否 | NULL | 软删除时间 |

索引：`idx_projects_updated_active(updated_at DESC, id DESC) WHERE deleted_at IS NULL`；`idx_projects_name_active(name COLLATE NOCASE) WHERE deleted_at IS NULL`。
唯一约束：项目名允许重复，避免擅自规定业务唯一；UI 用 ID 区分。
外键：无。
状态：`deleted_at IS NULL` 为 active，否则 deleted。
使用：project API/MCP、Projects 页面、项目切换器。

### 4.3 meetings

用途：保存会议导入状态、来源元数据、规范文本位置和完整性哈希。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `id` | TEXT | 是 | 应用生成 | 主键 ULID |
| `project_id` | TEXT | 是 | 无 | FK projects.id |
| `title` | TEXT | 是 | 无 | 1-120 字符 |
| `source_type` | TEXT | 是 | 无 | `paste`、`txt`、`md`、`docx` |
| `original_filename` | TEXT | 否 | NULL | 仅文件导入；只保存文件名，不保存用户源路径 |
| `source_rel_path` | TEXT | 否 | NULL | 粘贴可为 NULL 或保存生成的 source.txt，方案在 DB-004 固定 |
| `text_rel_path` | TEXT | 否 | NULL | ready 时必填；规范 UTF-8 文本 |
| `text_sha256` | TEXT | 否 | NULL | ready 时 64 位十六进制 |
| `char_count` | INTEGER | 是 | 0 | `>=0`；ready 时大于 0 |
| `byte_count` | INTEGER | 是 | 0 | 原文件字节数，`>=0` |
| `import_status` | TEXT | 是 | `importing` | `importing`、`ready`、`failed` |
| `import_error_code` | TEXT | 否 | NULL | 失败时稳定错误码 |
| `import_error_message` | TEXT | 否 | NULL | 去敏用户文案，最多 1000 字符 |
| `created_at` | TEXT | 是 | 应用写入 | UTC |
| `updated_at` | TEXT | 是 | 应用写入 | UTC |
| `deleted_at` | TEXT | 否 | NULL | 软删除 |

表级检查：ready 必须存在 `text_rel_path`、`text_sha256` 且 `char_count>0`；failed 必须有 `import_error_code`。
索引：

- `idx_meetings_project_created(project_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`
- `idx_meetings_project_status(project_id, import_status, created_at DESC) WHERE deleted_at IS NULL`
- `idx_meetings_project_source(project_id, source_type, created_at DESC) WHERE deleted_at IS NULL`
- 可选 `idx_meetings_text_hash(project_id, text_sha256)` 用于提示重复导入，不自动去重

外键：`project_id REFERENCES projects(id) ON UPDATE RESTRICT ON DELETE RESTRICT`。
删除：软删除；被 diagram/source ref 引用时仍保留文件，清理规则见第 8 节。
使用：meeting API/MCP、Meetings 页面、来源追溯。

### 4.4 diagrams

用途：保存图形身份、生成状态和当前 revision 指针。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `id` | TEXT | 是 | 应用生成 | 主键 ULID |
| `project_id` | TEXT | 是 | 无 | FK projects.id |
| `meeting_id` | TEXT | 否 | NULL | v0.1 可关联一个主来源会议；必须同 project |
| `diagram_type` | TEXT | 是 | 无 | `flowchart`、`swimlane` |
| `title` | TEXT | 是 | 无 | 1-120 字符 |
| `orientation` | TEXT | 是 | 无 | `horizontal`、`vertical` |
| `status` | TEXT | 是 | `validating` | `validating`、`rendering`、`ready`、`validation_failed`、`render_failed` |
| `current_revision_no` | INTEGER | 是 | 0 | `>=0`；ready 时 `>=1` |
| `last_error_code` | TEXT | 否 | NULL | 最近生成错误码 |
| `last_error_message` | TEXT | 否 | NULL | 去敏文案 |
| `created_at` | TEXT | 是 | 应用写入 | UTC |
| `updated_at` | TEXT | 是 | 应用写入 | UTC |
| `deleted_at` | TEXT | 否 | NULL | 软删除 |

表级检查：ready 时 current_revision_no >= 1；失败状态必须有 last_error_code。
索引：

- `idx_diagrams_project_updated(project_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL`
- `idx_diagrams_project_type(project_id, diagram_type, updated_at DESC) WHERE deleted_at IS NULL`
- `idx_diagrams_meeting(meeting_id, updated_at DESC) WHERE deleted_at IS NULL`
- `idx_diagrams_status(status, updated_at)` 用于恢复 pending/failed

外键：project `RESTRICT`；meeting `SET NULL` 只在未来硬清理时使用，v0.1 service 层禁止跨项目。
使用：diagram API/MCP、Diagrams 页面。

### 4.5 diagram_revisions

用途：保存每次 Agent 渲染或人工编辑的不可变版本。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `id` | TEXT | 是 | 应用生成 | 主键 ULID |
| `diagram_id` | TEXT | 是 | 无 | FK diagrams.id |
| `revision_no` | INTEGER | 是 | 无 | 从 1 递增 |
| `base_revision_no` | INTEGER | 否 | NULL | revision 1 为 NULL；后续指向保存时基础版本号 |
| `source` | TEXT | 是 | 无 | `agent_render`、`editor_save`、`history_fork` |
| `dsl_schema_version` | TEXT | 是 | `0.1` | 当前固定 0.1 |
| `dsl_rel_path` | TEXT | 否 | NULL | 人工编辑后无法同步 DSL 时允许 NULL，但需在 Communication 确认策略 |
| `drawio_rel_path` | TEXT | 是 | 无 | 必填可编辑源文件 |
| `svg_rel_path` | TEXT | 否 | NULL | 导出后填充；若坚持 revision 完全不可变，改由 artifact 表，见 Q-DB-003 |
| `png_rel_path` | TEXT | 否 | NULL | 同上 |
| `content_sha256` | TEXT | 是 | 无 | 规范 drawio XML 哈希 |
| `renderer_version` | TEXT | 是 | 无 | 生成/保存适配器版本 |
| `change_note` | TEXT | 否 | NULL | 最多 300 字符 |
| `created_at` | TEXT | 是 | 应用写入 | UTC；无 updated_at，体现不可变 |

唯一约束：`UNIQUE(diagram_id, revision_no)`。
索引：`idx_revisions_diagram_created(diagram_id, revision_no DESC)`；`idx_revisions_hash(diagram_id, content_sha256)`。
外键：`diagram_id REFERENCES diagrams(id) ON DELETE RESTRICT`。
更新规则：除导出路径待决策外，禁止 UPDATE；新内容 INSERT 新 revision，并在同一事务更新 diagrams.current_revision_no。
使用：revision API/MCP、Editor、版本历史、导出。

### 4.6 diagram_source_refs

用途：保存 revision 内节点与会议规范文本片段的可追溯关系。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `id` | TEXT | 是 | 应用生成 | 主键 ULID |
| `revision_id` | TEXT | 是 | 无 | FK diagram_revisions.id |
| `meeting_id` | TEXT | 是 | 无 | FK meetings.id |
| `node_id` | TEXT | 是 | 无 | 1-64 字符，与 DSL node ID 一致 |
| `locator_type` | TEXT | 是 | `char_range` | v0.1 仅 `char_range` |
| `start_offset` | INTEGER | 是 | 无 | `>=0` |
| `end_offset` | INTEGER | 是 | 无 | `> start_offset`，不得超过 char_count |
| `quote_text` | TEXT | 否 | NULL | 最多 500 字符，便于人工核对；日志禁止输出 |
| `created_at` | TEXT | 是 | 应用写入 | UTC |

唯一约束：`UNIQUE(revision_id, node_id, meeting_id, start_offset, end_offset)`。
索引：`idx_source_refs_revision_node(revision_id, node_id)`；`idx_source_refs_meeting(meeting_id, start_offset)`。
外键：revision、meeting 均 `ON DELETE RESTRICT`。
业务约束：service 校验 meeting 与 diagram 属于同一 project；SQLite CHECK 无法跨表完成。
使用：diagram detail、MCP diagram.get、追溯验收。

### 4.7 agent_adapters

用途：记录宿主 Adapter 的安装和检测元数据，不保存令牌。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `id` | TEXT | 是 | 应用生成 | 主键 ULID |
| `host_type` | TEXT | 是 | 无 | `codex`、`claude_code`、`dsh`；实现范围受 Q-001 控制 |
| `scope` | TEXT | 是 | `user` | `user`、`project` |
| `config_path_masked` | TEXT | 否 | NULL | UI 展示去敏路径，不保存敏感值 |
| `config_fingerprint` | TEXT | 否 | NULL | 最近检测配置哈希 |
| `status` | TEXT | 是 | `not_installed` | `not_installed`、`installed`、`connected`、`error` |
| `adapter_version` | TEXT | 是 | 无 | Runtime adapter 版本 |
| `last_checked_at` | TEXT | 否 | NULL | UTC |
| `last_error_code` | TEXT | 否 | NULL | 稳定错误码 |
| `last_error_message` | TEXT | 否 | NULL | 去敏文案 |
| `created_at` | TEXT | 是 | 应用写入 | UTC |
| `updated_at` | TEXT | 是 | 应用写入 | UTC |

唯一约束：`UNIQUE(host_type, scope)`。
索引：`idx_agent_adapters_status(status, last_checked_at)`。
外键：无。
备份文件：保存在受控 backups 目录，数据库不保存原配置内容，只保存 backup ID/相对路径的方案需在 DB-008 确认。
使用：connections API、Connections 页面。

### 4.8 settings

用途：保存非敏感设置；未知 key 由 service 拒绝。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `key` | TEXT | 是 | 无 | 主键，1-100 字符 |
| `value_json` | TEXT | 是 | 无 | 合法 JSON，按 key Schema 校验 |
| `updated_at` | TEXT | 是 | 应用写入 | UTC |

允许 key 初始清单：`ui.locale`、`logs.retention_days`、`logs.max_total_mb`、`meeting.max_file_bytes`、`meeting.max_chars`、`meeting.default_chunk_chars`、`diagram.default_orientation`。
禁止保存：session token、模型/API key、宿主认证信息。
索引：主键。
使用：settings API、Data Settings、Runtime 配置。

### 4.9 idempotency_records

用途：防止 Desktop 或 MCP 重试造成重复创建。

| 字段 | 类型 | 必填 | 默认值 | 约束/说明 |
|---|---|---:|---|---|
| `key` | TEXT | 是 | 无 | 主键；客户端生成 16-100 字符 |
| `operation` | TEXT | 是 | 无 | 允许的写操作名 |
| `request_hash` | TEXT | 是 | 无 | 规范请求 SHA-256 |
| `response_json` | TEXT | 是 | 无 | 去除敏感正文后的成功响应 |
| `entity_id` | TEXT | 否 | NULL | 创建结果 ID |
| `created_at` | TEXT | 是 | 应用写入 | UTC |
| `expires_at` | TEXT | 是 | 应用写入 | 默认 24 小时，按操作可延长 |

索引：`idx_idempotency_expires(expires_at)`。
唯一约束：主键 key；相同 key 但 request_hash 不同返回冲突。
删除：过期后批量清理，不影响业务实体。
使用：所有 POST 创建/保存/导出接口。

## 5 状态枚举汇总

| 表.字段 | 枚举 | 允许流转 |
|---|---|---|
| meetings.import_status | importing、ready、failed | importing -> ready/failed |
| diagrams.status | validating、rendering、ready、validation_failed、render_failed | validating -> rendering/validation_failed；rendering -> ready/render_failed |
| diagram_revisions.source | agent_render、editor_save、history_fork | 不流转，不可变 |
| agent_adapters.status | not_installed、installed、connected、error | 检测和安装服务更新；connected 仅表示最近一次探测结果 |

枚举新增需新迁移和 contracts 变更。数据库 CHECK、后端 Schema 和前端判别联合必须在同一任务包更新。

## 6 索引与查询验证

- 所有列表使用 `(parent_id, sort_column DESC, id DESC)` cursor；禁止用大 offset 作为主分页方式。
- 每个 repository 查询在测试中执行 `EXPLAIN QUERY PLAN`，确认常用路径使用计划索引。
- 项目名称和会议标题的模糊搜索在 v0.1 数据量下允许受控 `LIKE`；达到性能阈值后再引入 FTS5。
- 不为低基数字段单独建立无父级前缀索引，避免写放大。

## 7 时间与审计规则

- `created_at` 插入后不修改。
- 带 `updated_at` 的表每次业务字段更新时由 repository 同一语句更新。
- revision 无 `updated_at`，内容变更必须新增行。
- 软删除只更新 `deleted_at` 和 `updated_at`，不修改名称、路径或历史引用。
- v0.1 不建设通用审计日志表；重要事实由 revision、adapter backup 和结构化本地日志记录。

## 8 软删除和文件清理

1. 项目软删除后，其会议和图形在普通查询中不可见，但行与文件不立即删除。
2. meeting 软删除前检查是否被 diagram 或 source ref 引用；有引用时只能归档隐藏。
3. diagram 软删除保留全部 revision。
4. 真正硬删除属于受控维护操作，必须先生成影响清单和备份，v0.1 UI 默认不开放。
5. 临时文件与 orphan 清理只处理不在任何正式相对路径中、超过安全等待期且通过哈希/状态验证的对象。

## 9 迁移策略

- 文件命名：`0001_initial.sql`、`0002_xxx.sql`；每个文件含目的、前置版本和不可逆说明。
- migration runner 在事务中执行 SQL；涉及文件系统迁移时使用分阶段状态和恢复脚本，不能假装同一 SQLite 事务覆盖文件操作。
- 应用启动时发现 DB schema 高于当前应用版本，进入只读诊断并拒绝写入。
- 每次发布前备份数据库并通过 SQLite backup API 生成一致副本；WAL 使用中不得只复制 `pm.db` 单文件。
- 测试至少覆盖：空库建立、从每个已发布版本逐级升级、失败回滚、重复运行、checksum 被改写、磁盘满。
- v0.1 不提供自动降级 migration。回滚应用前必须确认数据库兼容或恢复备份。

## 10 数据库任务包

### DP1 基础与迁移 6 项

- [ ] 任务编号：DB-001
  模块：迁移框架
  目标：实现 `schema_migrations`、版本顺序、checksum 和事务。
  使用位置：daemon 启动；输入 migration 文件，输出目标 schema。
  依赖接口：`GET /health`。
  异常：文件被改写、版本倒退、SQL 失败。
  验收标准：空库和逐版升级可重复；失败不留下半个版本。
  测试要求：空库、重复运行、checksum、失败回滚。

- [ ] 任务编号：DB-002
  模块：SQLite 运行参数
  目标：锁定 foreign_keys、WAL、busy_timeout、synchronous 和 checkpoint 策略。
  使用位置：storage 初始化；输入目标 Windows 设备，输出 ADR 与配置。
  依赖接口：health diagnostics。
  异常：网络目录、只读目录、WAL 残留。
  验收标准：仅允许本机可写目录；崩溃恢复无已提交数据丢失。
  测试要求：并发读/单写、异常终止、backup 一致性。

- [ ] 任务编号：DB-003
  模块：初始 Schema
  目标：创建第 3 节全部表、CHECK、FK 和基础索引。
  使用位置：首次启动。
  输入/输出：0001 migration；输出可用 schema。
  依赖：BE-002 contracts。
  异常：SQLite/驱动不支持 STRICT 时必须有明确技术结论。
  验收标准：约束能拒绝非法枚举、孤立 FK 和重复 revision。
  测试要求：每个约束至少一个反例。

- [ ] 任务编号：DB-004
  模块：文件路径契约
  目标：确定 paste source、规范文本和 revision 文件的相对路径生成规则。
  使用位置：meeting/diagram storage。
  输入：entity ID、扩展名；输出规范相对路径。
  依赖表：meetings、revisions。
  异常：路径穿越、非法扩展、大小写冲突。
  验收标准：相同实体路径稳定且不能逃逸数据根。
  测试要求：Windows junction、`..`、绝对路径、Unicode 文件名。

- [ ] 任务编号：DB-005
  模块：Repository 基类
  目标：统一事务、时间、ULID、软删除过滤和 cursor。
  使用位置：全部 service。
  输入：typed query；输出 typed entity。
  依赖：contracts。
  异常：忘记 active filter、cursor 非法。
  验收标准：普通查询默认排除 deleted；审查可显式包含。
  测试要求：时区、排序稳定、同时间戳 cursor。

- [ ] 任务编号：DB-006
  模块：备份恢复基线
  目标：使用 SQLite backup API 生成一致备份并验证可打开。
  使用位置：迁移前、宿主配置外的数据库维护。
  输入：数据库；输出 backup ID/hash。
  异常：WAL 活跃、磁盘满、备份损坏。
  验收标准：恢复副本通过 integrity_check 且实体数一致。
  测试要求：写入期间备份、损坏检测、恢复演练。

### DP2 领域表与一致性 7 项

- [ ] 任务编号：DB-007
  模块：Projects repository
  目标：实现项目创建、查询、重命名和软删除。
  使用位置：Projects/API/MCP。
  输入/输出：project DTO。
  依赖表：projects。
  异常：并发更新、重复名称允许。
  验收标准：1000 条 cursor 顺序稳定。
  测试要求：CRUD、软删除、索引计划。

- [ ] 任务编号：DB-008
  模块：Meetings repository
  目标：实现 importing->ready/failed 原子状态与文件元数据。
  使用位置：导入和读取。
  输入：解析结果；输出 meeting。
  依赖表：meetings、projects。
  异常：ready 缺文件、跨项目、重复哈希。
  验收标准：CHECK 和 service 双重保证 ready 完整。
  测试要求：状态流转、FK、列表索引、失败记录。

- [ ] 任务编号：DB-009
  模块：Diagrams repository
  目标：实现生成状态、当前 revision 和来源 meeting 约束。
  使用位置：render/list/get。
  输入：diagram metadata；输出 diagram。
  依赖表：diagrams、projects、meetings。
  异常：meeting 跨项目、ready revision=0。
  验收标准：非法组合不能进入 ready。
  测试要求：状态、FK、跨项目 service 约束。

- [ ] 任务编号：DB-010
  模块：Revision repository
  目标：事务内分配连续 revision、插入行并推进 current。
  使用位置：render/save。
  输入：baseRevisionNo、paths/hash；输出 revision。
  依赖表：diagram_revisions、diagrams。
  异常：并发、重复 hash、409。
  验收标准：两个并发写只有一个基于旧版本成功；旧行不变。
  测试要求：并发集成、唯一约束、回滚。

- [ ] 任务编号：DB-011
  模块：Source refs
  目标：批量保存并读取节点来源范围。
  使用位置：render/detail。
  输入：validated refs；输出 refs。
  依赖表：diagram_source_refs、meetings、revisions。
  异常：offset 越界、跨项目、重复。
  验收标准：revision 与 refs 同事务提交。
  测试要求：中文 offset、唯一约束、批量回滚。

- [ ] 任务编号：DB-012
  模块：Adapters Settings Idempotency
  目标：实现三张辅助表的受控 repository 和过期清理。
  使用位置：connections/settings/所有写接口。
  输入/输出：adapter、setting、idempotency record。
  异常：未知 setting key、同 key 不同请求、过期记录。
  验收标准：敏感 key 无法保存；重复写返回原结果。
  测试要求：白名单、冲突、TTL 清理。

- [ ] 任务编号：DB-013
  模块：导出元数据决策
  目标：确定 SVG/PNG 路径是否更新 revision，或新增 `revision_artifacts` 表。
  使用位置：Export service。
  输入：Q-DB-003 结论；输出 migration/ADR。
  异常：不可变 revision 与延迟导出冲突。
  验收标准：选择后接口、Schema 和清理策略一致；不得一半写列一半写新表。
  测试要求：重复导出、失败重试、缓存命中。

### DP3 质量恢复与发布 5 项

- [ ] 任务编号：DB-014
  模块：查询计划
  目标：验证项目、会议、图形、revision 常用查询使用索引。
  使用位置：性能验收。
  输入：1000 meetings/diagrams fixture；输出 EXPLAIN 记录。
  异常：LIKE 全表扫描只允许在已记录数据量边界内。
  验收标准：核心列表无临时全表排序。
  测试要求：CI 检查代表性 query plan。

- [ ] 任务编号：DB-015
  模块：Integrity audit
  目标：检查 FK、integrity、文件存在、哈希和 current revision。
  使用位置：diagnostics/发布检查。
  输入：DB+data dir；输出去敏报告。
  异常：文件缺失、孤儿目录、哈希不符。
  验收标准：只报告不自动删除正式数据。
  测试要求：人为制造各类不一致 fixture。

- [ ] 任务编号：DB-016
  模块：Crash recovery
  目标：恢复 importing/rendering 状态和孤儿临时目录。
  使用位置：daemon 启动。
  输入：状态与文件；输出恢复动作。
  异常：无法判断归属时隔离并报告。
  验收标准：恢复幂等，不误删已提交文件。
  测试要求：每个原子提交阶段中断。

- [ ] 任务编号：DB-017
  模块：迁移回归
  目标：建立每个已发布 schema 到最新版本的升级矩阵。
  使用位置：CI/release。
  输入：旧库 fixtures；输出升级库。
  异常：高版本库、checksum 不符、磁盘满。
  验收标准：失败进入只读诊断，不继续业务写入。
  测试要求：升级矩阵和恢复备份。

- [ ] 任务编号：DB-018
  模块：数据发布验收
  目标：完成空装、升级、备份、恢复、软删除和 5 万字一致性检查。
  使用位置：v0.1 RC。
  输入：发布候选；输出验收报告。
  异常：任何数据丢失或旧 revision 变化均阻塞发布。
  验收标准：A01、A02、A08、A10 具备数据库证据。
  测试要求：干净 Windows 安装与异常退出实测。

## 11 待确认数据库问题

| 编号 | 问题 | 当前假设 | 需在何时确认 |
|---|---|---|---|
| Q-DB-001 | 粘贴文本是否保存独立 source.txt | 保存 source.txt 与 transcript.md，便于一致追溯 | DB-004 前 |
| Q-DB-002 | 项目/会议/图形是否开放硬删除 | v0.1 只软删除/归档，不开放通用硬删除 | UI 删除任务前 |
| Q-DB-003 | 延迟导出是否破坏 revision 不可变 | 推荐新增 `revision_artifacts` 表，不更新 revision 行 | DB-013 前 |
| Q-DB-004 | 人工编辑 drawio 后 DSL 如何同步 | v0.1 允许该 revision 的 dsl 指向上个语义版本并标记 stale，或允许 NULL；需产品确认 | FE/BE 保存 revision 前 |
| Q-DB-005 | 是否需要数据库加密 | 默认不加密，依赖 OS 用户权限 | 发布安全评审前 |
| Q-DB-006 | GBK TXT 是否支持 | 默认仅 UTF-8/UTF-8 BOM；其他编码明确提示 | parser 实现前 |

## 12 数据库提交检查清单

- [ ] 每个 migration 有新版本、目的、checksum 和测试，未修改已发布 migration。
- [ ] FK、CHECK、唯一约束和索引与 contracts 同步。
- [ ] 空库建立、旧库升级、失败回滚、备份恢复均通过。
- [ ] 文件和 DB 的原子提交/恢复路径有故障注入测试。
- [ ] 查询计划和数据量基准符合 `PROJECT_DOCUMENT.md`。
- [ ] 待确认或冲突已记录 `COMMUNICATION.md`。
- [ ] 数据库变更在 `feature/database-模块名` 分支提交。

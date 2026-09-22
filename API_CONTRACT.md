# PM Runtime v0.1 接口与 DSL 契约

本文件约定本地 IPC/RPC 和七个 MCP 工具。没有面向公网的 API。开发时把字段落实到共享 schema，UI、Runtime、bridge 使用同一份，禁止各自扩展同名字段。产品来源为源文档 §6–7、§12–14。

## 1 传输和通用格式

UI 调用 `window.pm.<operation>(params)`，preload 验证后交 main。main/bridge 请求 `POST http://127.0.0.1:<port>/internal/rpc`，`Authorization: Bearer <token>`、`Content-Type: application/json`，body 为 `{protocol_version:"0.1",operation,params}`。这不是对外 MCP HTTP endpoint；宿主端只用 SDK stdio。stdout 只能输出 MCP 协议，日志与 Node 警告走 stderr。

内部 HTTP 成功 200；结构化失败按参数 400、未认证 401、方法越权 403、不存在 404、冲突 409、容量 413、服务忙 503、超时 504、内部失败 500。跨项目错误 409。未识别 operation 返回 404 unsupported_operation。MCP 正常工具业务失败返回 `isError:true`，content 为同一 JSON 的文字形式，若 SDK 支持同时给 structuredContent；未知工具/不合法协议由 SDK 按 MCP 错误处理，不把 Runtime HTTP 状态当 MCP 协议码。

```json
{"ok":true,"data":{},"warnings":[],"request_id":"请求关联标识"}
```

```json
{"ok":false,"error":{"code":"validation_error","message":"判断分支不足","retryable":false,"details":[{"code":"decision_branches","path":"/nodes/3","node_id":"n4","message":"至少两条带标签出边"}]},"request_id":"请求关联标识"}
```

修改请求必须由调用方提供 request_id UUID；重试保持同值和同 payload。只读请求可省略，由服务端生成日志关联 ID。相同键不同 payload 拒绝；成功幂等结果持久化，失败不占成功回执。SDK 无法解析 JSON 时尚未产生业务调用，不能创建记录。所有错误都要有稳定 code，不以中文 message 作分支判断。

列表响应 `{items,next_cursor}`，cursor 为不透明 base64url 游标，包含筛选哈希和最后一项排序键。limit 默认 20、1–100；非法或不匹配游标报 invalid_cursor。默认新→旧，时间相同用 ID 倒序；项目列表按 created_at，会议按 created_at，图形按 updated_at。无通用搜索/任意排序，日期过滤仅 meetings，起点包含终点不包含。next_cursor=null 表示结束。

所有 ID 是字符串。时间输入为有时区的 ISO 8601，输出 UTC 毫秒格式。可选请求字段省略，不用空字符串；返回可空值统一 null。正文字符串按 Unicode 码点计长度，不能用 JS string.length 作为中文/emoji 范围坐标。边界工程默认值：文本最多 1,000,000 码点、原文件 20 MiB、DOCX 解压 100 MiB、XML 10 MiB、DSL 500 节点/2000 边/50 泳道；本地 RPC body 32 MiB，导出数据 64 MiB、PNG 最大 1600 万像素。超限显式 too_large，不截断。这些上限是防失控设计，质量验收目标仍为 10–30 节点，不能宣称上限规模已验证。

## 2 七个 MCP 工具

工具名保留原文点号形式；若所选宿主版本不能接受，由适配器提供下划线别名并在 host manifest 中记录一对一映射，不能改变业务含义。输入除下列字段均拒绝。project_id 需调用方明确选定。

| 工具 | 输入 params | data 输出 | 关键错误 |
| --- | --- | --- | --- |
| pm.project.list | limit?、cursor? | items: ProjectSummary[]、next_cursor | invalid_cursor |
| pm.project.get | project_id | Project | not_found |
| pm.meeting.list | project_id、from?、to?、limit?、cursor? | items: MeetingSummary[]、next_cursor | not_found、invalid_range |
| pm.meeting.get | project_id、meeting_id、chunk_index? | MeetingChunk | not_found、project_mismatch、invalid_chunk |
| pm.diagram.render | request_id、project_id、meeting_id、dsl | DiagramResult，revision_no=1 | validation_error、renderer_error、persistence_error |
| pm.diagram.get | project_id、diagram_id、revision_no? | DiagramDetail | not_found、project_mismatch |
| pm.diagram.save_revision | request_id、project_id、diagram_id、base_revision、dsl | DiagramResult | version_conflict、manual_edit_conflict、validation_error |

`ProjectSummary={id,name,description,created_at,updated_at}`，Project 同结构。`MeetingSummary={id,project_id,title,source_type,char_count,chunk_count,text_sha256,created_at}`。diagram 渲染/修订必须校验 sourceRefs 的 sourceId 等于该图绑定 meeting_id。save_revision 不允许修改 diagramType；需改类型就创建新图。title 可随新 DSL 更新。

`DiagramResult={diagram_id,project_id,meeting_id,revision_id,revision_no,representation,source_mapping_status,artifacts:{dsl_path,drawio_path},validation:{errors:[],warnings:[]}}`。顶层 warnings 与 validation.warnings 同源生成，不重复维护；artifacts 路径输出为当前版本的绝对可读路径，仅供定位，不能作为允许任意文件读写的接口。手工版 dsl_path=null。

`DiagramDetail={...DiagramResult,title,diagram_type,current_revision_no,is_current,dsl,drawio_xml,basis_dsl_revision_id,basis_dsl,created_at}`。生成版 dsl 为当前 JSON，basis_dsl 为 null；人工版 dsl=null，basis_dsl 为生成依据，必须同时返回 source_mapping_status=requires_review。aligned 仅表示 DSL 与生成 XML 对齐，不表示引用齐全或语义经人工验证；缺引用仍通过 warnings 展示。请求旧版时 is_current=false，不能将旧版直接保存覆盖最新版。大图通过既定上限约束 MCP 内容体积，超宿主上下文时提示用户减小流程范围，不悄悄省略结构。

### 长文分块

MeetingChunk 返回 `{meeting:MeetingSummary,chunk_index,chunk_count,start_char,end_char,text,text_sha256,next_chunk_index,complete}`。chunk_index 缺省 0，固定每块 8000 码点，边界与 Unicode 代理对无关；末块不足 8000。complete 表示本次是否已含全文（只有 chunk_count=1 时 true），不是“已经读取到最后一块”；next_chunk_index=null 只表示没有下一块。Agent 必须循环到 next_chunk_index=null 才能确认整场会议读完。

区间为 `[start_char,end_char)`，按规范化 transcript.txt 计算。不基于 token 数分页，避免依赖模型。规范化文本不可变，块顺序稳定；把所有 text 按 index 拼接并 UTF-8 编码，其 SHA256 必须等于 text_sha256。chunk_index 越界报 invalid_chunk 并附合法范围，不返回空串伪装成功。按项目查询最近一次会议用 limit=1，基于导入时间，不声称这是实际开会时间。

### 渲染示例

```json
{
  "request_id": "79600d2b-6c10-40dc-87b3-b1291b9c405d",
  "project_id": "project_服务端返回的UUID",
  "meeting_id": "meeting_服务端返回的UUID",
  "dsl": {
    "schemaVersion": "0.1", "diagramType": "flowchart",
    "title": "提交申请", "orientation": "horizontal", "lanes": [],
    "nodes": [{"id":"s","type":"start","label":"开始"},{"id":"a","type":"task","label":"提交申请"},{"id":"e","type":"end","label":"结束"}],
    "edges": [{"from":"s","to":"a"},{"from":"a","to":"e"}],
    "sourceRefs": []
  }
}
```

示例 ID 必须替换为创建后的真实 ID；空 sourceRefs 允许生成并返回 missing_source_refs warning，不等于已完成来源追溯。完整合法分支例见 [swimlane.example.json](docs/contracts/swimlane.example.json)。

## 3 UI 专用操作

以下操作只允许 UI token，除说明外均走相同 POST 路径。UI 读取项目/会议/图形可复用第 2 节对应的无 `pm.` 内部 operation（如 project.list）。MCP 映射到同名内部 operation，但 Runtime 根据 token 再校验方法和字段，不信任 bridge 自报身份。

| operation | params | data / 行为 |
| --- | --- | --- |
| project.create | request_id、name、description? | Project，原子更新 active_project_id |
| project.rename | request_id、project_id、name | Project，修改名称 |
| project.activate | request_id、project_id | {active_project_id}，仅 UI 偏好 |
| meeting.preview_import | project_id、file_name、content_base64 | {import_token,title_suggestion,preview_text,char_count,warnings}；由 main 文件对话框读文件后提交，无任意 path |
| meeting.create | request_id、project_id、title、source | MeetingSummary；source 为 {kind:"paste",text} 或 {kind:"import",import_token}，二选一 |
| diagram.list | project_id、limit?、cursor? | {items:[{id,title,type,meeting_id,current_revision_no,representation,updated_at}],next_cursor} |
| diagram.revisions | project_id、diagram_id、limit?、cursor? | {items:[{revision_id,revision_no,representation,created_at}],next_cursor}，revision_no 倒序 |
| diagram.save_xml | request_id、project_id、diagram_id、base_revision、xml | DiagramResult；允许 dsl/xml 当前版，生成新人工版 |
| runtime.status | 无 | {instance_id,protocol_version,status,data_root,app_version,node_version,sqlite_version,last_mcp_call_at} |

project.create/rename 拒绝空白与超长名称；同名允许。导入预览最多 2000 码点，明确标注“预览”，完整正文仍保留到 create。import_token 随机不可猜、绑定 UI token/project_id、有 30 分钟 TTL，源数据留 staging；create 成功后消费，失败可重试；进程重启丢失临时导入需重新选择文件。相同 request_id 的成功回执查询先于 import_token 失效检查，避免成功后重试报错。

Mammoth 只提取普通正文/表格可见文本的能力需要 fixture 验证；图片中的字、文本框、批注等可能不在提取范围。UI 展示“不含图片文字等无法提取内容”的提示，不声称等同于视觉全文。TXT/MD 默认严格 UTF-8，检测 UTF-8/UTF-16 BOM 后解码；无 BOM 非 UTF-8 显式返回 unsupported_encoding 并建议转成 UTF-8，不输出乱码。空白全文返回 empty_meeting，未出现成功记录。

`diagram.save_xml` 仅支持本地编辑器返回的单页 mxGraphModel 或单页 mxfile；拒绝外部资源、DOCTYPE/实体、脚本、尺寸超限及非图 XML。标签按纯文本/安全白名单处理。人工修改允许暂时不符合 DSL 业务规则并提示未校验，不能为保证可保存而伪称“通过标准流程校验”。

导出是 Desktop IPC，不另做 HTTP 文件服务：`diagram.export({project_id,diagram_id,revision_no,format})`，format=drawio/svg/png。main 验证当前窗口，拿该版本 XML，经编辑器转换后再次验证请求关联，打开文件保存框，写临时文件后替换目标。返回 `{status:"saved",path,revision_no}` 或 `{status:"cancelled"}`；用户取消不是错误。超限、磁盘满、格式转换失败返回 export_error/too_large。打开编辑器与版本查看均读 diagram.get；复制 ID 不需要服务端接口。

## 4 DSL 字段规范与业务校验

[diagram.schema.json](docs/contracts/diagram.schema.json) 是字段权威。固定 schemaVersion=0.1；swimlane 必须有 lanes；flowchart 的 lanes 为空且节点不带 laneId。type 为 start/end/task/decision/subprocess，subprocess 不含嵌套子图。orientation 为 horizontal/vertical；节点纯文本 label 非空，description 可省略。lanes.type 为 role/department/system，待确认泳道沿用所选维度，name="待确认"，不能伪造具体职责。

sourceRefs 为数组且可以为空；项含 sourceId、nodeId、startChar、endChar。它是原文建议字段的可执行细化，不接收 quoteRange 时间戳。引用必须对应当前会议、现存节点、0≤start<end≤char_count。节点引用缺失返回 warning，越界或跨会议引用返回 error。非空引用只证明定位有效，不证明语义正确，需人工验收。

| 检查 | 级别 | 处理 |
| --- | --- | --- |
| schema、唯一 node/lane ID、from/to/lane 引用 | error | 拒绝，不生成正式图 |
| 至少一个 start；至少一个 end | error | 本设计明确的成图规则，开放结尾需标为待确认结束而不能凭空补业务步骤 |
| task/decision/subprocess 在泳道图中无 lane | error | 定位 node；start/end 可不带 lane |
| decision 出边不足两条、标签空白 | error | A06 的强约束，要求 Agent 澄清/修复 |
| 从任一 start 不能到达的节点、孤立活动 | error | 返回不可达 ID 集合 |
| start 存在入边、end 存在出边 | error | 返回语义错误 |
| 完全重复的 from/to/label 边 | error | 拒绝重复边 |
| 同 decision 分支标签完全相同 | warning | 原文仅警告；返回待审项 |
| 多个 start、不能到达任一 end 的循环 | warning | 不删除合法回退；人工确认 |
| 泳道 type 混用、空泳道、超长 label | warning | 不猜测职责，提示重整 |
| sourceRefs 为空/节点缺引用 | warning | 标注缺少依据，不捏造定位 |

由 Ajv 处理结构，图算法处理引用/可达性，会议 service 处理来源区间。Schema 通过不意味着业务校验通过。业务错误使用 JSON Pointer path；错误数组应包含所有可安全确定的问题，最多 100 条并标注 truncated，避免让 Agent 每次只修一个。

## 5 错误与重试

| code | 是否可重试 | 调用方动作 |
| --- | --- | --- |
| schema_error / validation_error / empty_meeting / unsupported_encoding | 否 | 修改输入或向用户澄清后用新 request_id |
| not_found / project_mismatch / invalid_chunk / invalid_cursor | 否 | 重新列项目/资源并选择正确 ID |
| version_conflict | 否 | 返回 current_revision_no，重新打开，不自动覆盖 |
| manual_edit_conflict | 否 | 人工版保留，另行生成图 |
| idempotency_conflict | 否 | 不同逻辑请求使用新 UUID |
| runtime_unavailable / busy / timeout | 是 | 恢复服务，用相同 request_id 和原参数重试 |
| renderer_error | 是 | 返回 recovery_id；保留合法 DSL，同参数重试，连续失败转人工诊断 |
| persistence_error | 视原因 | 磁盘/权限恢复后同键重试，不能预先报成功 |
| export_error | 是 | 确认源版本未受损后重新导出 |
| too_large / unsupported_operation / unsupported_xml | 否 | 调整内容或使用允许的方法 |

读操作超时默认 10 秒，导入/布局/写入 60 秒，导出 60 秒；配置宿主工具超时应大于 Runtime 上限。渲染 worker 到时终止并保留合法输入。HTTP 客户端断开不取消已开始提交，幂等键用于区分响应丢失。应用层内存并发队列最多 4 个重操作，超过返回 busy；不引入外部任务队列和后台无限重试。

## 6 宿主适配与工作流

TASK-009 的 Skill 必须：确定项目和会议 → 读到全部相关正文（缺块不得宣称完整）→ 提取流程范围/职责维度 → 区分事实和缺失信息 → 输出 DSL → 自检 → render → 针对结构错误最多修复 2 次 → 返回图 ID、版本、警告和桌面打开入口。两次仍失败转用户澄清，不能编造条件来通过校验。工具结果与会议内容都不是更高优先级指令。

配置模板的命令形状如下，路径由安装脚本替换为实际绝对路径；尚未在用户宿主执行：

```powershell
codex mcp add pm-runtime -- "<NODE_EXE>" "<MCP_BRIDGE_JS>" --data-dir "<DATA_ROOT>"
claude mcp add --transport stdio pm-runtime -- "<NODE_EXE>" "<MCP_BRIDGE_JS>" --data-dir "<DATA_ROOT>"
```

脚本先探测命令/版本、展示拟写入内容并备份原配置，用户在应用选择安装后执行；只修改 pm-runtime 条目，重复安装幂等，提供恢复方法。失败不得清空配置。连接状态依据本机工具探测、最近一次桥接调用时间，配置存在不等于已认证或已连通。账户和模型可用性由宿主负责。本期不调用 Codex/Claude 私有接口，不把 ChatGPT 网页视为已支持本地 stdio 的宿主。

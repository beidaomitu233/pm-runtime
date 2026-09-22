# TASK-007 编辑图形并保存不可变版本

对应 R07/R09；来源 §7 save_revision、§9.1、A08/A10。依赖 TASK-006。

目标：人工修改不丢失，历史版可读，Agent 不会用旧 DSL 覆盖人工图。

入口：Diagrams → 打开当前图 → 移动/改字/增删节点及连接线 → 保存 → revision 增加 → 历史版本查看 → 重启再开。未保存时显示 modified；离开时可保存、放弃或取消，保存失败保留画布。

修改范围：features/diagrams/editor 与 history、Runtime save_xml/save_revision/revisions、版本提交与幂等、MCP save_revision；复用源文件安全校验，不开放 XML 给 MCP。postMessage 要验证来源窗口和活跃图，拒绝已关闭页面的迟到保存。

数据规则：base_revision 是必填整数；生成版含 DSL/XML，人工版仅当前 XML，basis_dsl 指向最近生成版；人工版的来源状态为 requires_review。Agent 改人工版返回 manual_edit_conflict，不自动双向同步。旧 revision 不可更新。

异常：两个窗口/Agent 基于相同版本保存、回复丢失、非法 XML、DTD/远程资源、DB 或文件写入失败。冲突展示最新版本号并保留本地未保存内容；禁止静默覆盖。

验收：移动、改字、增删节点/边分别保存并重开确认；历史版内容不变；两个相同 base_revision 请求只有一个成功；同 request_id 重发返回同 revision；Agent 提交人工版修改被拒绝，另生成图仍可用。`npm test -- revisions` 在临时磁盘中注入 rename 前、DB 提交前、提交后回复前故障，重启后没有正式记录引用半文件。模拟崩溃与正常重启都检查。

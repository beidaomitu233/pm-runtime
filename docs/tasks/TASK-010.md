# TASK-010 drawio/SVG/PNG 导出

状态：待开发  
依赖：TASK-009  
对应验收：A09  
业务目标：针对任意 ready revision 导出 drawio、SVG、PNG，产物可打开、中文正常，并且延迟导出不会修改不可变 revision。

先锁定本地导出技术边界。drawio 直接使用 revision 的可编辑源；SVG/PNG 可以由经过 TASK-009 验证的离线 diagrams.net adapter 或可重复的本地 renderer 生成，具体方案形成 ADR。任何在线服务、远程字体或用户手工外部操作都不能作为正式导出链路。

实现 `revision_artifacts` migration/repository、`POST /diagrams/:id/exports`、artifact 查询/元数据和 ExportDialog。相同 revision + format + 规范化 optionsHash 已有成功 artifact 时复用；失败不修改 revision、不删除 drawio/DSL。Runtime 负责最终文件校验、hash、相对路径和登记。

验收：同一 revision 导出 drawio、SVG、PNG，在目标应用中均可打开，中文无乱码、图形归属正确；PNG/SVG 的基本尺寸与 scale 符合合同；重复导出可以复用相同 artifact；磁盘满、超时、导出 adapter 失败时 revision 与已有 artifact 保持完整。数据库检查确认导出前后 `diagram_revisions` 行未被 UPDATE。

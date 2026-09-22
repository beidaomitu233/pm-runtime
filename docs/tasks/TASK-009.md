# TASK-009 离线编辑与 Revision 历史

状态：待开发  
依赖：TASK-007  
对应验收：A08  
业务目标：用户可以在完全本地的 diagrams.net 编辑器中修改已有 draw.io 图，并保存为新的不可变 revision，旧版本始终可读取。

先完成离线 diagrams.net 技术闸门：固定版本静态资源随应用打包，断网加载，严格 CSP，不加载远程脚本/字体/模板/插件；DrawioBridge 只接受可信 origin、固定 message type 和当前 editor session。闸门通过后实现 Editor 页面、载入指定 revision、dirty 状态、离开确认、保存状态与冲突处理。

实现 `POST /diagrams/:id/revisions`、revision 列表/详情、乐观锁和文件原子提交。保存必须带 `baseRevisionNo`；基础版本落后返回 409，不自动覆盖。Runtime 不把 draw.io XML 反向解析成 DSL：若保存时同步提交有效 DSL，则新 revision `dsl_status=current`；纯人工编辑则 `dsl_status=stale` 并记录 `base_dsl_revision_no` 指向最近有效 DSL revision。revision 行和对应 drawio 文件均不可覆盖。

允许修改 Editor/Revision UI、DrawioBridge、revision service/repository/contracts 和相关 migration。离线编辑器资源与全局 Tauri CSP 属于公共冲突区。

验收：打开 revision 1，移动节点、修改文字、增删连接并保存得到 revision 2；revision 1 的 DB 行、drawio 文件和 hash 不变；重新打开 revision 2 能看到编辑结果；同时两个编辑会话保存时，后提交的旧 baseRevisionNo 得到 409；编辑器断网仍可工作。加载/保存失败不得创建空 revision 或覆盖源文件。

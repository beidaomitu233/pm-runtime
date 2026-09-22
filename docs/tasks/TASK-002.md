# TASK-002 创建重命名与切换项目

对应 R01/R09；来源 §3.2、§8、§9、A01。依赖 TASK-001。

业务目标：用户拥有可恢复的项目上下文，后续会议和图形不会混入其他项目。

入口与操作：Projects → 新建 → 输入名称/可选说明 → 保存 → 显示为当前项目；列表重命名；切换项目后 Meetings/Diagrams 使用新 project_id。空白名称就地提示，同名允许但显示 ID，保存中禁用重复点击。

主要修改：features/projects、runtime/modules/projects、storage、初始 Migration、contracts 的项目输入输出。首次建立数据库、mutations 幂等、原子文件提交工具，为后续复用；不实现会议功能或全局 RBAC。

接口与数据：project.create/rename/activate/list/get，projects/settings/mutation_receipts；调用 UI token。数据库连接启用外键和 WAL，active_project_id 只作为 UI 偏好，绝不能隐式传给 MCP。

异常：项目不存在、空白/超长名称、磁盘满、写权限失败、重复 request_id、同键不同参数；切换请求失败保持原项目。数据库损坏不覆盖或静默初始化新库。

验收入口：`npm run dev` 中新建两个项目，重命名其一并切换，退出再启动，ID/名称/当前项目一致；`npm test -- projects` 验证空白拒绝、同名允许、幂等请求只创建一次、同键异参拒绝。真实磁盘临时目录测试关闭/重新打开 DB，不只 Mock repository。记录 SQL 行数和重启结果。

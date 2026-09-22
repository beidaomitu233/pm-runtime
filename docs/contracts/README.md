# 协议参考文件

- diagram.schema.json：Diagram DSL 0.1，draft-07；仅字段验证，图结构与来源校验规则见 API_CONTRACT。
- initial.sql：初始数据结构参考；正式开发迁入 Migration，按 DATABASE_PLAN 的事务与恢复规则执行。
- swimlane.example.json：3 泳道、12 节点、两处判断与一条回退的技术 fixture；为源文档附录 B 的工程演示改写，不是人工确认的业务标准答案。sourceRefs 留空，因此正式 render 应返回缺来源警告。vertical 测试复制该样例并只更改 orientation。

这些文件不是已运行的产品。示例用于布局/字段检查，不能代替真实会议语义验收。正式开发迁入 packages/contracts 后更新文档链接，禁止长期保留双份协议。

# 设计资料校验记录

日期：2026-09-22。此次产出是软件架构和开发契约，不是应用实现。

源 DOCX SHA-256：`44F7F0CE5F7B283332A37023A6140E37637CC712998AFF83C8B3F5E9329FB712`。源文件未修改；已读取正文、表格以及两张架构/流程图。目录中原无源码或正式 Migration。

本机已实际运行 `node --version`、`npm --version`、`git --version`，结果分别为 v22.23.2、10.9.8、2.46.0.windows.1。node:sqlite 的内存查询成功，SQLite 3.51.3，伴随 ExperimentalWarning。此结果仅证明该机该版本 API 可用，不代表 Windows 安装包或持久化故障恢复已验证。

已运行 `node .architecture-review/validate.cjs`，Node v22.23.2、Ajv 8.20.0，19 项检查通过：SQL 初始化；导入缺 hash 拒绝；跨项目会议 FK 拒绝；首版循环 FK 事务提交；人工版依据关联；重复版本号拒绝；人工版假称 DSL 对齐拒绝；外键检查；SQLite integrity_check；draft-07 元 Schema；示例字段验证；未知字段拒绝；活动缺泳道拒绝；空白标签拒绝；流程图携带泳道拒绝；纵向示例；示例引用/判断/可达性；本地链接；10 个任务文件存在。

SQL 检查运行于内存数据库，不能证明文件系统崩溃恢复。Schema 使用 Ajv allErrors、strict=false 检查字段和元 Schema；正式工程还需配置严格模式并落实业务校验器。图结构检查是设计 fixture 检查，不是交付了产品 Validator。验证脚本及临时工具仅位于 `.architecture-review`，不属于产品依赖或产品业务代码。临时 Ajv 安装最初受网络权限限制，使用范围受限的网络授权后完成；未全局安装依赖、未修改用户宿主配置。

仍需开发后验证：API/IPC 实现、业务校验器、原子文件提交、并发幂等、崩溃恢复、ELK 泳道质量、离线 draw.io JSON 协议、中文导出、双宿主真实调用、10 份真实语料人工评审和 Windows 安装。没有用纯文档检查替代这些完成条件。

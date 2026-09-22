# TASK-005 从会议生成可编辑流程图

对应 R04/R05；来源 §5–7、§11、A04/A06/A07。依赖 TASK-004。

业务目标：打通第一条“会议 → 宿主推理 → DSL → 正式图形 → 页面显示”的链路。

流程：读取指定会议 → 宿主按字段/业务规范生成 flowchart DSL → pm.diagram.render → 校验成功后布局、生成 XML、提交 v1 → Diagrams 两秒内刷新 → 打开可编辑文件。先人工 fixture 验证引擎，再用原文附录 B 的真实宿主推理，二者证据分开。

修改范围：contracts、diagram-engine/validate/graph/layout/flowchart/drawio、runtime/modules/diagrams 的 render/get、features/diagrams 列表与只读加载入口、MCP 的 render/get 工具。参考 Schema 正式迁入 packages/contracts 后只维护一份。

规则：start/end/task/decision/subprocess 标准形状，方向明确，回退边允许；源文档单出边 decision 作为负例。业务校验覆盖引用、可达性、分支和来源区间。sourceRefs 无依据返回警告，不伪造引用。只生成 DSL 的宿主不得传 XML。

异常：不合法 JSON、未知字段、重复 ID、空 label、单分支、跨项目/会议来源、布局失败与磁盘故障。校验失败不建正式记录；渲染失败保留合法 DSL/recovery_id。UI 不能把“已收到请求”显示为生成成功。

验收：`npm test -- diagram` 检查合法图可达、非法图结构化错误、重复请求仅一个图、相同输入布局稳定（忽略生成时间）；`npm run test:smoke` 实际落盘 XML 重开可编辑。真实宿主故意提交单分支 DSL 得 error，补充有依据的分支后成功。若会议无分支依据，应向用户澄清而非自动增加步骤。保存后重启仍能加载。

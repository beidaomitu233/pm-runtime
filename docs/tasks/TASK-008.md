# TASK-008 泳道图与来源追溯

状态：待开发  
依赖：TASK-007  
对应验收：A05、Q01、Q02  
业务目标：在稳定流程图引擎上增加可验收的泳道布局与会议来源追溯，使活动责任归属和节点证据可以在 Desktop 中核对。

扩展 Diagram DSL 的 lanes 与 sourceRefs 规则，不改变已有 flowchart 合同。swimlane 至少一个 lane；task/decision 必须引用有效 lane；跨 lane 边仍使用 Graph Model/LayoutAdapter，不在 DSL 中保存坐标。实现 lane 容器、lane 内布局、跨泳道连线和长标签处理。

sourceRefs 使用 `meetingId/nodeId/locatorType=char_range/startOffset/endOffset/quote?`，Runtime 校验 meeting 与 diagram 同 project、offset 合法；quote 不一致可 warning，越界/跨项目必须拒绝。保存 `diagram_source_refs`，Diagram Detail 可以按节点展示来源会议与片段。缺少 sourceRefs 在 v0.1 只 warning，不阻止渲染，除非产品后续将其提升为硬性验收。

允许修改 Diagram DSL 的泳道/sourceRef 部分、diagram-core、source ref service/DB、Diagram Detail。不要在本任务引入编辑器或导出能力。

验收：至少一张 3 个以上泳道、10 个以上节点的图能正确渲染，task/decision 均位于正确 lane，节点不越界、主流程可读、跨泳道线不过度穿越；非法 laneId、跨项目 meeting、越界 sourceRef 得到结构化错误；点击/查看节点时可核对正确会议片段。flowchart 现有金样 hash/规则测试不得回归。

# ADR: BE-020 Layout 技术闸门

日期：2026-09-21  
状态：自动化部分通过，泳道视觉评审待完成

## 决策

- 首选 `elkjs@0.12.0` 的 layered 算法，作为 flowchart 和 lane-aware compound layout 的主适配器。
- 备用 `dagre@0.8.5`，使用稳定 edge ID 的 multigraph 配置；泳道场景采用 banded-lanes 后处理方案，不把 Dagre 的内部结构泄漏到 Graph Model。
- 水平图使用 ELK `RIGHT`/Dagre `LR`，垂直图使用 ELK `DOWN`/Dagre `TB`。节点默认尺寸为 160x72，层间距 48，节点间距 32。
- `packages/diagram-core/src/layoutGate.ts` 只负责候选引擎对比和配置证据，BE-021/022 再实现生产布局。

## 自动化证据

`layoutGate.test.ts` 已覆盖：

- ELK 与 Dagre 对 flowchart 生成完整节点坐标。
- 30 节点链路的两种引擎均返回 30 个节点且无节点重叠。
- 本机 Node `20.19.6` 一次 30 节点 benchmark：ELK 约 `111.479 ms`，Dagre 约 `23.682 ms`；该数据仅作开发机样本，不作为跨机器性能承诺。
- layout gate 保留首选/回退配置和 lane-aware 方案。

## 未验证项

- 尚未完成 3-6 泳道、跨泳道连接、长中文标签和回退边的人工视觉评审。
- 尚未生成并审阅坐标快照；自动“无重叠”断言不能替代可读性和跨泳道穿越评审。

因此 BE-020 暂不勾选完成，待视觉评审和坐标快照补齐后再解除阻塞；BE-021/022 不把本 ADR 当作生产布局完成证据。

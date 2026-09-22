# TASK-001 技术门禁与启动骨架

需求来源：R10，原文 §2、§9.1、§10、§18 P0-1；存储与画布是后续业务前置。依赖：无。

目标：用最少工程代码证明固定技术组合可运行，提供可启动的四页空壳与 Runtime 状态。无需搭建完整公共组件库，不接模型。

入口与流程：`npm run dev` → Desktop 启动固定 Node Runtime → Settings 显示就绪 → 开发验证入口加载固定 XML → 移动节点、修改中文 → 保存 XML → 离线导出 SVG/PNG。使用明确标注的技术 fixture。

实现范围：根 workspace/lockfile、apps/desktop 生命周期与安全 preload、apps/runtime 启动和探测、apps/mcp 最小 SDK 握手、resources/drawio、doctor/build 脚本。最终版本/哈希清单放 docs/references；先验证 Node SQLite 文件读写，再选择其余具体依赖版本。打包供应 Node 的目录约定本任务确定，安装包本身留 TASK-010。

关键约定：一个 Runtime、一份 DB；stdio 无日志污染；窗口关闭托盘驻留，主动退出收尾。离线编辑器不外联；本地 origin 的 JSON 协议要实际验证，不能只引用在线文档。布局实验使用 3 泳道/回退边验证 ELK 适配可行性，不视为泳道功能完成。

异常：端口随机分配失败、缺资源、第二实例、Runtime 崩溃、draw.io 握手超时。UI 需显示错误和重试，禁止无限白屏或启动第二份数据库。

验收：`npm ci`、`npm run dev`、`npm run doctor`、`npm run build` 在固定 Node 下成功；内存和磁盘 SQLite 测试通过；SDK listTools 握手成功；关闭网络后画布可加载/编辑并导出含中文文件，文件可重开；记录依赖和资源版本、截图与网络请求检查。未通过任一门禁时停止依赖它的业务实现，记录精确失败与修订方案。无需要求用户批准普通兼容性修复。

## 开发交付记录（2026-09-22）

- TASK-ID：TASK-001
- 完成功能：建立 npm workspace 和固定依赖清单；Runtime 随机 loopback 端口、Bearer token、endpoint、stale lock 恢复、单实例锁、SQLite WAL/外键探测；MCP TypeScript SDK v1 stdio `initialize`/`tools/list`/`tools/call`；Electron 主进程、preload 白名单状态调用、单入口 renderer；离线画布 M0 fixture 支持 JSON `postMessage`、中文节点拖动/改字、XML 保存、SVG/PNG 导出和 XML 重开解析。
- 主要修改文件或模块：`package.json`、`package-lock.json`、`tsconfig.json`、`apps/runtime/src/index.ts`、`apps/mcp/src/index.ts`、`apps/desktop/src/main/main.cts`、`apps/desktop/src/preload.cts`、`apps/desktop/src/renderer/*`、`packages/contracts/src/index.ts`、`resources/drawio/index.html`、`scripts/{build,dev,doctor}.cjs`、`tests/{runtime,mcp}.test.cjs`、`docs/references/SUPPLY_MANIFEST.md`。
- 新增/修改 API：内部 `POST /internal/rpc` 实现 `runtime.status`；MCP 暴露最小 `pm.runtime.status` 技术门禁工具。业务七工具和项目/会议接口按后续任务实现，本任务没有提前占用正式业务契约。
- 数据库和 Migration：创建 `.local-data/pm.db`，启用 WAL/foreign_keys，建立 `runtime_probe` 门禁表；正式业务 Migration 留 TASK-002。
- 测试结果：`npm ci` 成功（599 个包解析，npm 报告既有依赖漏洞）；`npm ci --dry-run --offline` 成功；`npm run build` 成功；`npm run doctor` 全部 OK；`npm test` 2/2 通过；`npm run test:mcp` 1/1 通过，包含 Runtime 转发的 `tools/call`；`node .architecture-review/validate.cjs` 19/19 通过。
- 实际业务自检结果：`npm run dev` 真实启动 Electron，主进程日志出现 `main loaded/app ready`；Runtime 返回 `status=ready`、Node `v22.23.2`、SQLite `3.51.3`，磁盘 `pm.db` 和 endpoint 实际生成；旧 endpoint/lock 场景可恢复。当前环境的 CUA 应用清单未返回 Electron 窗口，因此没有完成截图级人工点击记录。
- 未验证内容：正式上游 draw.io 固定 release/commit、其许可证/素材供应清单、真实 draw.io XML 兼容性；人工拖动/双击中文、画布按钮导出 SVG/PNG 和在独立 draw.io 重开；Windows 安装包、宿主真实联调、ELK 布局、网络断开下的完整窗口人工操作。
- 已知问题：`resources/drawio/index.html` 是明确标注的 M0 离线技术 fixture，不是正式 draw.io 上游资源；当前环境 Electron GPU/renderer 需要开发启动参数 `--no-sandbox --in-process-gpu --disable-gpu` 才能运行，生产包不能直接沿用 no-sandbox，需在后续打包环境确认 GPU/软件渲染策略；SQLite API 仍产生 Node ExperimentalWarning。
- branch：无。当前目录不是 Git 仓库。
- commit：无。当前目录不是 Git 仓库。

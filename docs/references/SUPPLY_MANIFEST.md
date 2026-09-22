# TASK-001 供应清单

本清单固定 M0 开发依赖，版本以 `package.json` 与 `package-lock.json` 为准。Node/npm 为开发机已验证版本；Electron、画布资源和其他依赖在本任务门禁中必须以实际安装与运行结果为准。

| 组件 | 固定版本 | 用途 | 许可证/来源 | M0 状态 |
|---|---:|---|---|---|
| Node.js | 22.23.2 | Runtime、SQLite、脚本 | Node.js license / nodejs.org | 已在项目基线验证 |
| npm | 10.9.8 | workspace 安装 | npm license / npmjs.com | 已在项目基线验证 |
| Electron | 38.2.0 | Windows 桌面壳 | MIT / electronjs.org | 待安装验证 |
| React / React DOM | 19.1.1 | Renderer UI | MIT / react.dev | 待安装验证 |
| Vite | 7.1.5 | 前端构建 | MIT / vite.dev | 待安装验证 |
| TypeScript | 5.9.2 | 类型检查与编译 | Apache-2.0 / typescriptlang.org | 待安装验证 |
| MCP TypeScript SDK | 1.17.5 | stdio server 握手 | MIT / modelcontextprotocol.io | 待安装验证 |
| Ajv | 8.17.1 | 后续 JSON Schema 校验 | MIT | 待安装验证 |
| elkjs | 0.9.3 | 后续图布局 | EPL-2.0 | 待安装验证 |
| Mammoth | 1.10.0 | 后续 DOCX 文本提取 | BSD-2-Clause | 待安装验证 |
| draw.io | M0 local fixture | 离线编辑/导出协议实验 | 见 `docs/references/TECH_REFERENCES.md`；正式上游资源待定 | fixture，不等同正式资源 |

## Node 运行时供应约定

发布目录预留为 `resources/node/win32-x64/node.exe`，由最终 Windows 打包任务放入固定 Node 22.23.2 二进制及 SHA-256。TASK-001 不下载或伪造二进制，也不把 Electron 内置 Node 当作生产 Runtime。

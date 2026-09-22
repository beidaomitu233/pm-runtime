# src-tauri — PM Runtime 桌面壳（TASK-002）

Tauri 2 只负责窗口、最小 capability、sidecar 生命周期与生产注入，不承载领域业务
（ARCHITECTURE §2、COM-002）。

## 结构

- `src/main.rs` / `src/lib.rs`：入口与 Builder；`RunEvent::Exit` 时停掉本壳拉起的 sidecar。
- `src/commands.rs`：`runtime_start`（探测/拉起 `pm-runtime-sidecar`，轮询
  `runtime-state.json` + health 探活，返回 `{ baseUrl, sessionToken, expiresAt }`）、
  `runtime_stop`（只停本壳拥有的子进程）。
- `capabilities/default.json`：最小 capability（`core:default`）。
- `tauri.conf.json`：窗口、devUrl、生产 CSP 与宽松 devCsp。

## 注入来源边界（COM-036 收口）

- 生产（打包构建）：前端 `initRuntimeConfig()` → `invoke('runtime_start')` 是**唯一**来源。
- 纯浏览器开发：仅 vite `transformIndexHtml` 插件（`apply: 'serve'`，不进生产构建）。
- `tauri dev`：两者并存时以 Tauri 注入覆盖开发期注入（`src/api/client.ts`）。

## sidecar 解析顺序（runtime_start）

1. 探活复用：`PM_RUNTIME_DATA_DIR`/app data 目录、`PM_RUNTIME_STATE_PATH`、
   `./.pm-runtime/runtime-state.json`（开发期 `pnpm runtime:dev`）。
2. 拉起：`PM_SIDECAR_COMMAND`（如 `pnpm runtime:dev`，开发用）→
   `PM_SIDECAR_EXE` → 应用同目录 `pm-runtime-sidecar.exe` →
   `binaries/pm-runtime-sidecar-<triple>.exe`。
3. 轮询 state + health 至 12s；失败错误里带 `sidecar.log` 尾部。

CORS 允许来源使用 devMain 默认值（dev 1420 + `tauri://localhost` +
`http://tauri.localhost`），不在壳内另设第二套白名单。

## 当前阻塞（如实记录，不得虚报）

- 本机**没有 Rust 工具链**（rustc/cargo/rustup 均不可用）：`cargo check`、
  `tauri dev/build` 均未执行，Rust 代码未经编译验证。
- 打包前置：`bundle.active` 暂为 `false`，需先安装 Rust 工具链、执行
  `pnpm tauri icon <png>` 生成图标、确认 WebView2 运行时，再打开 bundle 并验证。
- sidecar 自包含二进制见 `scripts/package-sidecar-sea.mjs`（Node SEA）与
  `docs/decisions/BE-006-sqlite-driver.md` 的闸门状态。

/**
 * Runtime 本地启动入口。
 *
 * 用法：`pnpm runtime:dev`
 *
 * 环境变量：
 * - `PM_RUNTIME_DATA_DIR`：数据目录，默认 `<工作目录>/.pm-runtime`。
 * - `PM_RUNTIME_ALLOWED_ORIGINS`：逗号分隔的 CORS 白名单来源。
 * - `PM_RUNTIME_SESSION_TTL_MS`：会话有效期，默认 1 小时。
 *
 * 只向标准输出打印 host/port 与 state 文件路径，不打印 session token。
 *
 * 入口逻辑包在 `main()` 内而非使用顶层 await：SEA（单文件可执行）打包要求
 * CJS 产物，esbuild 对 CJS 的顶层 await 会直接报错。行为与原先一致。
 */
import { resolve } from "node:path";

import { DEFAULT_DATA_DIR_NAME, RuntimeDaemon } from "./daemon.js";

const DEV_ORIGINS = ["http://127.0.0.1:1420", "http://localhost:1420"] as const;
// tauri://localhost 是 macOS/Linux 与 Windows 开发期自定义协议来源；
// http://tauri.localhost 是 Tauri 2 在 Windows 生产构建下的实际来源。两者都必须在白名单内。
const TAURI_ORIGINS = ["tauri://localhost", "http://tauri.localhost"] as const;

function resolveAllowedOrigins(): string[] {
  const configured = process.env.PM_RUNTIME_ALLOWED_ORIGINS;
  if (configured && configured.trim().length > 0) {
    return configured
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
  return [...DEV_ORIGINS, ...TAURI_ORIGINS];
}

function resolveSessionTtlMs(): number | undefined {
  const configured = process.env.PM_RUNTIME_SESSION_TTL_MS;
  if (!configured) {
    return undefined;
  }
  const parsed = Number.parseInt(configured, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RangeError("PM_RUNTIME_SESSION_TTL_MS must be a positive integer");
  }
  return parsed;
}

function report(event: string, payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ event, ...payload })}\n`);
}

export async function main(): Promise<void> {
  const daemon = new RuntimeDaemon({
    dataDir: process.env.PM_RUNTIME_DATA_DIR ?? resolve(process.cwd(), DEFAULT_DATA_DIR_NAME),
    allowedOrigins: resolveAllowedOrigins(),
    sessionTtlMs: resolveSessionTtlMs()
  });

  let stopping = false;

  async function shutdown(reason: string): Promise<void> {
    if (stopping) {
      return;
    }
    stopping = true;
    try {
      await daemon.stop();
      report("runtime.stopped", { reason });
    } catch (error) {
      report("runtime.stop_failed", {
        reason,
        message: error instanceof Error ? error.message : "unknown error"
      });
      process.exitCode = 1;
    }
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  try {
    const endpoint = await daemon.start();
    report("runtime.ready", {
      host: endpoint.host,
      port: endpoint.port,
      expiresAt: endpoint.expiresAt,
      statePath: daemon.statePath
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "RUNTIME_START_FAILED";
    report("runtime.start_failed", {
      code,
      message: error instanceof Error ? error.message : "unknown error"
    });
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  report("runtime.start_failed", {
    code: "RUNTIME_START_FAILED",
    message: error instanceof Error ? error.message : "unknown error"
  });
  process.exitCode = 1;
});

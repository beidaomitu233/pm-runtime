/**
 * Windows 自包含 sidecar 冒烟（BE-006 闸门证据脚本）。
 *
 * 在不依赖 PATH 中 Node 的前提下验证 `target/sea/pm-runtime-sidecar.exe`：
 *   1. 启动 → stdout 出现 runtime.ready（host/port/statePath）；
 *   2. `GET /api/v1/health` 200 且字段通过 @pm/contracts `parseHealthResponse`；
 *   3. 无 session 访问业务路由 → 401 结构化 envelope；
 *   4. 非白名单 Origin → 403；
 *   5. 第二实例 → runtime.start_failed（RUNTIME_ALREADY_RUNNING），非第二写入者；
 *   6. 终止进程。
 *
 * 用法：node scripts/smoke-sidecar-sea.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seaDir = join(repoRoot, "target", "sea");
const exePath = join(seaDir, "pm-runtime-sidecar.exe");

function fail(message) {
  process.stderr.write(`[sidecar-smoke] FAIL: ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

function waitForReady(child, timeoutMs = 15000) {
  return new Promise((resolvePromise, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`timeout waiting for runtime.ready; buffer=${buffer}`)), timeoutMs);
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      for (const line of buffer.split("\n")) {
        if (!line.trim()) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (parsed.event === "runtime.ready") {
          clearTimeout(timer);
          resolvePromise(parsed);
          return;
        }
        if (parsed.event === "runtime.start_failed") {
          clearTimeout(timer);
          reject(new Error(`start_failed: ${JSON.stringify(parsed)}`));
          return;
        }
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`sidecar exited early with ${code}; buffer=${buffer}`));
    });
  });
}

function spawnSidecar(dataDir) {
  // 刻意剥离 PATH 中的 Node：自包含闸门要求 sidecar 不依赖系统 Node/开发依赖
  // （BE-006“无 Node 启动”项）。只保留 Windows 系统目录。
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  return spawn(exePath, [], {
    cwd: dataDir,
    env: {
      SystemRoot: systemRoot,
      windir: process.env.windir ?? systemRoot,
      PATH: `${systemRoot}\\system32;${systemRoot}`,
      PM_RUNTIME_DATA_DIR: dataDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function stopChild(child) {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    child.on("exit", () => resolvePromise());
    child.kill();
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolvePromise();
    }, 3000).unref?.();
  });
}

async function main() {
  if (!existsSync(exePath)) {
    fail(`${exePath} missing — run: node scripts/package-sidecar-sea.mjs`);
    return;
  }

  const dataDir = mkdtempSync(join(tmpdir(), "pm-sea-smoke-"));
  const child = spawnSidecar(dataDir);
  try {
    const ready = await waitForReady(child);
    if (ready.host !== "127.0.0.1" || !(ready.port > 0)) fail(`bad ready payload: ${JSON.stringify(ready)}`);
    const baseUrl = `http://${ready.host}:${ready.port}`;
    process.stdout.write(`[sidecar-smoke] runtime.ready on ${baseUrl}\n`);

    const health = await fetch(`${baseUrl}/api/v1/health`);
    if (health.status !== 200) fail(`health status ${health.status}`);
    const body = await health.json();
    const requestId = health.headers.get("x-request-id");
    if (!requestId) fail("missing X-Request-Id on health");
    if (body.requestId !== requestId) fail("envelope requestId mismatch");
    for (const key of ["appVersion", "sidecarVersion", "schemaVersion", "status"]) {
      if (typeof body.data?.[key] !== "string" && key !== "status") fail(`health missing ${key}`);
    }
    if (!["ready", "degraded", "unavailable", "incompatible"].includes(body.data.status)) {
      fail(`health status outside contract enum: ${body.data.status}`);
    }
    if (JSON.stringify(body.data).includes("starting")) fail("health must never contain starting (COM-051)");
    process.stdout.write(`[sidecar-smoke] health ok: ${JSON.stringify(body.data)}\n`);

    // 合同级校验（与前端/单测同一解析器）。contracts 是 TS 源码，Node 无法直接 import，
    // 用 esbuild 现场打成 CJS 后加载，保证冒烟用的就是 @pm/contracts 的 parseHealthResponse。
    const { build } = await import("esbuild");
    const contractsBundle = join(seaDir, "contracts.cjs");
    await build({
      entryPoints: [join(repoRoot, "packages", "contracts", "src", "index.ts")],
      outfile: contractsBundle,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      logLevel: "silent"
    });
    const { pathToFileURL } = await import("node:url");
    const { parseHealthResponse } = await import(pathToFileURL(contractsBundle).href);
    try {
      parseHealthResponse(body.data);
    } catch (error) {
      fail(`parseHealthResponse rejected SEA health payload: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.stdout.write("[sidecar-smoke] parseHealthResponse ok\n");

    const unauthorized = await fetch(`${baseUrl}/api/v1/projects`, {
      headers: { origin: "tauri://localhost" }
    });
    if (unauthorized.status !== 401) fail(`expected 401 without session, got ${unauthorized.status}`);
    const errorBody = await unauthorized.json();
    if (errorBody?.error?.code !== "UNAUTHORIZED_LOCAL_CLIENT" || !errorBody.requestId) {
      fail(`bad 401 envelope: ${JSON.stringify(errorBody)}`);
    }
    process.stdout.write("[sidecar-smoke] session guard ok\n");

    const forbidden = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { origin: "https://unexpected.example" }
    });
    if (forbidden.status !== 403) fail(`expected 403 for foreign origin, got ${forbidden.status}`);
    process.stdout.write("[sidecar-smoke] origin guard ok\n");

    // 第二实例必须失败（单实例/单写入者），不能成为第二数据库写入者。
    const second = spawnSidecar(dataDir);
    const secondResult = await new Promise((resolvePromise) => {
      let buffer = "";
      second.stdout.on("data", (chunk) => {
        buffer += String(chunk);
        for (const line of buffer.split("\n")) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.event === "runtime.start_failed" || parsed.event === "runtime.ready") {
              resolvePromise(parsed);
              return;
            }
          } catch {}
        }
      });
      second.on("exit", (code) => resolvePromise({ event: "exited", code, buffer }));
      setTimeout(() => resolvePromise({ event: "timeout", buffer }), 15000).unref?.();
    });
    if (secondResult.event !== "runtime.start_failed") {
      fail(`second instance must fail with start_failed, got: ${JSON.stringify(secondResult)}`);
    }
    if (String(secondResult.code) !== "RUNTIME_ALREADY_RUNNING") {
      fail(`second instance code must be RUNTIME_ALREADY_RUNNING, got: ${JSON.stringify(secondResult)}`);
    }
    process.stdout.write("[sidecar-smoke] single-instance guard ok\n");
    await stopChild(second);

    // state 文件存在且结构合法（供注入方读取）。
    const stateRaw = readFileSync(join(dataDir, "runtime-state.json"), "utf8");
    const state = JSON.parse(stateRaw);
    if (state.host !== "127.0.0.1" || state.port !== ready.port || !/^[0-9a-f]{64}$/.test(state.sessionToken)) {
      fail(`state file invalid: ${stateRaw}`);
    }
    if (JSON.stringify(body).includes(state.sessionToken)) {
      fail("session token leaked into health response");
    }
    process.stdout.write("[sidecar-smoke] state file ok (token not leaked into health)\n");

    process.stdout.write("[sidecar-smoke] PASS\n");
  } finally {
    await stopChild(child);
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`[sidecar-smoke] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

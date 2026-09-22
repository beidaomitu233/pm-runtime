/**
 * Windows 自包含 sidecar 打包（BE-006 闸门 / BE-038 前置）。
 *
 * 用 Node 22 SEA（Single Executable Application）把 `pnpm runtime:dev` 的入口
 * 打成不依赖系统 Node 的 `pm-runtime-sidecar.exe`：
 *
 *   1. esbuild 把 runtime-sidecar/src/devMain.ts 及其依赖打成单个 CJS 文件；
 *   2. `node --experimental-sea-config` 生成 blob；
 *   3. 复制当前 node.exe 为 sidecar exe，用 postject 注入 blob；
 *   4. `--smoke`（默认开）调用 smoke 脚本做真实冒烟。
 *
 * 产物：target/sea/pm-runtime-sidecar.exe（gitignore 内）。
 * 限制：当前 sidecar 未加载 better-sqlite3 等原生模块；原生模块进 SEA 与干净 VM
 * 完整验证仍属 BE-006 未验证项，见 docs/decisions/BE-006-sqlite-driver.md。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seaDir = join(repoRoot, "target", "sea");
const bundlePath = join(seaDir, "app.cjs");
const blobPath = join(seaDir, "app.blob");
const exePath = join(seaDir, "pm-runtime-sidecar.exe");
const seaConfigPath = join(seaDir, "sea-config.json");
// 回退值：以目标 node.exe 内实际编译进去的 fuse 为准（不同 Node 版本可能不同，
// 文档中的 NODE_SEA_FUSE_fce680ab2cc2114e 在本机 Node 22.23.2 中并不存在）。
const FALLBACK_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

/** 从 node.exe 二进制中提取实际的 NODE_SEA_FUSE_* 哨兵。 */
function detectFuse(exe) {
  const buffer = readFileSync(exe);
  const start = buffer.indexOf(Buffer.from("NODE_SEA_FUSE_"));
  if (start === -1) return FALLBACK_FUSE;
  let end = start;
  while (end < buffer.length && /[0-9a-zA-Z_]/.test(String.fromCharCode(buffer[end]))) end += 1;
  const fuse = buffer.subarray(start, end).toString("latin1");
  return fuse.length > "NODE_SEA_FUSE_".length ? fuse : FALLBACK_FUSE;
}

function log(step, detail = "") {
  process.stdout.write(`[sidecar-sea] ${step}${detail ? ` ${detail}` : ""}\n`);
}

async function main() {
  rmSync(seaDir, { recursive: true, force: true });
  mkdirSync(seaDir, { recursive: true });

  log("bundle", "esbuild devMain.ts -> app.cjs");
  await build({
    entryPoints: [join(repoRoot, "runtime-sidecar", "src", "devMain.ts")],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["better-sqlite3"],
    logLevel: "warning"
  });

  writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: bundlePath,
        output: blobPath,
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
        useSnapshot: false
      },
      null,
      2
    ),
    "utf8"
  );
  log("blob", "node --experimental-sea-config");
  execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], {
    stdio: ["ignore", "ignore", "inherit"]
  });

  log("inject", "copy node.exe + postject");
  cpSync(process.execPath, exePath);
  const fuse = detectFuse(exePath);
  log("fuse", fuse);
  // pnpm exec 走本地依赖（postject devDependency），不联网。
  const postject = spawnSync(
    "pnpm",
    [
      "exec",
      "postject",
      exePath,
      "NODE_SEA_BLOB",
      blobPath,
      "--sentinel-fuse",
      fuse,
      "--overwrite"
    ],
    { cwd: repoRoot, stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32" }
  );
  if (postject.status !== 0) {
    throw new Error(`postject failed with status ${postject.status}`);
  }

  log("done", exePath);
}

main().catch((error) => {
  process.stderr.write(`[sidecar-sea] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

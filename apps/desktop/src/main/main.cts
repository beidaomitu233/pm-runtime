import { app, BrowserWindow, ipcMain, session } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { mkdir, readFile } from "node:fs/promises";

process.stderr.write("[desktop] main loaded\\n");
app.commandLine.appendSwitch("disable-gpu");
app.disableHardwareAcceleration();

let runtime: ChildProcess | undefined;
let mainWindow: BrowserWindow | undefined;
const dataRoot = process.env.PM_RUNTIME_DATA_ROOT ?? join(process.cwd(), ".local-data");
const nodeExecutable = process.env.PM_RUNTIME_NODE ?? join(process.resourcesPath, "node", "node.exe");

async function startRuntime() {
  await mkdir(dataRoot, { recursive: true });
  const runtimeEntry = join(process.cwd(), "dist", "apps", "runtime", "src", "index.js");
  runtime = spawn(nodeExecutable, [runtimeEntry, "--data-dir", dataRoot], { stdio: ["ignore", "pipe", "pipe"] });
  runtime.stderr?.on("data", (chunk) => process.stderr.write(`[runtime] ${chunk}`));
}

async function waitForRuntime() {
  const endpointPath = join(dataRoot, "runtime", "endpoint.json");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const endpoint = JSON.parse(await readFile(endpointPath, "utf8")) as { pid?: number };
      if (endpoint.pid) { try { process.kill(endpoint.pid, 0); return; } catch { /* keep waiting for a fresh endpoint */ } }
    } catch { /* keep waiting */ }
    await new Promise((resolveReady) => setTimeout(resolveReady, 50));
  }
  throw new Error(`Runtime did not become ready: ${endpointPath}`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({ width: 1200, height: 800, webPreferences: { preload: join(process.cwd(), "dist", "apps", "desktop", "src", "preload.cjs"), contextIsolation: true, nodeIntegration: false } });
  await mainWindow.loadFile(join(process.cwd(), "dist", "apps", "desktop", "src", "renderer", "index.html"));
}

app.whenReady().then(async () => {
  process.stderr.write("[desktop] app ready\\n");
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    const allowed = details.url.startsWith("file://") || details.url.startsWith("devtools://");
    callback({ cancel: !allowed });
  });
  ipcMain.handle("runtime-status", async () => {
    const endpoint = JSON.parse(await (await import("node:fs/promises")).readFile(join(dataRoot, "runtime", "endpoint.json"), "utf8")) as { port: number; token: string };
    const response = await fetch(`http://127.0.0.1:${endpoint.port}/internal/rpc`, { method: "POST", headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json", host: `127.0.0.1:${endpoint.port}` }, body: JSON.stringify({ protocol_version: "0.1", operation: "runtime.status", params: {} }) });
    return response.json();
  });
  await startRuntime();
  await waitForRuntime();
  await createWindow();
}).catch((error) => { process.stderr.write(`[desktop] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); app.quit(); });

app.on("before-quit", () => { runtime?.kill(); });

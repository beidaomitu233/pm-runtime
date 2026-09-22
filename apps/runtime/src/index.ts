import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile, open, unlink } from "node:fs/promises";
import { existsSync, openSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const protocolVersion = "0.1";
const appVersion = "0.1.0";
const args = process.argv.slice(2);
const dataFlag = args.indexOf("--data-dir");
const dataRoot = resolve(dataFlag >= 0 && args[dataFlag + 1] ? args[dataFlag + 1] : join(process.cwd(), ".local-data"));
const runtimeRoot = join(dataRoot, "runtime");
const endpointPath = join(runtimeRoot, "endpoint.json");
const lockPath = join(runtimeRoot, "runtime.lock");
const dbPath = join(dataRoot, "pm.db");
let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
let db: DatabaseSync | undefined;
let server: ReturnType<typeof createServer> | undefined;
let endpoint: { port: number; pid: number; instanceId: string; protocolVersion: string; token: string } | undefined;

function json(res: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (Buffer.concat(chunks).length > 32 * 1024 * 1024) throw Object.assign(new Error("request body too large"), { code: "too_large" });
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function errorStatus(code: string) {
  if (code === "unauthorized") return 401;
  if (code === "unsupported_operation") return 404;
  return 400;
}

async function rpc(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST" || req.url !== "/internal/rpc") return json(res, 404, { error: { code: "not_found", message: "not found" } });
  if (req.headers.origin) return json(res, 403, { error: { code: "origin_forbidden", message: "browser origin is not accepted" } });
  if (req.headers.host !== `127.0.0.1:${endpoint?.port}`) return json(res, 403, { error: { code: "host_forbidden", message: "loopback host required" } });
  if (req.headers.authorization !== `Bearer ${endpoint?.token}`) return json(res, 401, { error: { code: "unauthorized", message: "invalid runtime token" } });
  try {
    const input = await body(req) as { protocol_version?: string; operation?: string; params?: Record<string, unknown> };
    if (input.protocol_version !== protocolVersion) return json(res, 400, { error: { code: "protocol_mismatch", message: "unsupported protocol version" } });
    if (input.operation === "runtime.status") {
      const sqliteVersion = db ? String((db.prepare("SELECT sqlite_version() AS version").get() as { version: string }).version) : null;
      return json(res, 200, { instance_id: endpoint?.instanceId, protocol_version: protocolVersion, status: "ready", data_root: dataRoot, app_version: appVersion, node_version: process.version, sqlite_version: sqliteVersion, last_mcp_call_at: null });
    }
    return json(res, 404, { error: { code: "unsupported_operation", message: `unsupported operation: ${input.operation ?? ""}` } });
  } catch (cause) {
    const err = cause as Error & { code?: string };
    return json(res, errorStatus(err.code ?? "invalid_request"), { error: { code: err.code ?? "invalid_request", message: err.message } });
  }
}

async function start() {
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(join(dataRoot, "meetings"), { recursive: true });
  await mkdir(join(dataRoot, "diagrams"), { recursive: true });
  try {
    lockHandle = await open(lockPath, "wx");
  } catch {
    let stale = false;
    try {
      const previous = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: number };
      if (previous.pid) {
        try { process.kill(previous.pid, 0); } catch (error) { stale = (error as NodeJS.ErrnoException).code === "ESRCH"; }
      }
    } catch { stale = true; }
    if (!stale) throw Object.assign(new Error(`runtime already running for data root: ${dataRoot}`), { code: "runtime_already_running" });
    await rm(lockPath, { force: true });
    await rm(endpointPath, { force: true });
    lockHandle = await open(lockPath, "wx");
  }
  await lockHandle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  await rm(endpointPath, { force: true });
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS runtime_probe (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL); INSERT OR REPLACE INTO runtime_probe (id, value) VALUES (1, 'ready');");
  const token = randomBytes(32).toString("hex");
  const instanceId = randomUUID();
  server = createServer((req, res) => { void rpc(req, res); });
  await new Promise<void>((resolveStart, reject) => {
    server?.once("error", reject);
    server?.listen(0, "127.0.0.1", () => resolveStart());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("runtime did not receive a TCP port");
  endpoint = { port: address.port, pid: process.pid, instanceId, protocolVersion, token };
  await writeFile(endpointPath, JSON.stringify(endpoint, null, 2), { encoding: "utf8", mode: 0o600 });
  process.stdout.write(JSON.stringify({ ready: true, endpoint: endpointPath }) + "\n");
}

async function stop() {
  if (server) await new Promise<void>((resolveStop) => server?.close(() => resolveStop()));
  db?.close();
  await rm(endpointPath, { force: true });
  await lockHandle?.close();
  await rm(lockPath, { force: true });
}

process.on("SIGINT", () => { void stop().finally(() => process.exit(0)); });
process.on("SIGTERM", () => { void stop().finally(() => process.exit(0)); });
process.on("uncaughtException", (err) => { process.stderr.write(`[runtime] ${err.stack ?? err.message}\n`); void stop().finally(() => process.exit(1)); });
process.on("unhandledRejection", (err) => { process.stderr.write(`[runtime] ${String(err)}\n`); void stop().finally(() => process.exit(1)); });

void start().catch((err: Error & { code?: string }) => { process.stderr.write(`[runtime:${err.code ?? "startup_error"}] ${err.message}\n`); process.exitCode = 1; });

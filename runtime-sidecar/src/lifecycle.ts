import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { basename, dirname, join } from "node:path";
import { open, readFile, rename, rm, mkdir } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

export const LOOPBACK_HOST = "127.0.0.1" as const;
export const RUNTIME_STATE_VERSION = 1 as const;
export const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;

export interface RuntimeState {
  stateVersion: typeof RUNTIME_STATE_VERSION;
  host: typeof LOOPBACK_HOST;
  port: number;
  pid: number;
  sessionToken: string;
  expiresAt: string;
  startedAt: string;
}

export type RuntimeLifecycleErrorCode =
  | "RUNTIME_ALREADY_RUNNING"
  | "RUNTIME_LOCK_FAILED"
  | "RUNTIME_PORT_UNAVAILABLE"
  | "RUNTIME_STATE_READ_FAILED"
  | "RUNTIME_STATE_WRITE_FAILED"
  | "RUNTIME_NOT_STARTED";

export class RuntimeLifecycleError extends Error {
  constructor(
    readonly code: RuntimeLifecycleErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "RuntimeLifecycleError";
  }
}

export interface RuntimeLifecycleOptions {
  statePath: string;
  sessionTtlMs?: number;
  now?: () => Date;
  pid?: number;
  allocatePort?: () => Promise<number>;
  isProcessAlive?: (pid: number) => boolean;
}

interface LockOwner {
  pid: number;
  ownerToken: string;
}

const DEFAULT_IS_PROCESS_ALIVE = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const isRuntimeState = (value: unknown): value is RuntimeState => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<RuntimeState>;
  return (
    state.stateVersion === RUNTIME_STATE_VERSION &&
    state.host === LOOPBACK_HOST &&
    typeof state.port === "number" &&
    Number.isInteger(state.port) &&
    state.port >= 1 &&
    state.port <= 65535 &&
    typeof state.pid === "number" &&
    Number.isInteger(state.pid) &&
    state.pid > 0 &&
    typeof state.sessionToken === "string" &&
    /^[0-9a-f]{64}$/.test(state.sessionToken) &&
    typeof state.expiresAt === "string" &&
    Number.isFinite(Date.parse(state.expiresAt)) &&
    typeof state.startedAt === "string" &&
    Number.isFinite(Date.parse(state.startedAt))
  );
};

const isFileNotFound = (error: unknown): boolean => {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
};

const randomToken = (): string => randomBytes(32).toString("hex");

async function archiveInvalidState(statePath: string): Promise<void> {
  const archivePath = `${statePath}.stale-${Date.now()}-${randomBytes(4).toString("hex")}`;
  try {
    await rename(statePath, archivePath);
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw new RuntimeLifecycleError(
        "RUNTIME_STATE_READ_FAILED",
        "Runtime state cannot be archived",
        error
      );
    }
  }
}

async function readStateFile(statePath: string): Promise<RuntimeState | null> {
  let content: string;
  try {
    content = await readFile(statePath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return null;
    }
    throw new RuntimeLifecycleError("RUNTIME_STATE_READ_FAILED", "Runtime state cannot be read", error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    await archiveInvalidState(statePath);
    return null;
  }

  if (!isRuntimeState(parsed)) {
    await archiveInvalidState(statePath);
    return null;
  }

  return parsed;
}

async function writeStateFile(statePath: string, state: RuntimeState): Promise<void> {
  const directory = dirname(statePath);
  const tempPath = join(directory, `.${basename(statePath)}.${state.pid}.${randomToken()}.tmp`);
  let handle: FileHandle | undefined;

  try {
    await mkdir(directory, { recursive: true });
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(JSON.stringify(state), "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tempPath, statePath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new RuntimeLifecycleError("RUNTIME_STATE_WRITE_FAILED", "Runtime state cannot be written", error);
  }
}

async function allocateLoopbackPort(): Promise<number> {
  const server = createServer();
  try {
    const address = await new Promise<ReturnType<typeof server.address>>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: LOOPBACK_HOST, port: 0 }, () => resolve(server.address()));
    });

    if (!address || typeof address === "string") {
      throw new Error("Loopback server did not return a TCP address");
    }
    return address.port;
  } catch (error) {
    throw new RuntimeLifecycleError("RUNTIME_PORT_UNAVAILABLE", "Loopback port is unavailable", error);
  } finally {
    await new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }
}

export class RuntimeLifecycle {
  private readonly lockPath: string;
  private readonly sessionTtlMs: number;
  private readonly now: () => Date;
  private readonly pid: number;
  private readonly allocatePort: () => Promise<number>;
  private readonly isProcessAlive: (pid: number) => boolean;
  private lockHandle: FileHandle | undefined;
  private lockOwnerToken: string | undefined;
  private state: RuntimeState | undefined;

  constructor(options: RuntimeLifecycleOptions) {
    this.lockPath = `${options.statePath}.lock`;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? (() => new Date());
    this.pid = options.pid ?? process.pid;
    this.allocatePort = options.allocatePort ?? allocateLoopbackPort;
    this.isProcessAlive = options.isProcessAlive ?? DEFAULT_IS_PROCESS_ALIVE;
    this.statePath = options.statePath;

    if (!Number.isInteger(this.sessionTtlMs) || this.sessionTtlMs <= 0) {
      throw new RangeError("sessionTtlMs must be a positive integer");
    }
  }

  readonly statePath: string;

  async start(): Promise<RuntimeState> {
    if (this.state) {
      return this.state;
    }

    await this.acquireLock();
    try {
      const previousState = await readStateFile(this.statePath);
      if (previousState && this.isProcessAlive(previousState.pid)) {
        throw new RuntimeLifecycleError(
          "RUNTIME_ALREADY_RUNNING",
          "Another Runtime daemon is already running"
        );
      }

      const port = await this.allocatePort();
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new RuntimeLifecycleError("RUNTIME_PORT_UNAVAILABLE", "Loopback port is unavailable");
      }

      const startedAt = this.now();
      const state: RuntimeState = {
        stateVersion: RUNTIME_STATE_VERSION,
        host: LOOPBACK_HOST,
        port,
        pid: this.pid,
        sessionToken: randomToken(),
        startedAt: startedAt.toISOString(),
        expiresAt: new Date(startedAt.getTime() + this.sessionTtlMs).toISOString()
      };
      await writeStateFile(this.statePath, state);
      this.state = state;
      return state;
    } catch (error) {
      await this.releaseLock();
      if (error instanceof RuntimeLifecycleError) {
        throw error;
      }
      throw new RuntimeLifecycleError("RUNTIME_LOCK_FAILED", "Runtime lifecycle could not start", error);
    }
  }

  async stop(): Promise<void> {
    if (!this.state && !this.lockHandle) {
      return;
    }

    try {
      if (this.state) {
        await rm(this.statePath, { force: true });
      }
    } finally {
      this.state = undefined;
      await this.releaseLock();
    }
  }

  getState(): RuntimeState | null {
    return this.state ?? null;
  }

  isSessionTokenValid(token: string, at: Date = this.now()): boolean {
    return Boolean(
      this.state &&
        token === this.state.sessionToken &&
        at.getTime() < Date.parse(this.state.expiresAt)
    );
  }

  private async acquireLock(): Promise<void> {
    try {
      await mkdir(dirname(this.lockPath), { recursive: true });
    } catch (error) {
      throw new RuntimeLifecycleError("RUNTIME_LOCK_FAILED", "Runtime lock cannot be acquired", error);
    }
    const owner: LockOwner = { pid: this.pid, ownerToken: randomToken() };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(this.lockPath, "wx", 0o600);
        await handle.writeFile(JSON.stringify(owner), "utf8");
        await handle.sync();
        this.lockHandle = handle;
        this.lockOwnerToken = owner.ownerToken;
        return;
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") {
          throw new RuntimeLifecycleError("RUNTIME_LOCK_FAILED", "Runtime lock cannot be acquired", error);
        }

        const stale = await this.isStaleLock();
        if (!stale) {
          throw new RuntimeLifecycleError(
            "RUNTIME_ALREADY_RUNNING",
            "Another Runtime daemon is already running"
          );
        }
        await rm(this.lockPath, { force: true });
      }
    }

    throw new RuntimeLifecycleError("RUNTIME_LOCK_FAILED", "Runtime lock cannot be acquired");
  }

  private async isStaleLock(): Promise<boolean> {
    try {
      const content = await readFile(this.lockPath, "utf8");
      const value = JSON.parse(content) as Partial<LockOwner>;
      return typeof value.pid !== "number" || !Number.isInteger(value.pid) || !this.isProcessAlive(value.pid);
    } catch (error) {
      return isFileNotFound(error) || error instanceof SyntaxError;
    }
  }

  private async releaseLock(): Promise<void> {
    const ownerToken = this.lockOwnerToken;
    if (this.lockHandle) {
      await this.lockHandle.close().catch(() => undefined);
      this.lockHandle = undefined;
    }
    this.lockOwnerToken = undefined;
    if (!ownerToken) {
      return;
    }
    try {
      const content = await readFile(this.lockPath, "utf8");
      const owner = JSON.parse(content) as Partial<LockOwner>;
      if (owner.ownerToken !== ownerToken) {
        return;
      }
      await rm(this.lockPath, { force: true });
    } catch (error) {
      if (!isFileNotFound(error)) {
        return;
      }
    }
  }
}
export async function readRuntimeState(statePath: string): Promise<RuntimeState | null> {
  return readStateFile(statePath);
}

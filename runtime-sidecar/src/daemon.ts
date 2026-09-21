import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { RuntimeHttpServer, type RuntimeEndpoint } from "./httpBaseline.js";
import { RuntimeLifecycle, type RuntimeState } from "./lifecycle.js";

export const DEFAULT_DATA_DIR_NAME = ".pm-runtime";
export const RUNTIME_STATE_FILE_NAME = "runtime-state.json";

export interface RuntimeDaemonOptions {
  dataDir: string;
  appVersion?: string;
  sidecarVersion?: string;
  allowedOrigins?: readonly string[];
  sessionTtlMs?: number;
}

/**
 * 本机 Runtime 进程。
 *
 * 把 BE-004 的生命周期与 BE-005 的 HTTP 基线装配成一个可启动、可停止的服务：
 * 绑定 127.0.0.1 随机端口，把 host/port/session token 写入受控 state 文件，
 * 对外提供 `/api/v1`。前端不读取该文件，只接受宿主注入的 base URL 与令牌。
 */
export class RuntimeDaemon {
  readonly dataDir: string;
  readonly statePath: string;
  readonly lifecycle: RuntimeLifecycle;
  readonly http: RuntimeHttpServer;

  private endpoint: RuntimeEndpoint | undefined;

  constructor(options: RuntimeDaemonOptions) {
    this.dataDir = resolve(options.dataDir);
    this.statePath = join(this.dataDir, RUNTIME_STATE_FILE_NAME);
    this.lifecycle = new RuntimeLifecycle({
      statePath: this.statePath,
      sessionTtlMs: options.sessionTtlMs ?? undefined
    });
    this.http = new RuntimeHttpServer({
      lifecycle: this.lifecycle,
      appVersion: options.appVersion ?? "0.1.0",
      sidecarVersion: options.sidecarVersion ?? "0.1.0",
      allowedOrigins: options.allowedOrigins ?? []
    });
  }

  async start(): Promise<RuntimeEndpoint> {
    if (this.endpoint) {
      return this.endpoint;
    }
    await mkdir(this.dataDir, { recursive: true });
    this.endpoint = await this.http.start();
    return this.endpoint;
  }

  async stop(): Promise<void> {
    if (!this.endpoint) {
      return;
    }
    this.endpoint = undefined;
    await this.http.stop();
  }

  get running(): boolean {
    return this.endpoint !== undefined;
  }

  getState(): RuntimeState | null {
    return this.lifecycle.getState();
  }
}

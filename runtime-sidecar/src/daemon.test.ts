import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RuntimeDaemon } from "./daemon.js";

/**
 * 这些用例走真实回环 HTTP（node 原生 fetch），不是 inject。
 * 目的是覆盖 B-6 那条链路：浏览器能拿到的地址、端口与令牌，Runtime 必须真的在监听并真的接受。
 */
describe("RuntimeDaemon", () => {
  let directory: string;
  let daemon: RuntimeDaemon | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "pm-runtime-daemon-"));
  });

  afterEach(async () => {
    await daemon?.stop();
    daemon = undefined;
    await rm(directory, { recursive: true, force: true });
  });

  it("serves health over a real loopback socket and persists the endpoint state", async () => {
    daemon = new RuntimeDaemon({
      dataDir: directory,
      allowedOrigins: ["http://127.0.0.1:1420"]
    });

    const endpoint = await daemon.start();
    expect(endpoint.host).toBe("127.0.0.1");
    expect(endpoint.port).toBeGreaterThan(0);

    const response = await fetch(`http://${endpoint.host}:${endpoint.port}/api/v1/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { status: string }; requestId: string };
    expect(body.data.status).toBe("ready");
    expect(body.requestId).toBe(response.headers.get("x-request-id"));

    const state = JSON.parse(await readFile(daemon.statePath, "utf8")) as {
      host: string;
      port: number;
      sessionToken: string;
      expiresAt: string;
    };
    expect(state.host).toBe(endpoint.host);
    expect(state.port).toBe(endpoint.port);
    expect(state.sessionToken).toBe(endpoint.sessionToken);
    expect(state.expiresAt).toBe(endpoint.expiresAt);
    expect(daemon.getState()?.sessionToken).toBe(endpoint.sessionToken);
  });

  it("rejects an origin outside the allowlist and accepts an allowed one", async () => {
    daemon = new RuntimeDaemon({
      dataDir: directory,
      allowedOrigins: ["http://127.0.0.1:1420"]
    });
    const endpoint = await daemon.start();
    const url = `http://${endpoint.host}:${endpoint.port}/api/v1/health`;

    const rejected = await fetch(url, { headers: { origin: "https://unexpected.example" } });
    expect(rejected.status).toBe(403);

    const allowed = await fetch(url, { headers: { origin: "http://127.0.0.1:1420" } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:1420");
  });

  it("treats a repeated start as idempotent and keeps serving health", async () => {
    daemon = new RuntimeDaemon({ dataDir: directory });
    const first = await daemon.start();
    const second = await daemon.start();
    expect(second.port).toBe(first.port);
    expect(second.sessionToken).toBe(first.sessionToken);

    const response = await fetch(`http://${first.host}:${first.port}/api/v1/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { status: string } };
    expect(body.data.status).toBe("ready");
  });

  it("stops listening and removes the state file on shutdown", async () => {
    daemon = new RuntimeDaemon({ dataDir: directory });
    const endpoint = await daemon.start();
    const statePath = daemon.statePath;
    expect(daemon.running).toBe(true);

    await daemon.stop();
    expect(daemon.running).toBe(false);
    expect(daemon.getState()).toBeNull();
    await expect(readFile(statePath, "utf8")).rejects.toThrow();
    await expect(
      fetch(`http://${endpoint.host}:${endpoint.port}/api/v1/health`)
    ).rejects.toThrow();
  });
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RuntimeLifecycle,
  RuntimeLifecycleError,
  readRuntimeState
} from "./lifecycle.js";

describe("RuntimeLifecycle", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "pm-runtime-lifecycle-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("writes a loopback state with a random port and expiring session token", async () => {
    const statePath = join(directory, "runtime-state.json");
    let current = new Date("2026-09-21T10:00:00.000Z");
    const lifecycle = new RuntimeLifecycle({
      statePath,
      sessionTtlMs: 1_000,
      now: () => current,
      pid: 41001,
      allocatePort: async () => 43123,
      isProcessAlive: () => false
    });

    const state = await lifecycle.start();
    expect(state.host).toBe("127.0.0.1");
    expect(state.port).toBe(43123);
    expect(state.pid).toBe(41001);
    expect(state.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(lifecycle.isSessionTokenValid(state.sessionToken)).toBe(true);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(state);

    current = new Date("2026-09-21T10:00:01.000Z");
    expect(lifecycle.isSessionTokenValid(state.sessionToken)).toBe(false);
    await lifecycle.stop();
    expect(await readRuntimeState(statePath)).toBeNull();
  });

  it("rejects a second live instance and releases state on graceful stop", async () => {
    const statePath = join(directory, "runtime-state.json");
    const first = new RuntimeLifecycle({
      statePath,
      pid: 41002,
      allocatePort: async () => 43124,
      isProcessAlive: (pid) => pid === 41002
    });
    const second = new RuntimeLifecycle({
      statePath,
      pid: 41003,
      allocatePort: async () => 43125,
      isProcessAlive: (pid) => pid === 41002
    });

    await first.start();
    await expect(second.start()).rejects.toMatchObject({
      code: "RUNTIME_ALREADY_RUNNING"
    });
    await first.stop();
    await expect(first.stop()).resolves.toBeUndefined();
    await expect(second.start()).resolves.toMatchObject({ port: 43125 });
    await second.stop();
  });

  it("recovers stale locks and state left by a crashed process", async () => {
    const statePath = join(directory, "runtime-state.json");
    await writeFile(statePath, JSON.stringify({ stateVersion: 0, stale: true }), "utf8");
    await writeFile(`${statePath}.lock`, JSON.stringify({ pid: 49999, ownerToken: "stale" }), "utf8");
    const lifecycle = new RuntimeLifecycle({
      statePath,
      pid: 41004,
      allocatePort: async () => 43126,
      isProcessAlive: () => false
    });

    await expect(lifecycle.start()).resolves.toMatchObject({ port: 43126 });
    await expect(readFile(statePath, "utf8")).resolves.toContain('"stateVersion":1');
    await lifecycle.stop();
  });

  it("does not leave a lock or state when port allocation fails", async () => {
    const statePath = join(directory, "runtime-state.json");
    const lifecycle = new RuntimeLifecycle({
      statePath,
      allocatePort: async () => {
        throw new RuntimeLifecycleError("RUNTIME_PORT_UNAVAILABLE", "Loopback port is unavailable");
      },
      isProcessAlive: () => false
    });

    await expect(lifecycle.start()).rejects.toMatchObject({
      code: "RUNTIME_PORT_UNAVAILABLE"
    });
    await expect(readRuntimeState(statePath)).resolves.toBeNull();
    await expect(readFile(`${statePath}.lock`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

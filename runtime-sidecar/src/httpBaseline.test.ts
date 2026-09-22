import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseHealthResponse } from "@pm/contracts";

import { RuntimeLifecycle } from "./lifecycle.js";
import { RuntimeHttpServer } from "./httpBaseline.js";

describe("RuntimeHttpServer", () => {
  let directory: string;
  let server: RuntimeHttpServer | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "pm-runtime-http-"));
  });

  afterEach(async () => {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
    server = undefined;
  });

  it("serves public health and protects business routes with the session token", async () => {
    const lifecycle = new RuntimeLifecycle({
      statePath: join(directory, "runtime-state.json"),
      pid: 42001,
      isProcessAlive: () => false
    });
    server = new RuntimeHttpServer({
      lifecycle,
      allowedOrigins: ["tauri://localhost"],
      registerRoutes: (app) => {
        app.get("/api/v1/protected", async () => ({ ok: true }));
      }
    });

    const endpoint = await server.start();
    const health = await server.inject({ method: "GET", url: "/api/v1/health" });
    expect(health.statusCode).toBe(200);
    expect(health.headers["x-request-id"]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(health.json()).toMatchObject({
      data: { status: "ready", schemaVersion: "0.1" },
      requestId: health.headers["x-request-id"]
    });

    const unauthorized = await server.inject({ method: "GET", url: "/api/v1/protected" });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toMatchObject({
      error: { code: "UNAUTHORIZED_LOCAL_CLIENT", retryable: false },
      requestId: unauthorized.headers["x-request-id"]
    });

    const authorized = await server.inject({
      method: "GET",
      url: "/api/v1/protected",
      headers: { "x-pm-session": endpoint.sessionToken }
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toEqual({ ok: true });
  });

  it("applies exact CORS rules and handles malformed JSON and body limits", async () => {
    const lifecycle = new RuntimeLifecycle({
      statePath: join(directory, "runtime-state.json"),
      pid: 42002,
      isProcessAlive: () => false
    });
    server = new RuntimeHttpServer({
      lifecycle,
      bodyLimitBytes: 32,
      allowedOrigins: ["tauri://localhost"],
      registerRoutes: (app) => {
        app.post("/api/v1/echo", async (request) => request.body);
      }
    });

    const endpoint = await server.start();
    const preflight = await server.inject({
      method: "OPTIONS",
      url: "/api/v1/echo",
      headers: { origin: "tauri://localhost" }
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("tauri://localhost");
    // 前端每个请求都带 X-Request-Id；允许头漏掉它，浏览器 preflight 会失败并静默拦截请求。见 COM-029。
    expect(preflight.headers["access-control-allow-headers"]).toBe(
      "X-PM-Session, X-Request-Id, Content-Type, Idempotency-Key"
    );

    const forbiddenOrigin = await server.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { origin: "https://unexpected.example" }
    });
    expect(forbiddenOrigin.statusCode).toBe(403);

    const malformed = await server.inject({
      method: "POST",
      url: "/api/v1/echo",
      headers: {
        "content-type": "application/json",
        "x-pm-session": endpoint.sessionToken
      },
      payload: "{"
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe("INVALID_ARGUMENT");

    const tooLarge = await server.inject({
      method: "POST",
      url: "/api/v1/echo",
      headers: {
        "content-type": "application/json",
        "x-pm-session": endpoint.sessionToken
      },
      payload: JSON.stringify({ value: "this payload exceeds the limit" })
    });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json().error.code).toBe("INVALID_ARGUMENT");
  });

  it("answers unknown routes with the shared error envelope instead of Fastify's default body", async () => {
    const lifecycle = new RuntimeLifecycle({
      statePath: join(directory, "runtime-state.json"),
      pid: 42003,
      isProcessAlive: () => false
    });
    server = new RuntimeHttpServer({
      lifecycle,
      allowedOrigins: ["tauri://localhost"]
    });

    const endpoint = await server.start();
    const missing = await server.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: { "x-pm-session": endpoint.sessionToken }
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["x-request-id"]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(missing.json()).toMatchObject({
      error: { code: "INVALID_ARGUMENT", message: "Route not found" },
      requestId: missing.headers["x-request-id"]
    });
  });

  it("keeps health status inside the contract four-state enum and never returns starting (COM-051)", async () => {
    const lifecycle = new RuntimeLifecycle({
      statePath: join(directory, "runtime-state.json"),
      pid: 42004,
      isProcessAlive: () => false
    });
    server = new RuntimeHttpServer({ lifecycle });

    const beforeStart = await server.inject({ method: "GET", url: "/api/v1/health" });
    expect(beforeStart.statusCode).toBe(200);
    expect(beforeStart.json().data.status).toBe("unavailable");
    expect(() => parseHealthResponse(beforeStart.json().data)).not.toThrow();

    await server.start();
    const running = await server.inject({ method: "GET", url: "/api/v1/health" });
    expect(running.statusCode).toBe(200);
    expect(running.json().data.status).toBe("ready");
    expect(() => parseHealthResponse(running.json().data)).not.toThrow();
    expect(JSON.stringify(running.json())).not.toContain("starting");
  });
});

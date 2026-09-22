import { randomBytes } from "node:crypto";

import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type InjectOptions
} from "fastify";

import type {
  ApiErrorCode,
  ErrorDetail,
  ErrorEnvelope,
  RequestId,
  SuccessEnvelope
} from "../../packages/contracts/src/types.js";
import { RuntimeLifecycle, type RuntimeState } from "./lifecycle.js";

export const DEFAULT_BODY_LIMIT_BYTES = 12 * 1024 * 1024;
export const SESSION_HEADER = "x-pm-session" as const;
// 前端每个请求都发送 X-Request-Id；CORS 允许头漏掉它会让浏览器 preflight 失败并静默拦截请求，
// 页面因此恒停在“本地服务尚未就绪”。见 COM-029。
export const ALLOWED_REQUEST_HEADERS = "X-PM-Session, X-Request-Id, Content-Type, Idempotency-Key" as const;

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PUBLIC_HEALTH_PATH = "/api/v1/health";

export interface RuntimeHttpServerOptions {
  lifecycle: RuntimeLifecycle;
  appVersion?: string;
  sidecarVersion?: string;
  bodyLimitBytes?: number;
  allowedOrigins?: readonly string[];
  now?: () => Date;
  registerRoutes?: (app: FastifyInstance) => void;
}

export interface RuntimeEndpoint {
  host: RuntimeState["host"];
  port: number;
  sessionToken: string;
  expiresAt: string;
}

export class RuntimeHttpError extends Error {
  constructor(readonly code: "RUNTIME_HTTP_LISTEN_FAILED", message: string, readonly cause?: unknown) {
    super(message);
    this.name = "RuntimeHttpError";
  }
}

function encodeCrockford(value: bigint, length: number): string {
  let encoded = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    encoded = ULID_ALPHABET[Number(remaining & 31n)] + encoded;
    remaining >>= 5n;
  }
  return encoded;
}

export function createRequestId(now: Date = new Date()): RequestId {
  const timestamp = encodeCrockford(BigInt(now.getTime()), 10);
  const entropy = encodeCrockford(BigInt(`0x${randomBytes(10).toString("hex")}`), 16);
  return `${timestamp}${entropy}` as RequestId;
}

function errorResponse(
  reply: FastifyReply,
  requestId: RequestId,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  retryable = false,
  details?: ErrorDetail[]
): FastifyReply {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
      retryable,
      ...(details && details.length > 0 ? { details: details.slice(0, 100) } : {})
    },
    requestId
  };
  return reply.code(statusCode).send(body);
}

function requestHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function publicPath(request: FastifyRequest): string {
  return request.url.split("?", 1)[0];
}

function validationDetails(error: unknown): ErrorDetail[] | undefined {
  if (!error || typeof error !== "object" || !("validation" in error) || !Array.isArray(error.validation)) {
    return undefined;
  }

  return error.validation.slice(0, 100).map((item: unknown) => {
    const value = item as { instancePath?: unknown; keyword?: unknown; message?: unknown };
    return {
      path: typeof value.instancePath === "string" && value.instancePath.length > 0
        ? value.instancePath
        : "/",
      rule: typeof value.keyword === "string" ? value.keyword : "validation",
      ...(typeof value.message === "string" ? { message: value.message } : {})
    };
  });
}

export class RuntimeHttpServer {
  private readonly app: FastifyInstance;
  private readonly lifecycle: RuntimeLifecycle;
  private readonly appVersion: string;
  private readonly sidecarVersion: string;
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly now: () => Date;
  private readonly requestIds = new WeakMap<FastifyRequest, RequestId>();
  private endpoint: RuntimeEndpoint | undefined;

  constructor(options: RuntimeHttpServerOptions) {
    const bodyLimitBytes = options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES;
    if (!Number.isInteger(bodyLimitBytes) || bodyLimitBytes <= 0) {
      throw new RangeError("bodyLimitBytes must be a positive integer");
    }

    this.lifecycle = options.lifecycle;
    this.appVersion = options.appVersion ?? "0.1.0";
    this.sidecarVersion = options.sidecarVersion ?? "0.1.0";
    this.allowedOrigins = new Set(options.allowedOrigins ?? []);
    this.now = options.now ?? (() => new Date());
    this.app = Fastify({ bodyLimit: bodyLimitBytes, logger: false });

    this.app.addHook("onRequest", async (request, reply) => {
      const requestId = createRequestId(this.now());
      this.requestIds.set(request, requestId);
      reply.header("X-Request-Id", requestId);

      const origin = requestHeader(request, "origin");
      if (origin) {
        if (!this.allowedOrigins.has(origin)) {
          errorResponse(reply, requestId, 403, "UNAUTHORIZED_LOCAL_CLIENT", "Origin is not allowed");
          return;
        }
        reply
          .header("Access-Control-Allow-Origin", origin)
          .header("Access-Control-Allow-Headers", ALLOWED_REQUEST_HEADERS)
          .header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
          .header("Vary", "Origin");
      }

      if (request.method === "OPTIONS") {
        reply.code(204).send();
        return;
      }

      if (publicPath(request) === PUBLIC_HEALTH_PATH) {
        return;
      }

      const token = requestHeader(request, SESSION_HEADER);
      if (!token || !this.lifecycle.isSessionTokenValid(token)) {
        errorResponse(reply, requestId, 401, "UNAUTHORIZED_LOCAL_CLIENT", "Local session is invalid");
        return;
      }
    });

    this.app.setErrorHandler((error, request, reply) => {
      const requestId = this.requestIds.get(request) ?? createRequestId(this.now());
      const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") {
        return errorResponse(reply, requestId, 413, "INVALID_ARGUMENT", "Request body is too large");
      }
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY") {
        return errorResponse(reply, requestId, 400, "INVALID_ARGUMENT", "Request body is invalid JSON");
      }

      const statusCode = typeof error === "object" && error && "statusCode" in error &&
        typeof error.statusCode === "number" ? error.statusCode : 500;
      const message = statusCode === 404 ? "Route not found" : "Request failed";
      return errorResponse(
        reply,
        requestId,
        statusCode,
        statusCode === 404 ? "INVALID_ARGUMENT" : "INTERNAL_ERROR",
        message,
        statusCode >= 500,
        validationDetails(error)
      );
    });

    // Fastify 默认 404 返回 `{statusCode,error,message}`，不经过上面的错误处理器，也不经过本文件的
    // envelope。前端 client.ts 解析失败后会降级成“Runtime 请求失败。”，把“路由不存在”伪装成“服务不可用”。
    // 这里显式注册 notFound，保证未实现的路由也返回统一错误 envelope 并带 requestId。见 COM-030。
    this.app.setNotFoundHandler((request, reply) => {
      const requestId = this.requestIds.get(request) ?? createRequestId(this.now());
      return errorResponse(reply, requestId, 404, "INVALID_ARGUMENT", "Route not found");
    });

    this.app.get(PUBLIC_HEALTH_PATH, async (request) => {
      const requestId = this.requestIds.get(request) ?? createRequestId(this.now());
      const data = {
        appVersion: this.appVersion,
        sidecarVersion: this.sidecarVersion,
        schemaVersion: "0.1",
        // 合同四态（API_CONTRACT §3）内取值，绝不返回 starting。
        // 能被请求到时 listen 必已完成、endpoint 必已赋值，恒为 ready；
        // endpoint 为空只可能出现在未 start 的 inject 测试路径，语义为 unavailable。见 COM-051。
        status: this.endpoint ? "ready" : "unavailable",
        dataDirMasked: "[local-data]"
      } as const;
      return { data, requestId } satisfies SuccessEnvelope<typeof data>;
    });

    options.registerRoutes?.(this.app);
  }

  async start(): Promise<RuntimeEndpoint> {
    if (this.endpoint) {
      return this.endpoint;
    }

    const state = await this.lifecycle.start();
    try {
      await this.app.listen({ host: state.host, port: state.port });
      this.endpoint = {
        host: state.host,
        port: state.port,
        sessionToken: state.sessionToken,
        expiresAt: state.expiresAt
      };
      return this.endpoint;
    } catch (error) {
      await this.lifecycle.stop();
      throw new RuntimeHttpError("RUNTIME_HTTP_LISTEN_FAILED", "Runtime HTTP server could not start", error);
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.app.server.listening) {
        await this.app.close();
      }
    } finally {
      this.endpoint = undefined;
      await this.lifecycle.stop();
    }
  }

  inject(options: InjectOptions | string) {
    return this.app.inject(options);
  }
}

export const PROTOCOL_VERSION = "0.1" as const;
export const APP_VERSION = "0.1.0" as const;

export type RuntimeStatus = "starting" | "ready" | "stopping" | "error";

export interface RuntimeEndpoint {
  port: number;
  pid: number;
  instanceId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  token: string;
}

export interface RpcRequest {
  protocol_version: typeof PROTOCOL_VERSION;
  operation: string;
  params: Record<string, unknown>;
}

export interface RpcError {
  error: { code: string; message: string; details?: unknown };
}

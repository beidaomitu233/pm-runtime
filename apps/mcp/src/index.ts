import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const args = process.argv.slice(2);
const dataIndex = args.indexOf("--data-dir");
const dataRoot = resolve(dataIndex >= 0 && args[dataIndex + 1] ? args[dataIndex + 1] : join(process.cwd(), ".local-data"));
const endpointPath = join(dataRoot, "runtime", "endpoint.json");

async function callRuntime(operation: string, params: Record<string, unknown> = {}) {
  const endpoint = JSON.parse(await readFile(endpointPath, "utf8")) as { port: number; token: string };
  const response = await fetch(`http://127.0.0.1:${endpoint.port}/internal/rpc`, {
    method: "POST",
    headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json", host: `127.0.0.1:${endpoint.port}` },
    body: JSON.stringify({ protocol_version: "0.1", operation, params })
  });
  return await response.json();
}

const server = new McpServer({ name: "pm-runtime", version: "0.1.0" });
server.registerTool("pm.runtime.status", {
  title: "Runtime status",
  description: "Read the local PM Runtime readiness status.",
  inputSchema: { }
}, async () => {
  try {
    const result = await callRuntime("runtime.status");
    const isError = Boolean((result as { error?: unknown }).error);
    return { isError, content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: "runtime_unavailable", message: String(error) } }) }] };
  }
});

await server.connect(new StdioServerTransport());

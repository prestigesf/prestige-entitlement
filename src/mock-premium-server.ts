import type { JsonRpcMessage } from "prestige-mcp";

export const PREMIUM_SERVER_INFO = {
  name: "prestige-entitlement-sample",
  version: "0.1.0",
} as const;

export const PREMIUM_SAMPLE_TOOLS = [
  {
    name: "echo",
    description: "Return the provided text unchanged.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "add",
    description: "Add two numbers.",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "goldtrac_trace",
    description: "GoldTrac evidence spine. Requires prestige_pro.",
    inputSchema: {
      type: "object",
      properties: { note: { type: "string" } },
    },
  },
  {
    name: "premium_forecast",
    description: "Premium forecast tool. Requires prestige_pro.",
    inputSchema: {
      type: "object",
      properties: { horizon: { type: "number" } },
    },
  },
] as const;

function ok(id: JsonRpcMessage["id"], result: unknown): JsonRpcMessage {
  return { jsonrpc: "2.0", id, result };
}

function err(
  id: JsonRpcMessage["id"],
  code: number,
  message: string,
): JsonRpcMessage {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolText(text: string, isError = false): JsonRpcMessage["result"] {
  return { content: [{ type: "text", text }], isError };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function callTool(params: unknown): JsonRpcMessage["result"] {
  const p = asRecord(params);
  const name = typeof p.name === "string" ? p.name : "";
  const args = asRecord(p.arguments);

  if (name === "echo") {
    const text = typeof args.text === "string" ? args.text : "";
    return toolText(text);
  }
  if (name === "add") {
    const a = Number(args.a);
    const b = Number(args.b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return toolText("add requires numeric a and b", true);
    }
    return toolText(String(a + b));
  }
  if (name === "goldtrac_trace") {
    const note = typeof args.note === "string" ? args.note : "ok";
    return toolText(`goldtrac:${note}`);
  }
  if (name === "premium_forecast") {
    return toolText("forecast:stable");
  }
  return toolText(`Unknown tool: ${name}`, true);
}

export function handlePremiumMcp(message: JsonRpcMessage): JsonRpcMessage | null {
  const method = message.method;
  if (!method) return null;
  if (method.startsWith("notifications/")) return null;

  const id = message.id;
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: true } },
        serverInfo: PREMIUM_SERVER_INFO,
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: PREMIUM_SAMPLE_TOOLS });
    case "tools/call":
      return ok(id, callTool(message.params));
    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

export function handlePremiumMcpLine(raw: string): string | null {
  let message: JsonRpcMessage;
  try {
    message = JSON.parse(raw) as JsonRpcMessage;
  } catch {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  }
  const response = handlePremiumMcp(message);
  return response ? JSON.stringify(response) : null;
}

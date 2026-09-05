import { isPremiumTool, requiredEntitlement } from "./policy.ts";
import type { EntitlementRuntime } from "./runtime.ts";
import type { JsonRpcMessage } from "prestige-mcp";
import { EXPAND_TOOL_NAME } from "prestige-mcp";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toolName(tool: unknown): string | null {
  if (!isRecord(tool) || typeof tool.name !== "string") return null;
  return tool.name;
}

function previewStub(name: string, entitlement: string): Record<string, unknown> {
  return {
    name,
    description: `Locked. Requires ${entitlement}. Call is denied until the entitlement is active.`,
    inputSchema: { type: "object", properties: {} },
    _meta: {
      prestige: { locked: true, entitlement },
    },
  };
}

export function previewOrPassTool(
  tool: unknown,
  runtime: EntitlementRuntime,
): unknown {
  const name = toolName(tool);
  if (!name || name === EXPAND_TOOL_NAME) return tool;
  if (!isPremiumTool(runtime.policy, name)) return tool;
  const entitlement = requiredEntitlement(runtime.policy, name);
  if (!entitlement) return tool;
  if (runtime.cache.health === "unverified") {
    return previewStub(name, entitlement);
  }
  if (runtime.cache.hasActive(runtime.binding.customerId, entitlement)) {
    return tool;
  }
  return previewStub(name, entitlement);
}

export function filterCatalogRaw(
  raw: string,
  runtime: EntitlementRuntime,
): string | undefined {
  let message: JsonRpcMessage;
  try {
    message = JSON.parse(raw) as JsonRpcMessage;
  } catch {
    return undefined;
  }
  if (message.error !== undefined) return undefined;
  if (!isRecord(message.result) || !Array.isArray(message.result.tools)) {
    return undefined;
  }
  const tools = message.result.tools.map((tool) => previewOrPassTool(tool, runtime));
  const next: JsonRpcMessage = {
    ...message,
    result: { ...message.result, tools },
  };
  const out = JSON.stringify(next);
  return out === raw ? undefined : out;
}

export function filterExpandRespond(
  respond: string,
  runtime: EntitlementRuntime,
): string | undefined {
  let message: JsonRpcMessage;
  try {
    message = JSON.parse(respond) as JsonRpcMessage;
  } catch {
    return undefined;
  }
  if (!isRecord(message.result)) return undefined;
  const structured = isRecord(message.result.structuredContent)
    ? message.result.structuredContent
    : undefined;
  if (!structured || !Array.isArray(structured.tools)) return undefined;
  const tools = structured.tools.map((tool) => previewOrPassTool(tool, runtime));
  const text = JSON.stringify({ tools });
  const next: JsonRpcMessage = {
    ...message,
    result: {
      ...message.result,
      structuredContent: { ...structured, tools },
      content: [{ type: "text", text }],
    },
  };
  return JSON.stringify(next);
}

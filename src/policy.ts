import { ENTITLEMENT_PRO, type ToolPolicy } from "./types.ts";
import { EXPAND_TOOL_NAME } from "prestige-mcp";

const FREE = new Set(["echo", "add", EXPAND_TOOL_NAME]);

const PREMIUM = new Map<string, string>([
  ["goldtrac_trace", ENTITLEMENT_PRO],
  ["premium_forecast", ENTITLEMENT_PRO],
]);

export function defaultToolPolicy(): ToolPolicy {
  return { required: new Map(PREMIUM) };
}

export function requiredEntitlement(
  policy: ToolPolicy,
  toolName: string,
): string | undefined {
  return policy.required.get(toolName);
}

export function isFreeTool(policy: ToolPolicy, toolName: string): boolean {
  if (FREE.has(toolName)) return true;
  return requiredEntitlement(policy, toolName) === undefined;
}

export function isPremiumTool(policy: ToolPolicy, toolName: string): boolean {
  return requiredEntitlement(policy, toolName) !== undefined;
}

export const UPGRADE_URL_DEFAULT =
  "https://app.revenuecat.com/checkout/prestige_pro";

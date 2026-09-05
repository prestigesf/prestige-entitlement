import { requiredEntitlement } from "./policy.ts";
import { makeEvidenceEvent } from "./evidence.ts";
import {
  ENTITLEMENT_REQUIRED,
  type EntitlementErrorBody,
} from "./types.ts";
import type { EntitlementRuntime } from "./runtime.ts";
import type { InterceptContext, InterceptResult, JsonRpcMessage } from "prestige-mcp";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function toolNameFromCall(message: JsonRpcMessage): string | undefined {
  if (!isRecord(message.params)) return undefined;
  return typeof message.params.name === "string" ? message.params.name : undefined;
}

export function entitlementRequiredResult(
  ctx: InterceptContext,
  body: EntitlementErrorBody,
): InterceptResult {
  return {
    respond: JSON.stringify({
      jsonrpc: ctx.message.jsonrpc ?? "2.0",
      id: ctx.message.id,
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: `${ENTITLEMENT_REQUIRED}: ${body.entitlement} required to call ${body.tool}`,
          },
        ],
        structuredContent: body,
      },
    }),
  };
}

/**
 * Deny premium tools/call locally when the cache has no active grant.
 * Fail closed if cache health is unverified (RevenueCat outage / never synced).
 * Free tools always pass, including during outage.
 * Does not meter; boolean entitlement only.
 */
export function denyPremiumCall(
  ctx: InterceptContext,
  runtime: EntitlementRuntime,
): InterceptResult | void {
  const tool = toolNameFromCall(ctx.message);
  if (!tool) return;

  const entitlement = requiredEntitlement(runtime.policy, tool);
  if (!entitlement) {
    runtime.evidence.append(
      makeEvidenceEvent({
        kind: "mcp.authorization",
        principal: runtime.binding.principal,
        tool,
        decision: "allow",
        catalogEpoch: runtime.cache.catalogEpoch,
      }),
    );
    return;
  }

  const outage = runtime.cache.health === "unverified";
  const active = runtime.cache.hasActive(runtime.binding.customerId, entitlement);

  if (outage || !active) {
    runtime.evidence.append(
      makeEvidenceEvent({
        kind: "mcp.authorization",
        principal: runtime.binding.principal,
        tool,
        decision: "deny",
        entitlement,
        catalogEpoch: runtime.cache.catalogEpoch,
      }),
    );
    return entitlementRequiredResult(ctx, {
      code: ENTITLEMENT_REQUIRED,
      entitlement,
      upgradeUrl: runtime.upgradeUrl,
      tool,
    });
  }

  runtime.evidence.append(
    makeEvidenceEvent({
      kind: "mcp.authorization",
      principal: runtime.binding.principal,
      tool,
      decision: "allow",
      entitlement,
      catalogEpoch: runtime.cache.catalogEpoch,
    }),
  );
}

export function recordExecution(runtime: EntitlementRuntime, tool: string): void {
  const entitlement = requiredEntitlement(runtime.policy, tool);
  runtime.evidence.append(
    makeEvidenceEvent({
      kind: "mcp.execution",
      principal: runtime.binding.principal,
      tool,
      decision: "allow",
      entitlement,
      catalogEpoch: runtime.cache.catalogEpoch,
    }),
  );
}

import {
  createDefaultIntercept,
  type DefaultInterceptOptions,
} from "prestige-mcp";
import type { InterceptMap } from "prestige-mcp";
import { filterCatalogRaw, filterExpandRespond } from "./catalog.ts";
import { denyPremiumCall, recordExecution, toolNameFromCall } from "./gate.ts";
import type { EntitlementRuntime } from "./runtime.ts";

/**
 * Additive intercept map. Wraps createDefaultIntercept so entitlement
 * filtering runs AFTER schema compression and tiered loading.
 *
 * Do not pass this as extra onResponse — extra sees original upstream
 * bytes and would undo compression.
 */
export function createEntitlementIntercept(
  runtime: EntitlementRuntime,
  defaultOptions: DefaultInterceptOptions = {},
): InterceptMap {
  const inner = createDefaultIntercept({}, defaultOptions);
  const list = inner["tools/list"];
  const call = inner["tools/call"];

  return {
    "tools/list": {
      onRequest: (ctx) => list?.onRequest?.(ctx),
      async onResponse(ctx) {
        const a = await list?.onResponse?.(ctx);
        const raw = a?.raw ?? ctx.raw;
        const filtered = filterCatalogRaw(raw, runtime);
        if (filtered !== undefined) return { raw: filtered };
        return a;
      },
    },
    "tools/call": {
      async onRequest(ctx) {
        const a = await call?.onRequest?.(ctx);
        if (a?.respond !== undefined) {
          const filtered = filterExpandRespond(a.respond, runtime);
          return { respond: filtered ?? a.respond };
        }
        const denied = denyPremiumCall(ctx, runtime);
        if (denied) return denied;
        const tool = toolNameFromCall(ctx.message);
        if (tool) runtimePendingForward.set(runtime, tool);
        return a;
      },
      async onResponse(ctx) {
        const a = await call?.onResponse?.(ctx);
        const tool = runtimePendingForward.get(runtime);
        if (tool) {
          runtimePendingForward.delete(runtime);
          recordExecution(runtime, tool);
        }
        return a;
      },
    },
  };
}

const runtimePendingForward = new WeakMap<EntitlementRuntime, string>();

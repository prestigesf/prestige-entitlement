import { createHash } from "node:crypto";
import type { PrincipalBinding } from "./types.ts";

/**
 * Map an authenticated PrestigeMCP principal to a RevenueCat app_user_id.
 * Override is server-configured only — never a client-supplied customer id.
 */
export function bindPrincipal(opts: {
  principal: string;
  customerIdOverride?: string;
}): PrincipalBinding {
  const principal = opts.principal.trim();
  if (!principal) {
    throw new Error("prestige principal is required");
  }
  const customerId =
    opts.customerIdOverride?.trim() || stableCustomerId(principal);
  return { principal, customerId };
}

export function stableCustomerId(principal: string): string {
  const digest = createHash("sha256")
    .update(`prestige.rc.customer:v1:${principal}`)
    .digest("hex")
    .slice(0, 24);
  return `rc_${digest}`;
}

/** Evidence-safe hash. Never store the raw principal in GoldTrac receipts. */
export function principalHash(principal: string): string {
  return createHash("sha256")
    .update(`prestige.evidence.principal:v1:${principal}`)
    .digest("hex");
}

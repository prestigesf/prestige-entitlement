import { ENTITLEMENT_PRO } from "./types.ts";
import type { EntitlementCache } from "./cache.ts";
import type { RevenueCatWebhookBody } from "./webhook.ts";

/** Sandbox signing secret. Not a real RevenueCat key. */
export const SANDBOX_WEBHOOK_SECRET = "whsec_sandbox_not_a_real_secret";

export const SANDBOX_PRINCIPAL = "prestige.dev@local";
export const SANDBOX_CUSTOMER_ID = "rc_sandbox_builder";

export type FixtureName =
  | "free"
  | "pro"
  | "expired"
  | "missing"
  | "webhook-update"
  | "outage";

export function applyFixture(cache: EntitlementCache, name: FixtureName): void {
  cache.customers.clear();
  cache.seenEventIds.clear();
  cache.catalogEpoch = 0;
  cache.markOk();

  const far = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const past = Date.now() - 60_000;

  switch (name) {
    case "free":
    case "missing":
    case "webhook-update":
      return;
    case "pro":
      cache.grant(SANDBOX_CUSTOMER_ID, ENTITLEMENT_PRO, far, "evt_fixture_pro");
      cache.rememberEvent("evt_fixture_pro");
      return;
    case "expired":
      cache.grant(SANDBOX_CUSTOMER_ID, ENTITLEMENT_PRO, past, "evt_fixture_expired");
      cache.rememberEvent("evt_fixture_expired");
      return;
    case "outage":
      cache.markUnverified();
      return;
  }
}

export function purchaseWebhook(opts?: {
  customerId?: string;
  eventId?: string;
  expirationAtMs?: number | null;
  type?: string;
}): RevenueCatWebhookBody {
  return {
    api_version: "1.0",
    event: {
      id: opts?.eventId ?? "evt_sandbox_purchase",
      type: opts?.type ?? "INITIAL_PURCHASE",
      app_user_id: opts?.customerId ?? SANDBOX_CUSTOMER_ID,
      original_app_user_id: opts?.customerId ?? SANDBOX_CUSTOMER_ID,
      entitlement_ids: [ENTITLEMENT_PRO],
      expiration_at_ms: opts?.expirationAtMs ?? Date.now() + 30 * 24 * 60 * 60 * 1000,
      event_timestamp_ms: Date.now(),
    },
  };
}

export function expirationWebhook(opts?: {
  customerId?: string;
  eventId?: string;
}): RevenueCatWebhookBody {
  return {
    api_version: "1.0",
    event: {
      id: opts?.eventId ?? "evt_sandbox_expiration",
      type: "EXPIRATION",
      app_user_id: opts?.customerId ?? SANDBOX_CUSTOMER_ID,
      entitlement_ids: [ENTITLEMENT_PRO],
      expiration_at_ms: Date.now() - 1000,
      event_timestamp_ms: Date.now(),
    },
  };
}

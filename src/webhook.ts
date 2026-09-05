import type { EntitlementCache } from "./cache.ts";
import { ENTITLEMENT_PRO } from "./types.ts";

export type RevenueCatWebhookEvent = {
  id: string;
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  transferred_from?: string[];
  transferred_to?: string[];
};

export type RevenueCatWebhookBody = {
  api_version?: string;
  event: RevenueCatWebhookEvent;
};

export type WebhookApplyResult = {
  applied: boolean;
  duplicate: boolean;
  changed: boolean;
  customerId?: string;
  entitlements: string[];
  type: string;
  eventId: string;
};

function entitlementsOf(event: RevenueCatWebhookEvent): string[] {
  const ids = event.entitlement_ids?.filter((id) => typeof id === "string") ?? [];
  return ids.length > 0 ? ids : [ENTITLEMENT_PRO];
}

function customerIdOf(event: RevenueCatWebhookEvent): string | undefined {
  const id = event.app_user_id ?? event.original_app_user_id;
  return id && id.trim() ? id.trim() : undefined;
}

/**
 * Apply a verified RevenueCat webhook to the local cache.
 * CANCELLATION keeps access until expiration_at_ms.
 * EXPIRATION revokes immediately.
 * This is entitlement gating, not per-call metering.
 */
export function applyRevenueCatEvent(
  cache: EntitlementCache,
  body: RevenueCatWebhookBody,
): WebhookApplyResult {
  const event = body.event;
  const eventId = event.id;
  const type = event.type;
  const entitlements = entitlementsOf(event);
  const customerId = customerIdOf(event);

  if (!eventId || !type) {
    return {
      applied: false,
      duplicate: false,
      changed: false,
      entitlements,
      type: type ?? "",
      eventId: eventId ?? "",
    };
  }

  if (!cache.rememberEvent(eventId)) {
    return {
      applied: false,
      duplicate: true,
      changed: false,
      customerId,
      entitlements,
      type,
      eventId,
    };
  }

  let changed = false;

  if (type === "TRANSFER") {
    for (const from of event.transferred_from ?? []) {
      for (const ent of entitlements) {
        if (cache.revoke(from, ent)) changed = true;
      }
    }
    for (const to of event.transferred_to ?? []) {
      for (const ent of entitlements) {
        if (cache.grant(to, ent, event.expiration_at_ms ?? null, eventId)) {
          changed = true;
        }
      }
    }
    return { applied: true, duplicate: false, changed, customerId, entitlements, type, eventId };
  }

  if (!customerId) {
    return { applied: false, duplicate: false, changed: false, entitlements, type, eventId };
  }

  switch (type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "TEST":
    case "NON_RENEWING_PURCHASE":
      for (const ent of entitlements) {
        if (cache.grant(customerId, ent, event.expiration_at_ms ?? null, eventId)) {
          changed = true;
        }
      }
      break;
    case "EXPIRATION":
      for (const ent of entitlements) {
        if (cache.revoke(customerId, ent)) changed = true;
      }
      break;
    case "CANCELLATION":
      // Access remains until expiration_at_ms. Refresh the stored expiry.
      for (const ent of entitlements) {
        if (cache.grant(customerId, ent, event.expiration_at_ms ?? null, eventId)) {
          changed = true;
        }
      }
      break;
    default:
      break;
  }

  return { applied: true, duplicate: false, changed, customerId, entitlements, type, eventId };
}

export function parseWebhookBody(raw: Buffer): RevenueCatWebhookBody {
  const parsed: unknown = JSON.parse(raw.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("webhook body is not an object");
  }
  const rec = parsed as Record<string, unknown>;
  if (!rec.event || typeof rec.event !== "object") {
    throw new Error("webhook missing event");
  }
  return rec as unknown as RevenueCatWebhookBody;
}

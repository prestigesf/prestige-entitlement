import type {
  CacheHealth,
  CustomerEntitlements,
  EntitlementRecord,
} from "./types.ts";

/**
 * Local entitlement cache. Webhooks write. tools/call only reads.
 * Never call RevenueCat on the execution path.
 */
export class EntitlementCache {
  readonly customers = new Map<string, CustomerEntitlements>();
  readonly seenEventIds = new Set<string>();
  health: CacheHealth = "ok";
  catalogEpoch = 0;

  constructor(readonly nowMs: () => number = () => Date.now()) {}

  markUnverified(): void {
    this.health = "unverified";
  }

  markOk(): void {
    this.health = "ok";
  }

  rememberEvent(eventId: string): boolean {
    if (this.seenEventIds.has(eventId)) return false;
    this.seenEventIds.add(eventId);
    return true;
  }

  get(customerId: string): CustomerEntitlements {
    let row = this.customers.get(customerId);
    if (!row) {
      row = { customerId, grants: new Map() };
      this.customers.set(customerId, row);
    }
    return row;
  }

  grant(
    customerId: string,
    entitlement: string,
    expiresAtMs: number | null,
    sourceEventId?: string,
  ): boolean {
    const row = this.get(customerId);
    const prev = row.grants.get(entitlement);
    const next: EntitlementRecord = { entitlement, expiresAtMs, sourceEventId };
    const changed =
      !prev ||
      prev.expiresAtMs !== expiresAtMs ||
      prev.sourceEventId !== sourceEventId;
    row.grants.set(entitlement, next);
    if (changed) this.catalogEpoch += 1;
    this.health = "ok";
    return changed;
  }

  revoke(customerId: string, entitlement: string): boolean {
    const row = this.customers.get(customerId);
    if (!row || !row.grants.has(entitlement)) return false;
    row.grants.delete(entitlement);
    this.catalogEpoch += 1;
    this.health = "ok";
    return true;
  }

  hasActive(customerId: string, entitlement: string): boolean {
    const rec = this.customers.get(customerId)?.grants.get(entitlement);
    if (!rec) return false;
    if (rec.expiresAtMs === null) return true;
    return rec.expiresAtMs > this.nowMs();
  }

  snapshot(customerId: string): {
    health: CacheHealth;
    entitlements: Array<{ id: string; active: boolean; expiresAtMs: number | null }>;
  } {
    const row = this.customers.get(customerId);
    const entitlements = row
      ? [...row.grants.values()].map((g) => ({
          id: g.entitlement,
          active: this.hasActive(customerId, g.entitlement),
          expiresAtMs: g.expiresAtMs,
        }))
      : [];
    return { health: this.health, entitlements };
  }
}

export const ENTITLEMENT_PRO = "prestige_pro";

export const ENTITLEMENT_REQUIRED = "ENTITLEMENT_REQUIRED";

export type CacheHealth = "ok" | "unverified";

export type EntitlementRecord = {
  entitlement: string;
  expiresAtMs: number | null;
  sourceEventId?: string;
};

export type CustomerEntitlements = {
  customerId: string;
  grants: Map<string, EntitlementRecord>;
};

export type ToolPolicy = {
  /** Tool name → required entitlement id. Absent / null means free. */
  required: Map<string, string>;
};

export type PrincipalBinding = {
  principal: string;
  customerId: string;
};

export type EntitlementErrorBody = {
  code: typeof ENTITLEMENT_REQUIRED;
  entitlement: string;
  upgradeUrl: string;
  tool: string;
};

export type GoldTracEvidenceEvent = {
  schema: "goldtrac.evidence.v1";
  kind: "mcp.authorization" | "mcp.execution";
  ts: string;
  principal_hash: string;
  tool: string;
  decision: "allow" | "deny";
  entitlement?: string;
  webhook_event_id?: string;
  catalog_epoch?: number;
  receipt_hash: string;
};

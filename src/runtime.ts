import { EntitlementCache } from "./cache.ts";
import { EvidenceLog } from "./evidence.ts";
import { bindPrincipal } from "./principal.ts";
import { defaultToolPolicy, UPGRADE_URL_DEFAULT } from "./policy.ts";
import type { PrincipalBinding, ToolPolicy } from "./types.ts";

export type EntitlementRuntime = {
  binding: PrincipalBinding;
  cache: EntitlementCache;
  policy: ToolPolicy;
  evidence: EvidenceLog;
  upgradeUrl: string;
  webhookSecret: string;
  emitToClient: (raw: string) => void;
};

export type RuntimeOptions = {
  principal: string;
  customerId?: string;
  webhookSecret: string;
  upgradeUrl?: string;
  nowMs?: () => number;
  emitToClient?: (raw: string) => void;
  policy?: ToolPolicy;
};

export function createRuntime(options: RuntimeOptions): EntitlementRuntime {
  return {
    binding: bindPrincipal({
      principal: options.principal,
      customerIdOverride: options.customerId,
    }),
    cache: new EntitlementCache(options.nowMs),
    policy: options.policy ?? defaultToolPolicy(),
    evidence: new EvidenceLog(),
    upgradeUrl: options.upgradeUrl ?? UPGRADE_URL_DEFAULT,
    webhookSecret: options.webhookSecret,
    emitToClient: options.emitToClient ?? (() => {}),
  };
}

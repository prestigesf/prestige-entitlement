import { createHash } from "node:crypto";
import { principalHash } from "./principal.ts";
import type { GoldTracEvidenceEvent } from "./types.ts";

/**
 * GoldTrac-compatible evidence event.
 * No payment details, secrets, or raw customer identifiers.
 */
export function makeEvidenceEvent(input: {
  kind: GoldTracEvidenceEvent["kind"];
  principal: string;
  tool: string;
  decision: "allow" | "deny";
  entitlement?: string;
  webhookEventId?: string;
  catalogEpoch?: number;
  ts?: string;
}): GoldTracEvidenceEvent {
  const ts = input.ts ?? new Date().toISOString();
  const unsigned = {
    schema: "goldtrac.evidence.v1" as const,
    kind: input.kind,
    ts,
    principal_hash: principalHash(input.principal),
    tool: input.tool,
    decision: input.decision,
    entitlement: input.entitlement,
    webhook_event_id: input.webhookEventId,
    catalog_epoch: input.catalogEpoch,
  };
  const canonical = JSON.stringify(unsigned);
  const receipt_hash = createHash("sha256").update(canonical).digest("hex");
  return { ...unsigned, receipt_hash };
}

export class EvidenceLog {
  readonly events: GoldTracEvidenceEvent[] = [];

  append(event: GoldTracEvidenceEvent): GoldTracEvidenceEvent {
    this.events.push(event);
    return event;
  }

  record(input: Parameters<typeof makeEvidenceEvent>[0]): GoldTracEvidenceEvent {
    return this.append(makeEvidenceEvent(input));
  }
}

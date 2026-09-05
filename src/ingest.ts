import { parseWebhookBody, applyRevenueCatEvent, type WebhookApplyResult } from "./webhook.ts";
import { verifyRevenueCatWebhook, type HmacVerifyResult } from "./hmac.ts";
import { toolsListChangedNotification } from "./notify.ts";
import type { EntitlementRuntime } from "./runtime.ts";

export type IngestResult = {
  status: number;
  verified: HmacVerifyResult;
  result?: WebhookApplyResult;
  error?: string;
};

/**
 * HMAC-verify then apply. Never JSON.parse before the MAC check.
 */
export function ingestSignedWebhook(
  runtime: EntitlementRuntime,
  rawBody: Buffer,
  signatureHeader: string | undefined,
  nowSec?: number,
): IngestResult {
  const verified = verifyRevenueCatWebhook({
    rawBody,
    signatureHeader,
    secret: runtime.webhookSecret,
    nowSec,
  });
  if (!verified.ok) {
    return { status: 401, verified };
  }

  let body;
  try {
    body = parseWebhookBody(rawBody);
  } catch (err) {
    return { status: 400, verified, error: (err as Error).message };
  }

  const result = applyRevenueCatEvent(runtime.cache, body);
  if (result.changed) {
    runtime.emitToClient(toolsListChangedNotification());
  }
  return { status: 200, verified, result };
}

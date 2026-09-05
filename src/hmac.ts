import { createHmac, timingSafeEqual } from "node:crypto";

/** Default replay window. Covers clock skew + this POST, not retry delays. */
export const HMAC_TOLERANCE_SEC = 300;

export const SIGNATURE_HEADER = "x-revenuecat-webhook-signature";

export type HmacVerifyOk = { ok: true; timestamp: number };
export type HmacVerifyFail = {
  ok: false;
  reason:
    | "missing_header"
    | "malformed_signature_header"
    | "bad_mac"
    | "timestamp_out_of_tolerance";
};
export type HmacVerifyResult = HmacVerifyOk | HmacVerifyFail;

/**
 * Verify a RevenueCat HMAC webhook signature.
 *
 * Header: `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac_sha256_hex>`
 * MAC over `"<t>." + rawBody` with the integration signing secret.
 * Must use the untouched raw request bytes — never JSON.parse → stringify.
 */
export function verifyRevenueCatWebhook(opts: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
}): HmacVerifyResult {
  const header = opts.signatureHeader?.trim() ?? "";
  if (!header) return { ok: false, reason: "missing_header" };

  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const idx = piece.indexOf("=");
    if (idx <= 0) continue;
    parts[piece.slice(0, idx).trim()] = piece.slice(idx + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t) || !/^[0-9a-f]+$/i.test(v1)) {
    return { ok: false, reason: "malformed_signature_header" };
  }

  const signed = Buffer.concat([Buffer.from(`${t}.`), opts.rawBody]);
  const computed = createHmac("sha256", opts.secret).update(signed).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(v1.toLowerCase(), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_mac" };
  }

  const ts = Number(t);
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSec ?? HMAC_TOLERANCE_SEC;
  if (Math.abs(now - ts) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }
  return { ok: true, timestamp: ts };
}

/** Test/sandbox helper. Production signing is done by RevenueCat. */
export function signRevenueCatWebhook(
  secret: string,
  rawBody: Buffer,
  timestampSec: number,
): string {
  const signed = Buffer.concat([Buffer.from(`${timestampSec}.`), rawBody]);
  const v1 = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${timestampSec},v1=${v1}`;
}

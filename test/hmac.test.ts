import assert from "node:assert/strict";
import { test } from "node:test";
import {
  signRevenueCatWebhook,
  verifyRevenueCatWebhook,
} from "../src/hmac.ts";
import { SANDBOX_WEBHOOK_SECRET } from "../src/fixtures.ts";

test("HMAC verifies raw body and rejects re-serialized JSON", () => {
  const raw = Buffer.from('{"event":{"id":"evt_1","type":"TEST"}}', "utf8");
  const ts = 1_700_000_000;
  const header = signRevenueCatWebhook(SANDBOX_WEBHOOK_SECRET, raw, ts);
  const ok = verifyRevenueCatWebhook({
    rawBody: raw,
    signatureHeader: header,
    secret: SANDBOX_WEBHOOK_SECRET,
    nowSec: ts,
  });
  assert.equal(ok.ok, true);

  const reserialized = Buffer.from(JSON.stringify(JSON.parse(raw.toString("utf8"))));
  const bad = verifyRevenueCatWebhook({
    rawBody: reserialized,
    signatureHeader: header,
    secret: SANDBOX_WEBHOOK_SECRET,
    nowSec: ts,
  });
  // Compact JSON happens to match here; force a whitespace change.
  const spaced = Buffer.from('{ "event": { "id": "evt_1", "type": "TEST" } }', "utf8");
  const spacedBad = verifyRevenueCatWebhook({
    rawBody: spaced,
    signatureHeader: header,
    secret: SANDBOX_WEBHOOK_SECRET,
    nowSec: ts,
  });
  assert.equal(spacedBad.ok, false);
  if (!spacedBad.ok) assert.equal(spacedBad.reason, "bad_mac");
  void bad;
});

test("timestamp outside 300s is replay-rejected", () => {
  const raw = Buffer.from("{}", "utf8");
  const ts = 1_700_000_000;
  const header = signRevenueCatWebhook(SANDBOX_WEBHOOK_SECRET, raw, ts);
  const stale = verifyRevenueCatWebhook({
    rawBody: raw,
    signatureHeader: header,
    secret: SANDBOX_WEBHOOK_SECRET,
    nowSec: ts + 301,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, "timestamp_out_of_tolerance");
});

test("verifier matches RevenueCat published Python example (independent golden vector)", () => {
  // Official docs compute: HMAC-SHA256(secret, f"{t}.".encode() + raw_body).hexdigest()
  // Vector produced with that exact snippet, not with signRevenueCatWebhook.
  const raw = Buffer.from(
    '{"api_version":"1.0","event":{"id":"evt_vector","type":"TEST"}}',
    "utf8",
  );
  const header =
    "t=1700000000,v1=1fbc0b37e8cf221a6698293164a958cfc3b161d88dd862ecd7f547f35d2c8a34";
  const ok = verifyRevenueCatWebhook({
    rawBody: raw,
    signatureHeader: header,
    secret: SANDBOX_WEBHOOK_SECRET,
    nowSec: 1_700_000_000,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.timestamp, 1_700_000_000);

  const signed = signRevenueCatWebhook(SANDBOX_WEBHOOK_SECRET, raw, 1_700_000_000);
  assert.equal(signed, header);
});

test("missing or malformed header fails closed", () => {
  const raw = Buffer.from("{}", "utf8");
  const missing = verifyRevenueCatWebhook({
    rawBody: raw,
    signatureHeader: undefined,
    secret: SANDBOX_WEBHOOK_SECRET,
    nowSec: 1,
  });
  assert.equal(missing.ok, false);
  const malformed = verifyRevenueCatWebhook({
    rawBody: raw,
    signatureHeader: "nope",
    secret: SANDBOX_WEBHOOK_SECRET,
    nowSec: 1,
  });
  assert.equal(malformed.ok, false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { EntitlementSession, isLockedTool, toolNames } from "../src/session.ts";
import { purchaseWebhook } from "../src/fixtures.ts";

test("signed webhook grants prestige_pro and emits tools/list_changed", async () => {
  const session = new EntitlementSession({ fixture: "webhook-update" });
  const before = await session.list();
  assert.equal(isLockedTool(before, "goldtrac_trace"), true);

  const ingest = session.grantViaSignedPurchase("evt_webhook_1");
  assert.equal(ingest.status, 200);
  assert.equal(ingest.result?.duplicate, false);
  assert.equal(ingest.result?.changed, true);
  assert.equal(
    session.notifications.some((n) => n.includes("notifications/tools/list_changed")),
    true,
  );

  const after = await session.list();
  assert.equal(toolNames(after).includes("goldtrac_trace"), true);
  assert.equal(isLockedTool(after, "goldtrac_trace"), false);
});

test("event-id retries are idempotent", () => {
  const session = new EntitlementSession({ fixture: "free" });
  const body = purchaseWebhook({ eventId: "evt_same" });
  const first = session.webhook(body);
  const second = session.webhook(body);
  assert.equal(first.result?.changed, true);
  assert.equal(second.result?.duplicate, true);
  assert.equal(second.result?.changed, false);
});

test("bad HMAC does not mutate the cache", () => {
  const session = new EntitlementSession({ fixture: "free" });
  const body = purchaseWebhook({ eventId: "evt_tamper" });
  const ingest = session.webhook(body, { tamper: true });
  assert.equal(ingest.status, 401);
  assert.equal(
    session.runtime.cache.hasActive(session.runtime.binding.customerId, "prestige_pro"),
    false,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { EntitlementSession } from "../src/session.ts";

test("GoldTrac evidence has no secrets, payment details, or raw principal", async () => {
  const session = new EntitlementSession({ fixture: "free" });
  await session.call("echo", { text: "x" });
  await session.call("goldtrac_trace", { note: "blocked" });
  session.grantViaSignedPurchase("evt_evidence");
  await session.call("goldtrac_trace", { note: "allowed" });

  const blob = JSON.stringify(session.runtime.evidence.events);
  assert.equal(blob.includes(session.runtime.webhookSecret), false);
  assert.equal(blob.includes(session.runtime.binding.principal), false);
  assert.equal(blob.includes("sk_"), false);
  assert.equal(blob.includes("whsec_"), false);
  for (const event of session.runtime.evidence.events) {
    assert.equal(event.schema, "goldtrac.evidence.v1");
    assert.match(event.principal_hash, /^[0-9a-f]{64}$/);
    assert.match(event.receipt_hash, /^[0-9a-f]{64}$/);
  }
  assert.equal(
    session.runtime.evidence.events.some(
      (e) => e.kind === "mcp.execution" && e.tool === "goldtrac_trace",
    ),
    true,
  );
});

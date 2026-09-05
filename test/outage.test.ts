import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EntitlementSession,
  structured,
  upstreamCalled,
} from "../src/session.ts";
import { ENTITLEMENT_REQUIRED } from "../src/types.ts";

test("RevenueCat outage: free tools stay up, premium fails closed", async () => {
  const session = new EntitlementSession({ fixture: "outage" });
  const echo = await session.call("echo", { text: "still-here" });
  assert.equal(
    (echo.result as { content: { text: string }[] }).content[0]?.text,
    "still-here",
  );
  assert.equal(upstreamCalled(session, "echo"), true);

  session.upstream.length = 0;
  const premium = await session.call("goldtrac_trace", { note: "outage" });
  assert.equal(structured(premium)?.code, ENTITLEMENT_REQUIRED);
  assert.equal(upstreamCalled(session, "goldtrac_trace"), false);
});
